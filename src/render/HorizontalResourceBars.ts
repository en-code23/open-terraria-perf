// Fork: Lebens-/Manaleiste als waagerechte Balken („Leisten“, wie in der Mobil-App).
// Nachbau von HorizontalBarsPlayerResourcesDisplaySet (Terraria 1.4.4+):
//   Leben:  Anker (sw-300-22+16, 18), Segmente Panel_Left | HP_Panel_Middle×n | HP_Panel_Right(-16,-10),
//           rechtsbündig (fehlende Segmente bis 20 rücken den Anfang nach rechts),
//           Füllung HP_Fill ab +(6,6), leert sich von links (FillBarByValues).
//   Mana:   Anker (sw-300-22+16-10, 18+24), MP_Panel_Right(-16,-6), sonst gleich.
import type { Player } from '../entities/Player';
import type { FlickerClock } from '../lighting/SkyColor';
import { lateImageRetry } from '../assets/lateImageRetry';

const NAMES = {
  left: 'UI_PlayerResourceSets_HorizontalBars_Panel_Left',
  hpMid: 'UI_PlayerResourceSets_HorizontalBars_HP_Panel_Middle',
  hpRight: 'UI_PlayerResourceSets_HorizontalBars_HP_Panel_Right',
  hpFill: 'UI_PlayerResourceSets_HorizontalBars_HP_Fill',
  hpHoney: 'UI_PlayerResourceSets_HorizontalBars_HP_Fill_Honey',
  mpMid: 'UI_PlayerResourceSets_HorizontalBars_MP_Panel_Middle',
  mpRight: 'UI_PlayerResourceSets_HorizontalBars_MP_Panel_Right',
  mpFill: 'UI_PlayerResourceSets_HorizontalBars_MP_Fill',
} as const;
type Key = keyof typeof NAMES;

const MAX_SEGMENTS = 20;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerpValue = (a: number, b: number, x: number) => (b === a ? 0 : clamp((x - a) / (b - a), 0, 1));

export class HorizontalResourceBars {
  private t = {} as Record<Key, HTMLImageElement>;

  constructor() {
    for (const k of Object.keys(NAMES) as Key[]) {
      const img = new Image();
      const src = `sprites/vanilla-ui/${NAMES[k]}.png`;
      img.src = src;
      lateImageRetry(img, src);
      this.t[k] = img;
    }
  }

  private ready(): boolean {
    return (Object.keys(this.t) as Key[]).every((k) => this.t[k].complete && this.t[k].naturalWidth > 0);
  }

  /** Füllung eines Segments: von links geleert (Quelle rechts beschnitten → links eingerückt) */
  private fill(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number,
    idx: number, count: number, pct: number): void {
    const step = 1 / count;
    const emptied = lerpValue(step * idx, step * (idx + 1), 1 - pct);
    const cut = Math.floor(img.width * emptied);
    if (cut >= img.width) return;
    ctx.drawImage(img, cut, 0, img.width - cut, img.height, x + cut, y, img.width - cut, img.height);
  }

  private row(ctx: CanvasRenderingContext2D, ax: number, ay: number, segs: number,
    mid: HTMLImageElement, right: HTMLImageElement, rightOff: [number, number],
    fillImg: (i: number) => HTMLImageElement, pct: number): void {
    if (segs <= 0) return;
    let x = ax + (MAX_SEGMENTS - segs) * mid.width;
    const x0 = x;
    // Rahmen: Left, Middle×segs, Right
    ctx.drawImage(this.t.left, Math.round(x), Math.round(ay));
    x += this.t.left.width;
    for (let i = 0; i < segs; i++) { ctx.drawImage(mid, Math.round(x), Math.round(ay)); x += mid.width; }
    ctx.drawImage(right, Math.round(x + rightOff[0]), Math.round(ay + rightOff[1]));
    // Füllung
    let fx = x0 + 6;
    for (let i = 0; i < segs; i++) {
      const img = fillImg(i);
      this.fill(ctx, img, Math.round(fx), Math.round(ay + 6), i, segs, pct);
      fx += img.width;
    }
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, viewW: number, _flicker: FlickerClock | null): void {
    if (!this.ready()) return;
    // PlayerStatsSnapshot (wie FancyResourceBars)
    let lifePerSegment = 20;
    let num2 = Math.floor(p.baseMaxHp / 20);
    const fruit = Math.max(0, Math.floor((p.baseMaxHp - 400) / 5));
    if (fruit > 0) {
      num2 = Math.floor(p.baseMaxHp / (20 + Math.floor(fruit / 4)));
      lifePerSegment = p.baseMaxHp / 20;
    }
    const bonus = p.maxHp - p.baseMaxHp;
    if (num2 > 0) lifePerSegment += Math.floor(bonus / num2);
    const hpSegs = clamp(Math.floor(p.maxHp / lifePerSegment), 0, MAX_SEGMENTS);
    const mpSegs = clamp(Math.floor(p.maxMana / 20), 0, MAX_SEGMENTS);
    const hpPct = p.maxHp > 0 ? clamp(p.hp / p.maxHp, 0, 1) : 0;
    const mpPct = p.maxMana > 0 ? clamp(p.mana / p.maxMana, 0, 1) : 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const baseX = viewW - 300 - 22 + 16, baseY = 18;
    this.row(ctx, baseX, baseY, hpSegs, this.t.hpMid, this.t.hpRight, [-16, -10],
      (i) => (i < fruit ? this.t.hpHoney : this.t.hpFill), hpPct);
    if (p.maxMana > 0 && !p.dead) {
      this.row(ctx, baseX - 10, baseY + 24, mpSegs, this.t.mpMid, this.t.mpRight, [-16, -6],
        () => this.t.mpFill, mpPct);
    }
    ctx.restore();
  }
}
