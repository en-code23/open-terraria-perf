// Extracts Terraria's own menu fonts (Death_Text / Mouse_Text) from YOUR local
// Steam install into public/sprites/local/fonts/ (git-excluded, never committed).
// The title menu uses them when present and falls back to the pixel font otherwise.
//
//   npm i --no-save xnb@1.3.0-a
//   node scripts/extract-local-fonts.mjs [path/to/Terraria/Content/Fonts]
//
// Format: ReLogic DynamicSpriteFont = spacing f32, lineSpacing i32, defaultChar,
// pageCount i32, then per page Texture2D + glyph rects + cropping rects + chars +
// kerning (x = left bearing, y = glyph width, z = right bearing).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

let X;
try { X = await import('xnb'); } catch {
  console.error('[fonts] xnb fehlt: npm i --no-save xnb@1.3.0-a');
  process.exit(1);
}
const R = X.Readers;

class DynamicSpriteFontReader extends R.BaseReader {
  static isTypeOf(t) { return t.startsWith('ReLogic.Graphics.DynamicSpriteFontReader'); }
  static parseTypeList() { return ['DynamicSpriteFont']; }
  read(buffer, resolver) {
    const spacing = new R.SingleReader().read(buffer);
    const lineSpacing = new R.Int32Reader().read(buffer);
    const defaultCharacter = new R.CharReader().read(buffer);
    const n = new R.Int32Reader().read(buffer);
    const pages = [];
    for (let i = 0; i < n; i++) {
      pages.push({
        texture: resolver.read(buffer), glyphs: resolver.read(buffer), cropping: resolver.read(buffer),
        characters: resolver.read(buffer), kerning: resolver.read(buffer),
      });
    }
    return { spacing, lineSpacing, defaultCharacter, pages };
  }
  isValueType() { return false; }
}
X.addReaders({ DynamicSpriteFontReader });

const DEFAULT_DIRS = [
  path.join(os.homedir(), 'Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Content/Fonts'),
  'C:/Program Files (x86)/Steam/steamapps/common/Terraria/Content/Fonts',
  path.join(os.homedir(), '.local/share/Steam/steamapps/common/Terraria/Content/Fonts'),
];
const srcDir = process.argv[2] ?? DEFAULT_DIRS.find((d) => fs.existsSync(d));
if (!srcDir || !fs.existsSync(srcDir)) {
  console.error('[fonts] Terraria-Fonts-Ordner nicht gefunden. Pfad als Argument angeben.');
  process.exit(1);
}
const outDir = path.resolve(import.meta.dirname, '../public/sprites/local/fonts');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const NEED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?-()\'"/äöüÄÖÜß—–…·©éèêàâçùûîôñ¿¡ãõąćęłńśźżАБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';
const arr = (v) => v?.data ?? v;

for (const name of ['Death_Text', 'Mouse_Text']) {
  const file = path.join(srcDir, `${name}.xnb`);
  if (!fs.existsSync(file)) { console.warn(`[fonts] ${name}.xnb fehlt, übersprungen`); continue; }
  const buf = fs.readFileSync(file);
  const origWarn = console.warn, origLog = console.log;
  console.warn = () => {}; console.log = () => {};
  let xnb;
  try { xnb = await X.bufferToXnb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); }
  finally { console.warn = origWarn; console.log = origLog; }
  const font = xnb.content.content ?? xnb.content;
  // Only the pages needed for Latin text (page 0 covers ASCII + Latin-1).
  const pages = font.pages.filter((p) => arr(p.characters).some((c) => NEED.includes(c)));
  const outPages = pages.map((p, i) => {
    const t = p.texture.export;
    const pngName = `${name}_p${i}.png`;
    fs.writeFileSync(path.join(outDir, pngName), png(t.width, t.height, new Uint8Array(t.data)));
    const r = (g) => [g.x, g.y, g.width, g.height];
    return {
      texture: pngName,
      characters: arr(p.characters).map((c) => c.codePointAt(0)),
      glyphs: arr(p.glyphs).map(r), cropping: arr(p.cropping).map(r),
      kerning: arr(p.kerning).map((k) => [k.x, k.y, k.z]),
    };
  });
  const json = { spacing: font.spacing, lineSpacing: font.lineSpacing,
    defaultCharacter: String(font.defaultCharacter).codePointAt(0), pages: outPages };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(json));
  const have = new Set(outPages.flatMap((p) => p.characters));
  const missing = [...NEED].filter((c) => !have.has(c.codePointAt(0)));
  console.log(`[fonts] ${name}: ${outPages.length} Seite(n), lineSpacing ${font.lineSpacing}${missing.length ? `, fehlt: ${missing.join('')}` : ''}`);
}
console.log(`[fonts] fertig -> ${outDir}`);
