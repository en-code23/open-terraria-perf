// 移动端虚拟控件层 v2.1（mobile-adaptation-plan docs/mobile-adaptation-plan.md 模块②;
// 2026-08-29 用户定案:控件效果对齐【官方 Terraria 手游截图】——固定罗盘摇杆+
// 底部动作小钮横排+右下跳跃/使用双大钮+统一深蓝半透明像素皮肤）。
// 触屏设备启用；桌面零渲染零影响（coarse 总闸）。
// 设计原则（对 PC 操作零侵入）：
//  - 摇杆/跳跃等持续态 = input.setVirtualAction(action 电平)：用户重绑即时跟随；
//    边沿动作（背包/暂停/全图/聊天/旅程）= input.tapVirtual 经 Keybinds 表与
//    Esc 主链派发(origin='virtual')，物理键盘路径零改动；
//  - 世界区域触摸仍由 Input 自身合成（点击=左键、拖动=瞄准、长按=右键交互），
//    本层控件 touchstart 均 stopPropagation+preventDefault，不落世界层；
//  - "使用"大钮实时显示当前手持物品 sprite(iconUrl 同源 dataURL),空手回退准星;
//    智能光标开关在底部动作排,点亮态即智能光标开启(官方手游同形)。
import type { Game } from '../core/Game';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { TILE_DEFS } from '../data/tiles';
import { TownNPC } from '../entities/TownNPC';
import { itemFuncOfVid } from '../data/vanillaItemFunc';

import { Lang } from '../i18n/Lang';
import { options } from '../core/Options';
import { bindsOf, type KeybindAction } from '../core/Keybinds';
import { isTouchDevice } from '../core/input/touchDevice';
import { hudTier } from './HudScale';
import { iconUrl } from './UI';

/** 触屏会话判定·单一来源(core/input/touchDevice;此处 re-export 保持
 *  mainFlow/VUI 既有 import 路径不破) */
export { isTouchDevice };

/** 移动端画布 UI 缩放（小地图/资源条/拍照模式右锚缩放读数；HudScale 档位驱动：
 *  D0/T1=1 桌面 byte 级不变、T2=0.7、T3=0.62）。★操控层按钮不吃本因子——
 *  0.7 会把 ⌀46 压到违规尺寸(44pt 红线)，操控层由 --mbtn-scale 独立控制 */
export { hudTier };

/** 移动端画布 UI 缩放（小地图/资源条/拍照模式右锚缩放读数；HudScale 档位驱动：
 *  D0/T1=1 桌面 byte 级不变、T2=0.7、T3=0.62）。★操控层按钮不吃本因子——
 *  0.7 会把 ⌀46 压到违规尺寸(44pt 红线)，操控层由 --mbtn-scale 独立控制 */
export function mobileUiScale(): number {
  const t = hudTier();
  if (t === 'd0' || t === 't1') return 1;
  return t === 't3' ? 0.62 : 0.7;
}

/** Fork: Platz oben rechts (CSS-px), den die Knöpfe Chat/Minikarte/Karte belegen —
 *  der Renderer schiebt die Lebens-/Manaleiste um so viel nach links */
let hudReserveRight = 0;
export function mobileHudReserveRight(): number { return hudReserveRight; }

const CSS = `
/* Fork: Layout + Look der offiziellen Mobil-App (Terraria iOS/Android, Querformat).
   --u = 1 Layout-Pixel (iPhone-Querformat ≈ 393pt Höhe = 1; iPad größer), × Knopfgröße. */
.sw-mobile { position:fixed; inset:0; pointer-events:none; z-index:150; --u:1px;
  font-family:inherit; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
.sw-mobile > * { pointer-events:auto; }
.sw-mobile.inv .sw-mjoy, .sw-mobile.inv .sw-mjump, .sw-mobile.inv .sw-matk, .sw-mobile.inv .sw-mact { display:none; }
/* ---- Grundformen ---- */
.sw-mbtn, .sw-mjump, .sw-mjoy .knob, .sw-matk .knob { touch-action:none; }
.sw-mround, .sw-mjump, .sw-mjoy .knob, .sw-matk .knob {
  border-radius:50%;
  background:radial-gradient(circle at 50% 32%, #5a76d8 0%, #3a54b4 45%, #283d8e 100%);
  box-shadow:0 0 0 calc(var(--u)*2.5) #131a42, inset 0 0 0 calc(var(--u)*2) rgba(150,180,255,0.55),
    inset 0 calc(var(--u)*-4) 0 rgba(10,18,60,0.35);
}
.sw-mround.green { background:radial-gradient(circle at 50% 32%, #6cc45a 0%, #3f8f35 50%, #2a6424 100%);
  box-shadow:0 0 0 calc(var(--u)*2.5) #10300d, inset 0 0 0 calc(var(--u)*2) rgba(190,255,170,0.45),
    inset 0 calc(var(--u)*-4) 0 rgba(10,40,8,0.35); }
.sw-msq { border-radius:calc(var(--u)*9);
  background:linear-gradient(#34479a, #1f2c6c);
  box-shadow:0 0 0 calc(var(--u)*2.5) #131a42, inset 0 0 0 calc(var(--u)*2) rgba(140,170,255,0.55); }
.sw-mbtn { position:absolute; display:flex; align-items:center; justify-content:center; color:#eef2ff;
  opacity:var(--mbtn-alpha,0.9); }
.sw-mbtn img { width:62%; height:62%; image-rendering:pixelated; pointer-events:none; object-fit:contain;
  filter:drop-shadow(calc(var(--u)*1) 0 0 #10153a) drop-shadow(calc(var(--u)*-1) 0 0 #10153a)
         drop-shadow(0 calc(var(--u)*1) 0 #10153a) drop-shadow(0 calc(var(--u)*-1) 0 #10153a); }
.sw-mbtn img.tex { filter:none; width:66%; height:66%; }
.sw-mbtn.press, .sw-mjump.press { filter:brightness(1.3); transform:scale(0.94); }
.sw-mbtn.off { opacity:calc(var(--mbtn-alpha,0.9)*0.45); filter:grayscale(0.6); }
.sw-mbtn.lit { filter:brightness(1.35); }
.sw-mbtn.on  { box-shadow:0 0 0 calc(var(--u)*2.5) #131a42, inset 0 0 0 calc(var(--u)*3) #ffe14a; }
/* ---- Bewegungs-Stick links: Ring + blauer Knopf mit 4 Pfeilen ---- */
.sw-mjoy { position:absolute; left:calc(var(--u)*108 + env(safe-area-inset-left)); bottom:calc(var(--u)*14 + env(safe-area-inset-bottom));
  width:calc(var(--u)*118); height:calc(var(--u)*118); border-radius:50%;
  background:rgba(40,56,130,0.16); box-shadow:0 0 0 calc(var(--u)*2) rgba(16,22,58,0.75), inset 0 0 0 calc(var(--u)*1.5) rgba(170,190,255,0.25);
  opacity:var(--mbtn-alpha,0.9); }
.sw-mjoy.idle { opacity:calc(var(--mbtn-alpha,0.9)*0.7); }
.sw-mjoy .knob { position:absolute; left:50%; top:50%; width:calc(var(--u)*54); height:calc(var(--u)*54);
  transform:translate(-50%,-50%); display:flex; align-items:center; justify-content:center; }
.sw-mjoy .knob img { width:70%; height:70%; image-rendering:pixelated; pointer-events:none; }
/* ---- Item-/Ziel-Stick rechts: Ring + Knopf mit gehaltenem Item und Fadenkreuz-Strichen ---- */
.sw-matk { position:absolute; right:calc(var(--u)*118 + env(safe-area-inset-right)); bottom:calc(var(--u)*20 + env(safe-area-inset-bottom));
  width:calc(var(--u)*118); height:calc(var(--u)*118); border-radius:50%;
  background:rgba(40,56,130,0.16); box-shadow:0 0 0 calc(var(--u)*2) rgba(16,22,58,0.75), inset 0 0 0 calc(var(--u)*1.5) rgba(170,190,255,0.25);
  opacity:var(--mbtn-alpha,0.9); touch-action:none; }
.sw-matk .knob { position:absolute; left:50%; top:50%; width:calc(var(--u)*56); height:calc(var(--u)*56);
  transform:translate(-50%,-50%); pointer-events:none; }
.sw-matk .knob::before { content:''; position:absolute; inset:0; border-radius:50%;
  background:
    linear-gradient(#dfe6ff,#dfe6ff) 50% calc(var(--u)*3) / calc(var(--u)*2.5) calc(var(--u)*7) no-repeat,
    linear-gradient(#dfe6ff,#dfe6ff) 50% calc(100% - var(--u)*3) / calc(var(--u)*2.5) calc(var(--u)*7) no-repeat,
    linear-gradient(#dfe6ff,#dfe6ff) calc(var(--u)*3) 50% / calc(var(--u)*7) calc(var(--u)*2.5) no-repeat,
    linear-gradient(#dfe6ff,#dfe6ff) calc(100% - var(--u)*3) 50% / calc(var(--u)*7) calc(var(--u)*2.5) no-repeat; }
.sw-matk .face { position:absolute; left:50%; top:50%; width:58%; height:58%; transform:translate(-50%,-50%);
  image-rendering:pixelated; pointer-events:none; object-fit:contain; }
.sw-matk.push .knob { filter:brightness(1.25); }
/* ---- Springen (Doppelpfeil, groß, rechts über dem Stick) ---- */
.sw-mjump { position:absolute; right:calc(var(--u)*58 + env(safe-area-inset-right)); bottom:calc(var(--u)*98 + env(safe-area-inset-bottom));
  width:calc(var(--u)*62); height:calc(var(--u)*62); display:flex; align-items:center; justify-content:center;
  opacity:var(--mbtn-alpha,0.9); }
.sw-mjump img { width:64%; height:64%; image-rendering:pixelated; pointer-events:none;
  filter:drop-shadow(calc(var(--u)*1.5) 0 0 #10153a) drop-shadow(calc(var(--u)*-1.5) 0 0 #10153a)
         drop-shadow(0 calc(var(--u)*1.5) 0 #10153a) drop-shadow(0 calc(var(--u)*-1.5) 0 #10153a); }
/* ---- Aktionsknöpfe (Positionen wie in der App) ---- */
.sw-mact { width:calc(var(--u)*42); height:calc(var(--u)*42); }
.sw-mq   { left:calc(var(--u)*52 + env(safe-area-inset-left)); bottom:calc(var(--u)*118 + env(safe-area-inset-bottom)); width:calc(var(--u)*48); height:calc(var(--u)*48); }
.sw-mhook{ left:calc(var(--u)*50 + env(safe-area-inset-left)); bottom:calc(var(--u)*56 + env(safe-area-inset-bottom)); }
.sw-minv { left:calc(var(--u)*8 + env(safe-area-inset-left)); bottom:calc(var(--u)*6 + env(safe-area-inset-bottom)); width:calc(var(--u)*42); height:calc(var(--u)*42); }
.sw-msmart{ left:calc(var(--u)*64 + env(safe-area-inset-left)); bottom:calc(var(--u)*4 + env(safe-area-inset-bottom)); width:calc(var(--u)*38); height:calc(var(--u)*38); }
.sw-mpot { left:calc(var(--u)*240 + env(safe-area-inset-left)); bottom:calc(var(--u)*6 + env(safe-area-inset-bottom)); }
.sw-mzout{ left:calc(var(--u)*292 + env(safe-area-inset-left)); bottom:calc(var(--u)*8 + env(safe-area-inset-bottom)); width:calc(var(--u)*36); height:calc(var(--u)*36); }
.sw-mzin { right:calc(var(--u)*264 + env(safe-area-inset-right)); bottom:calc(var(--u)*8 + env(safe-area-inset-bottom)); width:calc(var(--u)*36); height:calc(var(--u)*36); }
.sw-mdrop{ right:calc(var(--u)*212 + env(safe-area-inset-right)); bottom:calc(var(--u)*6 + env(safe-area-inset-bottom)); }
.sw-mtalk{ right:calc(var(--u)*222 + env(safe-area-inset-right)); bottom:calc(var(--u)*112 + env(safe-area-inset-bottom)); width:calc(var(--u)*48); height:calc(var(--u)*48); }
.sw-mmount{ right:calc(var(--u)*240 + env(safe-area-inset-right)); bottom:calc(var(--u)*56 + env(safe-area-inset-bottom)); width:calc(var(--u)*38); height:calc(var(--u)*38); }
.sw-mmap { right:calc(var(--u)*60 + env(safe-area-inset-right)); bottom:calc(var(--u)*48 + env(safe-area-inset-bottom)); width:calc(var(--u)*40); height:calc(var(--u)*40); }
.sw-mbuff{ right:calc(var(--u)*62 + env(safe-area-inset-right)); bottom:calc(var(--u)*6 + env(safe-area-inset-bottom)); width:calc(var(--u)*38); height:calc(var(--u)*38); }
.sw-mobile .sw-mpause { right:calc(var(--u)*8 + env(safe-area-inset-right)); bottom:calc(var(--u)*6 + env(safe-area-inset-bottom)); width:calc(var(--u)*42); height:calc(var(--u)*42); }
.sw-mobile.inv .sw-minv { box-shadow:0 0 0 calc(var(--u)*2.5) #131a42, inset 0 0 0 calc(var(--u)*3) #ffe14a; }
/* ---- oben rechts: Chat · Minikarte · Karte (rechts neben den Leisten) ---- */
.sw-msys { position:absolute; display:flex; gap:calc(var(--u)*5); align-items:center;
  right:calc(var(--u)*8 + env(safe-area-inset-right)); top:calc(var(--u)*8 + env(safe-area-inset-top)); }
.sw-msys .sw-mbtn { position:relative; width:calc(var(--u)*34); height:calc(var(--u)*30); border-radius:calc(var(--u)*6); }
.sw-msys .sw-mbtn img.tex { width:78%; height:78%; }
.sw-mact-chat, .sw-mact-journey { display:none !important; }
.sw-mobile.net .sw-mact-chat, .sw-mobile.journey .sw-mact-journey { display:flex !important; }
.sw-mrotate { position:absolute; left:50%; top:calc(42px + env(safe-area-inset-top)); transform:translateX(-50%);
  background:rgba(20,26,52,0.82); color:#ffe8a0; font-size:12px; padding:5px 14px;
  border-radius:8px; border:1px solid #7d92d6; display:none; pointer-events:none; white-space:nowrap; }
@media (orientation: portrait) {
  .sw-mobile .sw-mrotate { display:block; left:calc(8px + env(safe-area-inset-left));
    transform:none; top:calc(118px + env(safe-area-inset-top)); max-width:58vw; }
  /* Hochformat: Knöpfe zwischen den Sticks ausblenden (kein Platz) */
  .sw-mobile .sw-mzin, .sw-mobile .sw-mzout, .sw-mobile .sw-mmount, .sw-mobile .sw-mtalk, .sw-mobile .sw-mdrop { display:none; }
  .sw-mobile .sw-mpot { left:auto; right:calc(var(--u)*8 + env(safe-area-inset-right)); bottom:calc(var(--u)*230 + env(safe-area-inset-bottom)); }
}
`;

/** 像素图标:16×16 字符画('.' 透明 / X 白 / o 半透白)→ run-length rect SVG。
 *  手绘基准=官方手游白色剪影语言(粗实心/高辨识);零贴图零网络请求 */
const ICONS: Record<string, string> = {};
function icon(name: string): string {
  if (!ICONS[name]) {
    const svg = art2svg(PIXEL_ART[name] ?? []);
    ICONS[name] = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return ICONS[name];
}
function art2svg(rows: string[]): string {
  const fills: Record<string, string> = { X: '#f2f5ff', o: 'rgba(242,245,255,0.5)', Y: '#ffd84a', y: '#c99a1c', K: '#10153a' };
  const out: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      out.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fills[ch] ?? '#f2f5ff'}"/>`);
      x += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${out.join('')}</svg>`;
}
const PIXEL_ART: Record<string, string[]> = {
  // Fork: Steuerkreuz auf dem Bewegungs-Stick (4 Pfeile, wie die App)
  dpad: [
    '................',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '................',
    '..X..........X..',
    '.XX..........XX.',
    'XXX..........XXX',
    'XXX..........XXX',
    '.XX..........XX.',
    '..X..........X..',
    '................',
    '.....XXXXXX.....',
    '......XXXX......',
    '.......XX.......',
    '................',
  ],
  // Lupe mit + / −
  zoomIn: [
    '................',
    '....XXXXXX......',
    '...XX....XX.....',
    '..XX..XX..XX....',
    '..X...XX...X....',
    '..X.XXXXXX.X....',
    '..X.XXXXXX.X....',
    '..X...XX...X....',
    '..XX..XX..XX....',
    '...XX....XX.....',
    '....XXXXXXXX....',
    '..........XXX...',
    '...........XXX..',
    '............XXX.',
    '.............XX.',
    '................',
  ],
  zoomOut: [
    '................',
    '....XXXXXX......',
    '...XX....XX.....',
    '..XX......XX....',
    '..X........X....',
    '..X.XXXXXX.X....',
    '..X.XXXXXX.X....',
    '..X........X....',
    '..XX......XX....',
    '...XX....XX.....',
    '....XXXXXXXX....',
    '..........XXX...',
    '...........XXX..',
    '............XXX.',
    '.............XX.',
    '................',
  ],
  // Durch Plattformen fallen: gelber Pfeil nach unten
  drop: [
    '................',
    '................',
    '................',
    '..YYYYYYYYYYYY..',
    '..yYYYYYYYYYYy..',
    '...yYYYYYYYYy...',
    '....yYYYYYYy....',
    '.....yYYYYy.....',
    '......yYYy......',
    '.......yy.......',
    '................',
    '..YYYYYYYYYYYY..',
    '..yyyyyyyyyyyy..',
    '................',
    '................',
    '................',
  ],
  // Interagieren (Figur)
  person: [
    '................',
    '......XXXX......',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '......XXXX......',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '...XX.XXXX.XX...',
    '...XX.XXXX.XX...',
    '......XXXX......',
    '......XXXX......',
    '.....XX..XX.....',
    '.....XX..XX.....',
    '.....XX..XX.....',
    '....XXX..XXX....',
    '................',
  ],
  // Minikarte (Rahmen mit Landschaft)
  minimap: [
    '................',
    '.XXXXXXXXXXXXXX.',
    '.X............X.',
    '.X......oo....X.',
    '.X.....oooo...X.',
    '.X..oo.oooo...X.',
    '.X.oooooooooo.X.',
    '.XooooooooooooX.',
    '.XXXXXXXXXXXXXX.',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // Schnell-Buff (gelbes Quadrat wie die App)
  buff: [
    '................',
    '................',
    '..YYYYYYYYYYYY..',
    '..YyyyyyyyyyyY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..Yy........yY..',
    '..YyyyyyyyyyyY..',
    '..YYYYYYYYYYYY..',
    '................',
    '................',
  ],
  // —— 操控三枚(代理 A 终稿;jump/pause 主控钮 + aim-joystick fallback face 不再使用旧草稿)——
  // 跳跃:粗实心上箭头(三角头双行钝肩+直杆,头基12px 杆6px)
  // Fork: Springen = Doppelpfeil nach oben (wie die Mobil-App)
  jump: [
    '................',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '....XXX..XXX....',
    '...XXX....XXX...',
    '..XXX......XXX..',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '....XXX..XXX....',
    '...XXX....XXX...',
    '..XXX......XXX..',
    '................',
    '................',
    '................',
  ],
  // Fork: Benutzen = Plus (wie die Mobil-App)
  plus: [
    '................',
    '................',
    '......XXXX......',
    '......XXXX......',
    '......XXXX......',
    '......XXXX......',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '......XXXX......',
    '......XXXX......',
    '......XXXX......',
    '......XXXX......',
    '................',
    '................',
  ],
  // Fork: Inventar = 3×3-Raster (wie die Mobil-App)
  grid: [
    '................',
    '.XXXX.XXXX.XXXX.',
    '.XooX.XooX.XooX.',
    '.XooX.XooX.XooX.',
    '.XXXX.XXXX.XXXX.',
    '................',
    '.XXXX.XXXX.XXXX.',
    '.XooX.XooX.XooX.',
    '.XooX.XooX.XooX.',
    '.XXXX.XXXX.XXXX.',
    '................',
    '.XXXX.XXXX.XXXX.',
    '.XooX.XooX.XooX.',
    '.XooX.XooX.XooX.',
    '.XXXX.XXXX.XXXX.',
    '................',
  ],
  // Fork: Einstellungen = Zahnrad
  gear: [
    '................',
    '.......XX.......',
    '...XX.XXXX.XX...',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '..XXXXX..XXXXX..',
    '.XXXXX....XXXXX.',
    '.XXXX......XXXX.',
    '.XXXX......XXXX.',
    '.XXXXX....XXXXX.',
    '..XXXXX..XXXXX..',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '...XX.XXXX.XX...',
    '.......XX.......',
    '................',
  ],
  // 暂停:双竖条(4px 杠宽=4px 间隙,o 圆角过渡)
  pause: [
    '................',
    '..oXXo....oXXo..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..XXXX....XXXX..',
    '..oXXo....oXXo..',
    '................',
    '................',
  ],
  // —— 系统组五枚(代理 B 终稿,圆角厚剪影一族;o 仅内部分割)——
  // 背包:圆润双肩包(拱形提手孔+半透盖缝+两条通底背带)
  inventory: [
    '................',
    '......XXXX......',
    '.....XX..XX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXooooooooXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '.XXXoXXXXXXoXXX.',
    '..XXXXXXXXXXXX..',
    '................',
    '................',
  ],
  // 地图:图纸上负空间定位针(针孔透空露底色)
  map: [
    '................',
    '................',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXooooXXXXX.',
    '.XXXXoo..ooXXXX.',
    '.XXXXoo..ooXXXX.',
    '.XXXXXooooXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXooXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '................',
    '................',
  ],
  // 智能光标:狙击镜式准星(粗实心十字+四向分离刻度线)
  cross: [
    '................',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '.XX..XXXXXX..XX.',
    '.XX..XXXXXX..XX.',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '................',
  ],
  // 聊天:圆角气泡+三点输入中+左下垂尾
  chat: [
    '................',
    '................',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXooXooXooXXX.',
    '.XXXooXooXooXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '...XXX..........',
    '....XX..........',
    '................',
    '................',
  ],
  // 旅程力量:四芒星 sparkle(凹弧轮廓,腰部最宽)
  journey: [
    '................',
    '................',
    '.......XX.......',
    '.......XX.......',
    '......XXXX......',
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '...XXXXXXXXXX...',
    '.....XXXXXX.....',
    '......XXXX......',
    '.......XX.......',
    '.......XX.......',
    '................',
    '................',
  ],
  // 药水瓶(瓶口+颈+圆瓶;挂瞄准盘左上角快捷槽)
  potion: [
    '................',
    '.....XXXXXX.....',
    '.....XXXXXX.....',
    '......XXXX......',
    '......XXXX......',
    '.....XXXXXX.....',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '................',
  ],
  // 靶标环(瞄准摇杆空手 fallback face;圆环+N/S 伸出刻线+E/W 短臂+o 芯点)
  ring: [
    '................',
    '.......XX.......',
    '.......XX.......',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '...XX......XX...',
    '...XX......XX...',
    '.XXXX..oo..XXXX.',
    '.XXXX..oo..XXXX.',
    '...XX......XX...',
    '...XX......XX...',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '.......XX.......',
    '.......XX.......',
    '................',
  ],
};

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** 首个用户手势内尝试全屏 + 横屏锁定（失败静默——iOS 不支持 orientation.lock） */
export async function tryFullscreenLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch { /* 拒绝/不支持 */ }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await so.lock?.('landscape');
  } catch { /* iOS Safari 无 lock */ }
}

export class MobileControls {
  private root: HTMLElement;
  private game: Game;
  /** 摇杆轴 -1..1（钩爪方向用；持续键注入按回滞阈值） */
  axis = { x: 0, y: 0 };
  private joyId: number | null = null;
  /** 浮动摇杆盘心(touchstart 起手固定;fixed 档=底盘中心) */
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyBaseEl: HTMLElement | null = null;
  private joyIdleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 持续键当前持份(回滞释放判定基线) */
  private held = { left: false, right: false, up: false, down: false };
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private rotListener: (() => void) | null = null;
  private resizeListener: (() => void) | null = null;
  /** Fork: Auto-Sprung */
  private autoJumpTimer: ReturnType<typeof setInterval> | null = null;
  private autoJumpHold = 0;      // verbleibende Ticks, die "Springen" gehalten wird
  private jumpBtnHeld = false;   // Spieler hält den Sprungknopf selbst
  private invTimer: ReturnType<typeof setInterval> | null = null;
  private optListener: ((d: typeof options.data) => void) | null = null;
  private useBtn: HTMLElement | null = null;
  /** 右摇杆(瞄准杆)状态:pointer 跟踪/盘心锚/游标圈 */
  private useJoyId: number | null = null;
  private useBaseX = 0;
  private useBaseY = 0;
  private useKnob: HTMLElement | null = null;
  private smartBtn: HTMLElement | null = null;
  private potionBtn: HTMLElement | null = null;
  /** Fork: Schnellwechsel (zuletzt gewählter Hotbar-Platz), Haken, Reittier */
  private quickBtn: HTMLElement | null = null;
  private hookBtn: HTMLElement | null = null;
  private mountBtn: HTMLElement | null = null;
  private lastSel = 0;
  private prevSel = 1;
  private quickFaceKey = '';
  /** gesetzte Original-Texturen (Item-Atlas lädt asynchron → nachziehen) */
  private texPending: Array<[HTMLElement, number]> = [];
  /** 使用钮当前渲染的物品 id(-1=准星态),防重复换 src 重解码 */
  private useFaceId = -2;

  constructor(game: Game, parent: HTMLElement) {
    ensureCss();
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'sw-mobile';
    this.applySkinVars();
    this.autoJumpTimer = setInterval(() => this.autoJumpTick(), 50);
    this.optListener = () => this.applySkinVars();
    options.onChange(this.optListener);
    // Fork: wie die App — Minikarte zu Beginn aus (Knopf oben rechts schaltet sie)
    try { if (game.renderer) game.renderer.mapStyle = 0; } catch { /* Renderer fehlt (Tests) */ }
    this.buildJoystick();
    this.buildJump();
    this.buildAttack();
    this.buildActionButtons();
    this.buildSystemColumn();
    this.buildPauseBtn();
    const rot = document.createElement('div');
    rot.className = 'sw-mrotate';
    rot.textContent = Lang.text('Mods.SandboxWorld.Mobile.RotateHint');
    this.root.appendChild(rot);
    parent.appendChild(this.root);
    this.refreshTimer = setInterval(() => this.refresh(), 500);
    // Fork: offenes Inventar → Bewegungs-/Aktionsknöpfe ausblenden; Hotbar-Wechsel verfolgen
    this.invTimer = setInterval(() => {
      const sel = this.game.player?.inv.selected ?? 0;
      if (sel !== this.lastSel) { this.prevSel = this.lastSel; this.lastSel = sel; this.refreshQuick(); }
      const open = !!(window as unknown as { __swUI?: { inventoryOpen?: boolean } }).__swUI?.inventoryOpen;
      if (open === this.root.classList.contains('inv')) return;
      this.root.classList.toggle('inv', open);
      // ausgeblendete Knöpfe bekommen kein touchend mehr → gehaltene Eingaben lösen
      if (open) this.game.input.releaseAllVirtual();
    }, 120);
    this.rotListener = () => this.refresh();
    window.addEventListener('orientationchange', this.rotListener);
    this.resizeListener = () => { this.applySkinVars(); requestAnimationFrame(() => this.measureSys?.()); };
    window.addEventListener('resize', this.resizeListener);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.invTimer) clearInterval(this.invTimer);
    if (this.autoJumpTimer) clearInterval(this.autoJumpTimer);
    if (this.rotListener) window.removeEventListener('orientationchange', this.rotListener);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    if (this.optListener) options.removeListener(this.optListener);
    // H5 护栏:清全部虚拟电平(touchKeys/virtualActions)——重进世界残留虚拟键会
    // 幽灵驱动角色(Input.destroy 兜底 releaseAllVirtual,此处主动再清)
    this.game.input.releaseAllVirtual();
    this.root.remove();
    hudReserveRight = 0;
  }

  /** --u (Layout-Pixel) / --mbtn-alpha aus Bildschirmhöhe + Einstellungen */
  private applySkinVars(): void {
    const short = Math.min(window.innerWidth, window.innerHeight);
    const u = Math.max(0.8, Math.min(1.7, short / 393)) * (options.data.touchButtonSize || 1);
    this.root.style.setProperty('--u', `${u.toFixed(3)}px`);
    this.root.style.setProperty('--mbtn-scale', String(options.data.touchButtonSize));
    this.root.style.setProperty('--mbtn-alpha', String(Math.max(0.35, options.data.touchButtonAlpha)));
  }

  // ---- 构件 ----
  /** Fork: Original-Textur als Icon (statt Pixel-Skizze) */
  private setTex(btn: HTMLElement, url: string): void {
    btn.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'tex';
    img.src = url;
    img.alt = '';
    img.draggable = false;
    btn.appendChild(img);
  }

  /** Icon eines Original-Items (vid) — leer, solange der Item-Atlas noch lädt */
  private itemTex(vid: number): string {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    const id = key ? ITEM_BY_KEY[key] : undefined;
    return id != null ? iconUrl(this.game, id) : '';
  }

  /** Original-Item als Knopf-Icon; bis der Atlas geladen ist Pixel-Ersatz */
  private setItemIcon(btn: HTMLElement, vid: number, fallback: string): void {
    const url = this.itemTex(vid);
    if (url) this.setTex(btn, url);
    else { this.setIcon(btn, fallback); this.texPending.push([btn, vid]); }
  }

  private setIcon(btn: HTMLElement, name: string): void {
    btn.innerHTML = '';
    const img = document.createElement('img');
    img.src = icon(name);
    img.alt = '';
    btn.appendChild(img);
  }

  /** 触控按钮绑定:touchstart preventDefault+stopPropagation(控件不落世界层),
   *  press 视觉+brightness steps;可选 onUp */
  private bindBtn(el: HTMLElement, onDown: () => void, onUp?: () => void): void {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('press');
      onDown();
    }, { passive: false });
    const end = (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('press');
      onUp?.();
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  /** Knopf anlegen: Form (round/green/sq) + Klasse + Icon */
  private mkBtn(cls: string, shape: 'round' | 'green' | 'sq', iconName?: string): HTMLElement {
    const b = document.createElement('div');
    b.className = `sw-mbtn ${shape === 'sq' ? 'sw-msq' : shape === 'green' ? 'sw-mround green' : 'sw-mround'} ${cls}`;
    if (iconName) this.setIcon(b, iconName);
    return b;
  }

  /** Gehaltene Aktion (solange der Finger drauf ist) */
  private holdAction(el: HTMLElement, action: KeybindAction): void {
    this.bindBtn(el, () => this.game.input.pressVirtual(action), () => this.game.input.releaseVirtual(action));
  }

  /** 左下罗盘摇杆:默认固定位(官方截图形态),Settings 可切浮动档。
   *  浮动=热区 x∈[0,.46W],y∈[.42H,H] 触点即盘心;映射=R44 行程/死区 12 线性,
   *  回滞触发/释放双阈值(修"碎步"),斜向抑制防推横带上翘误攀绳 */
  private buildJoystick(): void {
    const joy = document.createElement('div');
    joy.className = 'sw-mjoy';
    const knob = document.createElement('div');
    knob.className = 'knob';
    const ki = document.createElement('img');
    ki.src = icon('dpad'); ki.alt = '';
    knob.appendChild(ki);
    joy.appendChild(knob);
    this.joyBaseEl = joy;
    const R = () => joy.getBoundingClientRect().width * 0.36;
    const apply = () => {
      const inp = this.game.input;
      inp.setVirtualAction('Left', this.held.left);
      inp.setVirtualAction('Right', this.held.right);
      inp.setVirtualAction('Up', this.held.up);
      inp.setVirtualAction('Down', this.held.down);
    };
    const inHotZone = (x: number, y: number): boolean =>
      x <= window.innerWidth * 0.46 && y >= window.innerHeight * 0.42;
    const clampBase = (cx: number, cy: number): [number, number] => [
      Math.min(Math.max(cx, 66 + safeL()), window.innerWidth * 0.46 - 20),
      Math.min(Math.max(cy, window.innerHeight * 0.42 + 30), window.innerHeight - safeB() - 66),
    ];
    let r = 44;
    const move = (t: Touch, bx: number, by: number) => {
      let dx = (t.clientX - bx) / r;
      let dy = (t.clientY - by) / r;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      // 死区:圆心 12px 内归零(静止漂移防护)
      if (Math.hypot(t.clientX - bx, t.clientY - by) < 12) {
        dx = 0; dy = 0;
      }
      this.axis.x = dx; this.axis.y = dy;
      knob.style.transform = `translate(calc(-50% + ${dx * r}px), calc(-50% + ${dy * r}px))`;
      // 回滞映射:横向 0.38 触发/<0.26 释放;纵向 ±0.62/±0.52 更严(拇指推横自然上抬)
      const nx = Math.abs(dx), ny = Math.abs(dy);
      if (nx >= 0.38 && dx > 0) this.held.right = true;
      else if (this.held.right && nx < 0.26) this.held.right = false;
      if (nx >= 0.38 && dx < 0) this.held.left = true;
      else if (this.held.left && nx < 0.26) this.held.left = false;
      // 斜向抑制:横向主导(|ny|≤0.62 且 |nx|≥0.38)时纵向一律松开
      if (!(ny <= 0.62 && nx >= 0.38)) {
        if (dy <= -0.62) this.held.up = true;
        else if (this.held.up && dy > -0.52) this.held.up = false;
        if (dy >= 0.62) this.held.down = true;
        else if (this.held.down && dy < 0.52) this.held.down = false;
      } else { this.held.up = false; this.held.down = false; }
      apply();
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (this.joyId !== null) return;
      const floating = options.data.touchJoystickFloat;
      const rect = joy.getBoundingClientRect();
      if (!floating && !(t.clientX >= rect.left - 40 && t.clientX <= rect.right + 40
        && t.clientY >= rect.top - 40 && t.clientY <= rect.bottom + 40)) return;
      if (floating && !inHotZone(t.clientX, t.clientY)) return;
      this.joyId = t.identifier;
      r = R();
      joy.classList.remove('idle');
      this.armIdleTimer();
      // ★浮动档盘心在起手时刻固定(move 全程以它为原点——重算 rect 会漂移)
      const base: [number, number] = floating
        ? clampBase(t.clientX, t.clientY)
        : [rect.left + rect.width / 2, rect.top + rect.height / 2];
      this.joyBaseX = base[0]; this.joyBaseY = base[1];
      move(t, base[0], base[1]);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) move(t, this.joyBaseX, this.joyBaseY);
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.joyId) continue;
        e.preventDefault(); e.stopPropagation();
        this.joyId = null;
        this.axis.x = 0; this.axis.y = 0;
        this.held.left = this.held.right = this.held.up = this.held.down = false;
        knob.style.transform = 'translate(-50%,-50%)';
        apply();
      }
    };
    joy.addEventListener('touchend', end, { passive: false });
    joy.addEventListener('touchcancel', end, { passive: false });
    this.root.appendChild(joy);
    this.armIdleTimer();
  }

  private armIdleTimer(): void {
    if (this.joyIdleTimer) clearTimeout(this.joyIdleTimer);
    this.joyIdleTimer = setTimeout(() => {
      if (this.joyId === null) this.joyBaseEl?.classList.add('idle');
    }, 2000);
  }

  private buildJump(): void {
    const b = document.createElement('div');
    b.className = 'sw-mjump';
    this.setIcon(b, 'jump');
    this.bindBtn(b,
      () => { this.jumpBtnHeld = true; this.autoJumpHold = 0; this.game.input.setVirtualAction('Jump', true); },
      () => { this.jumpBtnHeld = false; this.game.input.setVirtualAction('Jump', false); });
    this.root.appendChild(b);
  }

  /** 右下"使用"区:瞄准摇杆(官方 dual-stick 右杆)。推杆方向实时驱动虚拟光标
   *  (玩家屏幕锚 + 摇杆向量×距离 → Input.mouseX/Y),按下即 mouseDown 边沿+mouseHeld
   *  电平;点按=一次使用。盘心 = 当前手持物品(官方同形)+ 四向刻度 */
  private buildAttack(): void {
    const b = document.createElement('div');
    b.className = 'sw-mbtn sw-matk';
    const knob = document.createElement('div');
    knob.className = 'knob';
    b.appendChild(knob);
    this.useKnob = knob;
    this.useBtn = b;
    this.useFace(-1);
    const inp = this.game.input;
    const AIM_MIN = 56, AIM_SPAN = 110;    // 光标距离=AIM_MIN+|n|×AIM_SPAN(自玩家屏幕锚)
    let R = 36;
    const applyAim = (t: Touch) => {
      let dx = (t.clientX - this.useBaseX) / R;
      let dy = (t.clientY - this.useBaseY) / R;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      const n = Math.min(1, d);
      this.useKnob?.style.setProperty('transform',
        `translate(calc(-50% + ${(dx * R).toFixed(1)}px), calc(-50% + ${(dy * R).toFixed(1)}px))`);
      if (n < 0.14) return;              // 未推动:保持按下不搬光标(准星留原位)
      const g = this.game;
      const cam = g.camera;
      if (!cam || !g.player) return;
      const [psx, psy] = cam.worldToScreen(g.player.cx, g.player.cy);
      const dist = AIM_MIN + AIM_SPAN * n;
      g.input.mouseX = Math.max(4, Math.min(window.innerWidth - 4, psx + dx * dist));
      g.input.mouseY = Math.max(4, Math.min(window.innerHeight - 4, psy + dy * dist));
    };
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (this.useJoyId !== null) return;
      this.useJoyId = t.identifier;
      const r = b.getBoundingClientRect();
      R = r.width * 0.34;
      this.useBaseX = r.left + r.width / 2;
      this.useBaseY = r.top + r.height / 2;
      b.classList.add('push');
      inp.mouseDown = true; inp.mouseHeld = true;
      applyAim(t);
    }, { passive: false });
    b.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.useJoyId) applyAim(t);
      }
    }, { passive: false });
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.useJoyId) continue;
        e.preventDefault(); e.stopPropagation();
        this.useJoyId = null;
        b.classList.remove('push');
        this.useKnob?.style.setProperty('transform', 'translate(-50%,-50%)');
        inp.mouseDown = false; inp.mouseHeld = false;
      }
    };
    b.addEventListener('touchend', endJoy, { passive: false });
    b.addEventListener('touchcancel', endJoy, { passive: false });
    this.root.appendChild(b);
  }

  /** 使用钮面 = gehaltenes Item (wie die App); leer → Fadenkreuz */
  private useFace(itemId: number): void {
    const knob = this.useKnob;
    if (!knob || itemId === this.useFaceId) return;
    const url = itemId >= 0 ? iconUrl(this.game, itemId) : '';
    if (itemId >= 0 && !url) return;     // Atlas lädt noch → beim nächsten refresh
    this.useFaceId = itemId;
    knob.innerHTML = '';
    const face = document.createElement('img');
    face.className = 'face';
    face.alt = '';
    face.src = url || icon('ring');
    knob.appendChild(face);
  }

  /** Fork: Aktionsknöpfe wie in der Mobil-App */
  private buildActionButtons(): void {
    const g = this.game;
    const add = (el: HTMLElement) => { this.root.appendChild(el); return el; };
    // links: Schnellwechsel (letzter Hotbar-Platz)
    const q = add(this.mkBtn('sw-mact sw-mq', 'round'));
    this.bindBtn(q, () => {
      const code = bindsOf(`Hotbar${this.prevSel + 1}` as KeybindAction)[0];
      if (code) g.input.tapVirtual(code);
    });
    this.quickBtn = q;
    // Greifhaken (gehalten)
    const hook = add(this.mkBtn('sw-mact sw-mhook', 'round'));
    this.setItemIcon(hook, 84, 'cross');
    this.holdAction(hook, 'Grapple');
    this.hookBtn = hook;
    // Smart-Cursor (Umschalter)
    const sc = add(this.mkBtn('sw-mact sw-msmart', 'round', 'cross'));
    this.bindBtn(sc, () => { g.smartCursor.wanted = !g.smartCursor.wanted; this.refresh(); });
    this.smartBtn = sc;
    // Heiltrank
    const pot = add(this.mkBtn('sw-mact sw-mpot', 'round'));
    this.setItemIcon(pot, 28, 'potion');
    this.bindBtn(pot, () => g.quickDrinkPotion('heal'));
    this.potionBtn = pot;
    // Zoom
    this.holdAction(add(this.mkBtn('sw-mact sw-mzout', 'sq', 'zoomOut')), 'ViewZoomOut');
    this.holdAction(add(this.mkBtn('sw-mact sw-mzin', 'sq', 'zoomIn')), 'ViewZoomIn');
    // rechts: durch Plattformen fallen (Runter halten)
    this.holdAction(add(this.mkBtn('sw-mact sw-mdrop', 'round', 'drop')), 'Down');
    // Interagieren (NPC ansprechen / Truhe, Tür … vor dem Spieler)
    const talk = add(this.mkBtn('sw-mact sw-mtalk', 'green', 'person'));
    this.bindBtn(talk, () => this.interact());
    // Reittier
    const mount = add(this.mkBtn('sw-mact sw-mmount', 'round'));
    this.setItemIcon(mount, 2430, 'jump');
    this.holdAction(mount, 'QuickMount');
    this.mountBtn = mount;
    // Karte (Vollbild)
    const map = add(this.mkBtn('sw-mact sw-mmap', 'green'));
    this.setTex(map, 'sprites/vanilla/Map_0.png');
    this.bindBtn(map, () => {
      const c = bindsOf('MapFull')[0];
      if (c) g.input.tapVirtual(c);
    });
    // Schnell-Buff
    this.holdAction(add(this.mkBtn('sw-mact sw-mbuff', 'sq', 'buff')), 'QuickBuff');
  }

  /** Interagieren: nächster Stadt-NPC in Reichweite → ansprechen; sonst Rechtsklick
   *  auf das Feld vor dem Spieler (Truhe/Tür/Bett/Schild …) */
  private interact(): void {
    const g = this.game;
    const p = g.player;
    const cam = g.camera;
    if (!p || !cam) return;
    let best: { cx: number; cy: number } | null = null;
    let bestD = 8 * 16;
    for (const n of g.entities.npcs) {
      if (!(n instanceof TownNPC) || n.dead || n.bound) continue;
      const d = Math.hypot(n.cx - p.cx, n.cy - p.cy);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) {
      const [sx, sy] = cam.worldToScreen(best.cx, best.cy);
      g.input.mouseX = sx; g.input.mouseY = sy;
      const talk = (g as unknown as { talkToNearbyNpc?: (x: number, y: number) => boolean }).talkToNearbyNpc;
      if (talk?.call(g, best.cx, best.cy)) return;
    }
    const dir = p.facing || 1;
    const [sx, sy] = cam.worldToScreen(p.cx + dir * 20, p.cy);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.rightDown = true;
    setTimeout(() => { g.input.rightDown = false; }, 120);
  }

  /** Oben rechts (neben den Leisten): Chat · Minikarte · Karte (+ Reise-Menü) */
  private buildSystemColumn(): void {
    const col = document.createElement('div');
    col.className = 'sw-msys';
    const mk = (iconName: string, onTap: () => void, cls = ''): HTMLElement => {
      const b = this.mkBtn(cls, 'sq', iconName);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        onTap();
      }, { passive: false });
      col.appendChild(b);
      return b;
    };
    mk('chat', () => this.game.input.tapVirtual('Enter'), 'sw-mact-chat');
    const jBtn = mk('journey', () => {
      const c = bindsOf('ToggleCreativeMenu')[0];
      if (c) this.game.input.tapVirtual(c);
    }, 'sw-mact-journey');
    this.setTex(jBtn, 'sprites/vanilla-ui/UI_Creative_Journey_Toggle.png');
    mk('minimap', () => {
      const c = bindsOf('MapStyle')[0];
      if (c) this.game.input.tapVirtual(c);
      else this.game.renderer.mapStyle = this.game.renderer.mapStyle === 1 ? 0 : 1;
    }, 'sw-mact-minimap');
    const mapBtn = mk('map', () => {
      const c = bindsOf('MapFull')[0];
      if (c) this.game.input.tapVirtual(c);
    });
    this.setTex(mapBtn, 'sprites/vanilla/Map_0.png');
    // Vollbild (nur Browser mit Vollbild-API, nicht in der App)
    const canFs = !!document.documentElement.requestFullscreen
      && !(window as unknown as { __otNative?: unknown }).__otNative
      && !matchMedia('(display-mode: standalone)').matches;
    if (canFs) {
      const fs = mk('map', () => void tryFullscreenLandscape(), 'sw-mfs');
      fs.innerHTML = '<span style="font-size:calc(var(--u)*15);line-height:1">⛶</span>';
    }
    // Inventar unten links
    const inv = this.mkBtn('sw-minv', 'sq', 'grid');
    inv.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.input.tapVirtual('Inventory', { virtualIntent: 'inventory' });
    }, { passive: false });
    this.root.appendChild(inv);
    this.root.appendChild(col);
    const measure = () => {
      const r = col.getBoundingClientRect();
      hudReserveRight = r.width > 0 ? Math.round(window.innerWidth - r.left + 4) : 0;
    };
    requestAnimationFrame(measure);
    this.measureSys = measure;
  }
  private measureSys: (() => void) | null = null;

  /** 右下角设置钮(官方同位):tapVirtual('Inventory', intent 'pause')=暂停浮层面
   *  (SW-BN2 2026-09-07:优先级链 intent 三态化——'pause'=无面板直达暂停菜单,
   *  背包开着=叠开暂停浮层;有对话框/全图等先收面板,见 ui/escapeChain.ts) */
  private buildPauseBtn(): void {
    const b = this.mkBtn('sw-mpause', 'sq', 'gear');
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.game.input.tapVirtual('Inventory', { virtualIntent: 'pause' });
    }, { passive: false });
    this.root.appendChild(b);
  }

  /** Fork: Auto-Sprung wie in der Mobil-App — läuft der Spieler per Joystick gegen eine
   *  Wand, die höher als eine Stufe ist (Stufen von 1 Block nimmt das Spiel selbst),
   *  wird kurz "Springen" gehalten (≈ volle Sprunghöhe). */
  private autoJumpTick(): void {
    const inp = this.game.input;
    if (this.autoJumpHold > 0) {
      if (--this.autoJumpHold === 0 && !this.jumpBtnHeld) inp.setVirtualAction('Jump', false);
      return;
    }
    if (!options.data.touchAutoJump || this.jumpBtnHeld || this.root.classList.contains('inv')) return;
    const dir = this.held.right ? 1 : this.held.left ? -1 : 0;
    const p = this.game.player;
    const w = this.game.world;
    if (!dir || !p || !w || !p.onGround || p.dead) return;
    const st = w.store;
    const solid = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= st.w || y >= st.h || !st.hasTile(x, y)) return false;
      return !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
    };
    const ahead = Math.floor((dir > 0 ? p.x + p.w + 3 : p.x - 3) / 16);
    const foot = Math.floor((p.y + p.h - 1) / 16);
    // Wand vor den Füßen UND einen Block darüber (= mehr als eine Stufe), Kopf frei
    if (solid(ahead, foot) && solid(ahead, foot - 1) && !solid(Math.floor(p.cx / 16), Math.floor(p.y / 16) - 1)) {
      inp.setVirtualAction('Jump', true);
      this.autoJumpHold = 6;   // 300 ms halten
    }
  }

  /** Schnellwechsel-Knopf zeigt das Item des zuletzt gewählten Hotbar-Platzes */
  private refreshQuick(): void {
    const b = this.quickBtn;
    if (!b) return;
    const it = this.game.player?.inv.slots[this.prevSel];
    const url = it ? iconUrl(this.game, it.id) : '';
    const key = url ? `${this.prevSel}:${it!.id}` : 'none';
    if (key === this.quickFaceKey) return;
    this.quickFaceKey = key;
    if (url) { this.setTex(b, url); b.classList.remove('off'); }
    else { this.setIcon(b, 'ring'); b.classList.add('off'); }
  }

  private refresh(): void {
    const g = this.game;
    if (!g.player) return;
    // Original-Icons nachziehen, sobald der Item-Atlas da ist
    if (this.texPending.length) {
      this.texPending = this.texPending.filter(([btn, vid]) => {
        const url = this.itemTex(vid);
        if (!url) return true;
        this.setTex(btn, url);
        return false;
      });
    }
    // ★SW-RB4a：经 heldItem() 取手持（光标持物伪选中时使用链用光标物）
    const held = g.player.inv.heldItem();
    this.useFace(held ? held.id : -1);
    this.quickFaceKey = this.quickFaceKey === 'none' ? '' : this.quickFaceKey;
    this.refreshQuick();
    // 药水：有治疗药水 → 显示；受伤时亮起
    let hasHeal = false;
    for (const s of g.player.inv.slots) {
      if (!s) continue;
      const ff = itemFuncOfVid(ITEM_DEFS[s.id]?.vid ?? -1);
      if (ff?.consumable && ff.healLife && !ff.createTile && !ff.shoot && !ff.pick && !ff.axe && !ff.hammer) {
        hasHeal = true;
        break;
      }
    }
    if (this.potionBtn) {
      this.potionBtn.classList.toggle('lit', hasHeal && g.player.hp < g.player.maxHp);
      this.potionBtn.classList.toggle('off', !hasHeal || g.player.buffs.healBlocked);
    }
    if (this.smartBtn) this.smartBtn.classList.toggle('on', !!g.smartCursor.wanted);
    this.root.classList.toggle('net', !!g.net?.active && g.spectatingSlot < 0);
    this.root.classList.toggle('journey', !!g.world?.isJourney);
    this.measureSys?.();
  }
}

/** safe insets 快捷读取(HudScale 写入 documentElement;未初始化时 0) */
function safeL(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sal')) || 0; }
function safeB(): number { return parseFloat(document.documentElement.style.getPropertyValue('--sw-sab')) || 0; }
