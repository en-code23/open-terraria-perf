// Bitmap renderer for Terraria's own DynamicSpriteFont pages (Death_Text / Mouse_Text).
// The font files are NOT part of the repo: `node scripts/extract-local-fonts.mjs`
// pulls them from the player's own Steam install into public/sprites/local/fonts/.
// Missing files → loadTerrariaFont resolves null and callers keep their CSS text.
//
// Glyph layout (XNA SpriteFont.Draw semantics, same as CombatTextFont.ts):
//   x += kerning.x → draw glyph rect at (x + crop.x, crop.y) → x += kerning.y + kerning.z + spacing

export type TerrariaFontName = 'Death_Text' | 'Mouse_Text';

interface PageJson {
  texture: string;
  characters: number[];
  glyphs: number[][];
  cropping: number[][];
  kerning: number[][];
}
interface FontJson { spacing: number; lineSpacing: number; defaultCharacter: number; pages: PageJson[] }

interface Glyph { img: number; g: number[]; c: number[]; k: number[] }

export class TerrariaFont {
  readonly lineSpacing: number;
  private readonly spacing: number;
  private readonly map = new Map<number, Glyph>();
  private readonly fallback: Glyph | undefined;
  /** tinted copies of each page, keyed by `${page}|${css colour}` */
  private readonly tints = new Map<string, HTMLCanvasElement>();

  constructor(json: FontJson, private readonly images: HTMLImageElement[]) {
    this.lineSpacing = json.lineSpacing;
    this.spacing = json.spacing;
    json.pages.forEach((p, img) => {
      p.characters.forEach((cp, i) => {
        if (!this.map.has(cp)) this.map.set(cp, { img, g: p.glyphs[i], c: p.cropping[i], k: p.kerning[i] });
      });
    });
    this.fallback = this.map.get(json.defaultCharacter) ?? this.map.get(63 /* ? */);
  }

  private glyph(cp: number): Glyph | undefined { return this.map.get(cp) ?? this.fallback; }

  /** Grundlinie in Font-Einheiten (Unterkante von 'H') */
  get baseline(): number {
    const h = this.map.get(72);
    return h ? h.c[1] + h.g[3] : this.lineSpacing * 0.7;
  }

  /** true, wenn jedes Zeichen (außer Leerraum) eine Glyphe hat */
  covers(text: string): boolean {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 32 || cp === 0xa0) continue;
      if (!this.map.has(cp)) return false;
    }
    return true;
  }

  /** Unscaled advance width of a single line. */
  measure(text: string): number {
    let x = 0, maxX = 0;
    for (const ch of text) {
      const gl = this.glyph(ch.codePointAt(0)!);
      if (!gl) continue;
      x += gl.k[0];
      maxX = Math.max(maxX, x + gl.c[0] + gl.g[2]);
      x += gl.k[1] + gl.k[2] + this.spacing;
    }
    return Math.max(x, maxX);
  }

  private tinted(page: number, color: string): HTMLCanvasElement {
    const key = `${page}|${color}`;
    let cv = this.tints.get(key);
    if (cv) return cv;
    const src = this.images[page];
    cv = document.createElement('canvas');
    cv.width = src.naturalWidth; cv.height = src.naturalHeight;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cv.width, cv.height);
    this.tints.set(key, cv);
    return cv;
  }

  /** Draws one line with its top-left at (x, y), in canvas units, at `scale`. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string): void {
    let pen = 0;
    for (const ch of text) {
      const gl = this.glyph(ch.codePointAt(0)!);
      if (!gl) continue;
      pen += gl.k[0];
      const [gx, gy, gw, gh] = gl.g;
      if (gw > 0 && gh > 0) {
        ctx.drawImage(this.tinted(gl.img, color), gx, gy, gw, gh,
          x + (pen + gl.c[0]) * scale, y + gl.c[1] * scale, gw * scale, gh * scale);
      }
      pen += gl.k[1] + gl.k[2] + this.spacing;
    }
  }

  /**
   * Renders text the way Terraria's menu does: four black copies offset by
   * `border` px (left/right/up/down), then the coloured text on top.
   * Returns a canvas sized in CSS px (backing store scaled by devicePixelRatio).
   */
  render(text: string, opts: { scale: number; color: string; border?: number; borderColor?: string }): HTMLCanvasElement {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const border = opts.border ?? 2;
    const w = Math.ceil(this.measure(text) * opts.scale + border * 2);
    const h = Math.ceil(this.lineSpacing * opts.scale + border * 2);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(dpr, dpr);
    const s = opts.scale;
    if (border > 0) {
      const bc = opts.borderColor ?? '#000';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        this.draw(ctx, text, border + dx * border, border + dy * border, s, bc);
      }
    }
    this.draw(ctx, text, border, border, s, opts.color);
    return cv;
  }
}

const cache = new Map<TerrariaFontName, Promise<TerrariaFont | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`font page ${src}`));
    img.src = src;
  });
}

/** Loads a locally extracted Terraria font; resolves null when it is not installed. */
export function loadTerrariaFont(name: TerrariaFontName): Promise<TerrariaFont | null> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`sprites/local/fonts/${name}.json`);
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
        const json = (await res.json()) as FontJson;
        const imgs = await Promise.all(json.pages.map((pg) => loadImage(`sprites/local/fonts/${pg.texture}`)));
        return new TerrariaFont(json, imgs);
      } catch {
        return null;
      }
    })();
    cache.set(name, p);
  }
  return p;
}
