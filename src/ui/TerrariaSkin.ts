// Fork: globale "Terraria-Optik" für die DOM-Oberfläche.
//  1) Jeder Text, der in der Projekt-Pixelschrift ("Fusion Pixel") gesetzt ist, wird
//     zusätzlich in Terrarias eigener Schrift (Mouse_Text / Death_Text, lokal aus der
//     Steam-Installation extrahiert) gezeichnet: Der echte Text bleibt im DOM (Layout,
//     textContent, Barrierefreiheit unverändert) und wird nur unsichtbar gemacht
//     (-webkit-text-fill-color: transparent); ein ::after-Overlay zeigt das Bitmap.
//  2) Hart kodierte chinesische Texte werden zur Laufzeit übersetzt (forkZhDict).
// Ohne extrahierte Schrift bleibt (1) aus — (2) läuft trotzdem.
import { loadTerrariaFont, type TerrariaFont } from './TerrariaFont';
import { translateZh, hasCjk, setZhTargetLanguage, setZhPassthrough } from '../i18n/forkZhDict';
import { Lang } from '../i18n/Lang';

const SKIN = 'tt-skin';
const CSS = `
/* Fork: Speicher-Statuszeile der Weltauswahl gibt es im Original nicht */
.sw-vsel-storage { display: none !important; }
.${SKIN} { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
.${SKIN}::after { content: ''; position: absolute; left: 0; top: 0; pointer-events: none;
  width: var(--tt-w); height: var(--tt-h); transform: translate(var(--tt-x), var(--tt-y));
  background: var(--tt-img) 0 0 / 100% 100% no-repeat; }
`;

interface SkinState { shadow: boolean; key: string; madeRelative: boolean }
const state = new WeakMap<HTMLElement, SkinState>();
const skipped = new WeakSet<HTMLElement>();
let mouse: TerrariaFont | null = null;
let death: TerrariaFont | null = null;
const urlCache = new Map<string, string>();
const dirty = new Set<HTMLElement>();
let raf = 0;
let ro: ResizeObserver | null = null;

function isCandidate(el: HTMLElement): boolean {
  if (skipped.has(el)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION' || tag === 'SCRIPT'
    || tag === 'STYLE' || tag === 'CANVAS' || el.isContentEditable) return false;
  let hasText = false;
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if ((n.nodeValue ?? '').trim()) hasText = true; }
    else if (n.nodeType === 1 && (n as Element).tagName !== 'BR') return false;
  }
  if (!hasText) return false;
  const cs = getComputedStyle(el);
  // Pixelschrift des Projekts oder die geerbte Body-Schrift ("Segoe UI", …) der Spiel-HUD
  if (!/Fusion Pixel|Segoe UI/i.test(cs.fontFamily) && !el.closest('.sw-vinv, .sw-root')) return false;
  const after = getComputedStyle(el, '::after').content;
  if (after && after !== 'none' && after !== 'normal' && !el.classList.contains(SKIN)) { skipped.add(el); return false; }
  return true;
}

function wrapWords(font: TerrariaFont, text: string, scale: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (line.trim() && font.measure(next.trimEnd()) * scale > maxW) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

const NO_TOUCH = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
const pending = new WeakSet<HTMLElement>();

function render(el: HTMLElement): void {
  if (!el.isConnected || NO_TOUCH.has(el.tagName)) return;
  // Chinesisch → Übersetzung (verändert den Textknoten; Observer feuert, Text ist dann CJK-frei)
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.nodeValue && hasCjk(n.nodeValue)) {
      const t = translateZh(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }
  if (!mouse || !death) return;
  if (!state.has(el) && !isCandidate(el)) return;
  const text = (el.innerText || el.textContent || '').replace(/ /g, ' ').trim();
  const rect = el.getBoundingClientRect();
  if (!text) return;
  if (rect.width < 1 || rect.height < 1) {
    // noch unsichtbar (display:none-Container) → beobachten, Größenänderung rendert nach
    if (!pending.has(el)) { pending.add(el); ro?.observe(el); }
    return;
  }
  const cs = getComputedStyle(el);
  let st = state.get(el);
  if (!st) {
    const madeRelative = cs.position === 'static';
    if (madeRelative) el.style.position = 'relative';
    st = { shadow: cs.textShadow !== 'none' && cs.textShadow !== '', key: '', madeRelative };
    state.set(el, st);
    ro?.observe(el);
  }
  const fontPx = parseFloat(cs.fontSize) || 14;
  const big = fontPx >= 21;
  const font = big ? death : mouse;
  // Zeichen ohne Glyphe (z. B. CJK-Sprachnamen) → Originalschrift behalten
  if (!font.covers(text)) {
    if (el.classList.contains(SKIN)) el.classList.remove(SKIN);
    return;
  }
  let scale = big ? fontPx / 44 : fontPx / 17.5;
  // Textfläche = Content-Box relativ zur Border-Box (das ::after liegt an der Padding-Box)
  const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
  const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
  const inline = cs.display === 'inline';
  const boxW = inline ? rect.width : el.clientWidth, boxH = inline ? rect.height : el.clientHeight;
  const contentW = Math.max(1, boxW - pl - pr);
  // Lage des echten Texts (Zeilenboxen) — darauf wird das Bitmap ausgerichtet
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const textTop = rects.length ? Math.min(...rects.map((r) => r.top)) - rect.top - bt : pt;
  const textBottom = rects.length ? Math.max(...rects.map((r) => r.bottom)) - rect.top - bt : boxH - pb;
  const textLeft = rects.length ? Math.min(...rects.map((r) => r.left)) - rect.left - bl : pl;
  const textRight = rects.length ? Math.max(...rects.map((r) => r.right)) - rect.left - bl : boxW - pr;
  const multi = rects.length > 1 && cs.whiteSpace !== 'nowrap' && cs.whiteSpace !== 'pre';
  let lines = multi ? wrapWords(font, text, scale, contentW) : [text.replace(/\s*\n\s*/g, ' ')];
  // Einzeilig zu breit → wie im Original herunterskalieren
  if (!multi) {
    const w = font.measure(lines[0]) * scale;
    const avail = inline ? Math.max(contentW, textRight - textLeft) : contentW;
    if (w > avail && avail > 4) scale *= avail / w;
  }
  // Zeilenabstand: CSS-Zeilenhöhe (Terraria-lineSpacing ist deutlich größer)
  const cssLineH = rects.length ? (textBottom - textTop) / Math.max(1, rects.length) : font.lineSpacing * scale;
  const lineH = multi ? Math.min(font.lineSpacing * scale, Math.max(cssLineH, fontPx * 1.15)) : font.lineSpacing * scale;
  const border = st.shadow ? Math.max(1, Math.round(2 * scale * (big ? 0.6 : 1.1))) : 0;
  const align = cs.textAlign;
  const color = cs.color;
  const key = `${lines.join('\n')}|${big}|${scale.toFixed(3)}|${color}|${border}|${align}|${contentW}`;
  // Zeichnen
  const widths = lines.map((l) => font.measure(l) * scale);
  const blockW = Math.ceil(Math.max(...widths) + border * 2);
  const blockH = Math.ceil(lineH * lines.length + border * 2);
  let url = urlCache.get(key);
  if (!url) {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(blockW * dpr));
    cv.height = Math.max(1, Math.round(blockH * dpr));
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(dpr, dpr);
    lines.forEach((l, i) => {
      const lx = align === 'center' ? (blockW - widths[i]) / 2 : (align === 'right' || align === 'end') ? blockW - border - widths[i] : border;
      const ly = border + i * lineH;
      if (border) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) font.draw(ctx, l, lx + dx * border, ly + dy * border, scale, '#000');
      font.draw(ctx, l, lx, ly, scale, color);
    });
    url = cv.toDataURL();
    if (urlCache.size > 1500) urlCache.clear();
    urlCache.set(key, url);
  }
  // Position: horizontal nach text-align im Textbereich, vertikal auf die Textmitte
  let x: number;
  if (align === 'center') x = (textLeft + textRight) / 2 - blockW / 2;
  else if (align === 'right' || align === 'end') x = textRight - blockW + border;
  else x = textLeft - border;
  const y = (textTop + textBottom) / 2 - blockH / 2 + lineH * 0.08;
  const s = el.style;
  s.setProperty('--tt-img', `url(${url})`);
  s.setProperty('--tt-w', `${blockW}px`);
  s.setProperty('--tt-h', `${blockH}px`);
  s.setProperty('--tt-x', `${Math.round(x)}px`);
  s.setProperty('--tt-y', `${Math.round(y)}px`);
  st.key = key;
  if (!el.classList.contains(SKIN)) el.classList.add(SKIN);
}

function schedule(el: HTMLElement): void {
  dirty.add(el);
  if (!raf) raf = requestAnimationFrame(flush);
}
function flush(): void {
  raf = 0;
  const list = [...dirty];
  dirty.clear();
  for (const el of list) {
    try { render(el); } catch { /* einzelnes Element darf die UI nicht stören */ }
  }
}

function scanTree(root: Node): void {
  if (root.nodeType === 3) { const p = root.parentElement; if (p) schedule(p); return; }
  if (root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (p && (n.nodeValue ?? '').trim()) schedule(p);
  }
}

function rerenderSkinnedIn(root: Element): void {
  if (root instanceof HTMLElement && state.has(root)) schedule(root);
  root.querySelectorAll<HTMLElement>(`.${SKIN}`).forEach(schedule);
}

/** Canvas-Text: Chinesisch übersetzen + Pixelschrift ("Fusion Pixel") durch Terraria-Bitmap ersetzen */
let scratch: HTMLCanvasElement | null = null;
const FONT_PX = /(\d+(?:\.\d+)?)px/;
function bitmapFor(ctx: CanvasRenderingContext2D, text: string): { font: TerrariaFont; px: number; scale: number } | null {
  if (!mouse || !death) return null;
  const f = ctx.font;
  if (!f.includes('Fusion Pixel')) return null;   // nur die Projekt-Pixelschrift ersetzen
  const px = Number(FONT_PX.exec(f)?.[1] ?? 0);
  if (!px) return null;
  const big = px >= 21;
  const font = big ? death : mouse;
  if (!font.covers(text)) return null;
  return { font, px, scale: big ? px / 44 : px / 17.5 };
}
function baselineShift(tb: CanvasTextBaseline, px: number): number {
  const asc = px * 0.8;
  switch (tb) {
    case 'top': return asc;
    case 'hanging': return asc * 0.8;
    case 'middle': return asc - px * 0.5;
    case 'bottom': case 'ideographic': return -px * 0.2;
    default: return 0;
  }
}
function drawBitmapText(ctx: CanvasRenderingContext2D, b: { font: TerrariaFont; scale: number; px: number },
  text: string, x: number, y: number, color: string, maxWidth?: number): void {
  let scale = b.scale;
  let w = b.font.measure(text) * scale;
  if (maxWidth !== undefined && maxWidth > 0 && w > maxWidth) { scale *= maxWidth / w; w = maxWidth; }
  const h = b.font.lineSpacing * scale;
  const al = ctx.textAlign;
  if (al === 'center') x -= w / 2;
  else if (al === 'right' || (al === 'end' && ctx.direction !== 'rtl')) x -= w;
  const top = y + baselineShift(ctx.textBaseline, b.px) - b.font.baseline * scale;
  const m = ctx.getTransform();
  const k = Math.max(1, Math.min(4, Math.hypot(m.a, m.b)));
  const cw = Math.max(1, Math.ceil(w * k) + 2), ch = Math.max(1, Math.ceil(h * k) + 2);
  scratch ??= document.createElement('canvas');
  if (scratch.width < cw || scratch.height < ch) { scratch.width = Math.max(scratch.width, cw); scratch.height = Math.max(scratch.height, ch); }
  const sc = scratch.getContext('2d')!;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = 'source-over';
  sc.clearRect(0, 0, cw, ch);
  sc.imageSmoothingEnabled = true;
  b.font.draw(sc, text, 0, 0, scale * k, '#fff');
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = color;
  sc.fillRect(0, 0, cw, ch);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, cw, ch, x, top, cw / k, ch / k);
  ctx.imageSmoothingEnabled = prevSmooth;
}
function patchCanvas(): void {
  patchCanvasProto(CanvasRenderingContext2D.prototype);
  if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
    patchCanvasProto(OffscreenCanvasRenderingContext2D.prototype as unknown as CanvasRenderingContext2D);
  }
}
function patchCanvasProto(P: CanvasRenderingContext2D): void {
  const origFill = P.fillText, origStroke = P.strokeText, origMeasure = P.measureText;
  P.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    const t = typeof text === 'string' && hasCjk(text) ? translateZh(text) : text;
    if (typeof t === 'string' && typeof this.fillStyle === 'string') {
      const b = bitmapFor(this, t);
      if (b) { drawBitmapText(this, b, t, x, y, this.fillStyle, maxWidth); return; }
    }
    return maxWidth === undefined ? origFill.call(this, t, x, y) : origFill.call(this, t, x, y, maxWidth);
  };
  P.strokeText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
    const t = typeof text === 'string' && hasCjk(text) ? translateZh(text) : text;
    if (typeof t === 'string' && typeof this.strokeStyle === 'string') {
      const b = bitmapFor(this, t);
      if (b) {
        const d = Math.max(1, this.lineWidth / 2);
        for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d]]) drawBitmapText(this, b, t, x + dx, y + dy, this.strokeStyle, maxWidth);
        return;
      }
    }
    return maxWidth === undefined ? origStroke.call(this, t, x, y) : origStroke.call(this, t, x, y, maxWidth);
  };
  P.measureText = function (this: CanvasRenderingContext2D, text: string) {
    const t = typeof text === 'string' && hasCjk(text) ? translateZh(text) : text;
    const b = typeof t === 'string' ? bitmapFor(this, t) : null;
    if (!b) return origMeasure.call(this, t);
    const w = b.font.measure(t) * b.scale;
    const asc = b.px * 0.8, desc = b.px * 0.2;
    const shift = baselineShift(this.textBaseline, b.px);
    const left = this.textAlign === 'center' ? w / 2 : (this.textAlign === 'right' || this.textAlign === 'end') ? w : 0;
    return {
      width: w,
      actualBoundingBoxLeft: left, actualBoundingBoxRight: w - left,
      actualBoundingBoxAscent: asc * 0.92 - shift, actualBoundingBoxDescent: desc + shift,
      fontBoundingBoxAscent: asc - shift, fontBoundingBoxDescent: desc + shift,
      emHeightAscent: asc - shift, emHeightDescent: desc + shift,
      hangingBaseline: asc * 0.8 - shift, alphabeticBaseline: -shift, ideographicBaseline: -desc - shift,
    } as TextMetrics;
  };
}

let installed = false;
export function installTerrariaSkin(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const syncLang = () => {
    const c = Lang.activeCultureName;
    setZhTargetLanguage(c);
    setZhPassthrough(!!c && c.startsWith('zh'));
  };
  syncLang();
  Lang.onChange(() => { syncLang(); urlCache.clear(); scanTree(document.body); });
  patchCanvas();
  const style = document.createElement('style');
  style.id = 'tt-skin-style';
  style.textContent = CSS;
  document.head.appendChild(style);
  ro = new ResizeObserver((entries) => { for (const e of entries) schedule(e.target as HTMLElement); });
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p) schedule(p); }
      else if (m.type === 'childList') {
        if (m.target instanceof HTMLElement && m.target.childNodes.length) schedule(m.target);
        m.addedNodes.forEach(scanTree);
      } else if (m.type === 'attributes' && m.target instanceof Element) {
        rerenderSkinnedIn(m.target);
      }
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  // Hover-/Aktiv-Farben kommen aus CSS-Pseudoklassen → beim Betreten/Verlassen neu zeichnen
  const onHover = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !(t instanceof HTMLElement)) return;
    if (t.childElementCount < 40) rerenderSkinnedIn(t);
    let n = t.parentElement;
    for (let i = 0; n && i < 3; i++, n = n.parentElement) if (state.has(n)) schedule(n);
  };
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('mouseout', onHover, true);
  document.addEventListener('mousedown', onHover, true);
  document.addEventListener('mouseup', onHover, true);
  scanTree(document.body);
  void Promise.all([loadTerrariaFont('Mouse_Text'), loadTerrariaFont('Death_Text')]).then(([m, d]) => {
    if (!m || !d) return;
    mouse = m; death = d;
    scanTree(document.body);
  });
}
