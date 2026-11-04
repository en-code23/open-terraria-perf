// Fork: Spielstände des ECHTEN Terraria finden (für „Aus Terraria importieren“).
//
// Wird als Middleware in den Vite-Server (dev + preview, siehe vite.config.ts)
// eingehängt — läuft also mit `npm run dev`, der Mac-App und `npm run lan`:
//   GET /__terraria/saves          → { players: Save[], worlds: Save[] }
//   GET /__terraria/save?id=<id>   → Rohbytes der Datei (.plr verschlüsselt, wie auf Platte)
// Nur lesend. Die id ist ein Index in die frische Liste — beliebige Pfade
// lassen sich darüber nicht abrufen.
//
// Gesucht wird in: Terraria-Ordner (Players/Worlds), tModLoader-Ordner und
// Steam Cloud (userdata/<id>/105600 bzw. 1281930 /remote). Sicherungen (*.bak)
// werden mit angezeigt (z. B. wenn nur noch die Sicherung existiert).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const HOME = os.homedir();
const RE_SAVE = /\.(plr|wld)(\.bak)?$/i;

function terrariaBase() {
  if (process.platform === 'darwin') return path.join(HOME, 'Library/Application Support/Terraria');
  if (process.platform === 'win32') return path.join(HOME, 'Documents/My Games/Terraria');
  return path.join(HOME, '.local/share/Terraria');
}
function steamUserdataRoots() {
  if (process.platform === 'darwin') return [path.join(HOME, 'Library/Application Support/Steam/userdata')];
  if (process.platform === 'win32') return ['C:\\Program Files (x86)\\Steam\\userdata', 'C:\\Program Files\\Steam\\userdata'];
  return [path.join(HOME, '.local/share/Steam/userdata'), path.join(HOME, '.steam/steam/userdata')];
}

/** [Ordner, Quelle, rekursiv?] */
function saveDirs() {
  const base = process.env.TERRARIA_SAVES ?? terrariaBase();
  const dirs = [
    [path.join(base, 'Players'), 'terraria', false],
    [path.join(base, 'Worlds'), 'terraria', false],
    [path.join(base, 'tModLoader/Players'), 'tmodloader', false],
    [path.join(base, 'tModLoader/Worlds'), 'tmodloader', false],
  ];
  for (const root of steamUserdataRoots()) {
    let users = [];
    try { users = fs.readdirSync(root); } catch { continue; }
    for (const u of users) {
      dirs.push([path.join(root, u, '105600/remote'), 'cloud', true]);
      dirs.push([path.join(root, u, '1281930/remote'), 'cloud-tmod', true]);
    }
  }
  return dirs;
}

function walk(dir, recursive, depth, out) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (recursive && depth < 3) walk(p, recursive, depth + 1, out); }
    else if (e.isFile() && RE_SAVE.test(e.name)) out.push(p);
  }
}

// ---- Namen aus den Dateien lesen (nur Kopf; Fehler → Dateiname) ----
const PLR_KEY = Buffer.from('h3y_gUyZ', 'utf16le');
function read7BitString(buf, off) {
  let len = 0, shift = 0, b;
  do { b = buf[off++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80 && shift < 35);
  if (len > 256 || off + len > buf.length) return null;
  return buf.subarray(off, off + len).toString('utf8');
}
function headOf(p, n) {
  const fd = fs.openSync(p, 'r');
  try { const b = Buffer.alloc(n); const k = fs.readSync(fd, b, 0, n, 0); return b.subarray(0, k); }
  finally { fs.closeSync(fd); }
}
function playerInfo(p) {
  const enc = headOf(p, 512);
  const d = crypto.createDecipheriv('aes-128-ecb', PLR_KEY, null);
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(enc.subarray(0, enc.length - (enc.length % 16)))]);
  const version = plain.readInt32LE(0);
  const off = version >= 135 ? 24 : 4;
  const name = read7BitString(plain, off);
  const nameEnd = off + 1 + Buffer.byteLength(name ?? '', 'utf8');
  return { version, name, difficulty: plain[nameEnd] };
}
function worldInfo(p) {
  const h = headOf(p, 4096);
  const version = h.readInt32LE(0);
  let off = 4 + (version >= 135 ? 20 : 0);
  const sections = h.readInt16LE(off); off += 2;
  if (sections < 1 || sections > 64) return { version, name: null };
  const p0 = h.readInt32LE(off);
  if (p0 <= 0) return { version, name: null };
  const hh = p0 + 300 > h.length ? headOf(p, p0 + 300) : h;
  return { version, name: read7BitString(hh, p0) };
}

/** Frische Liste aller gefundenen Spielstände (neueste zuerst). */
export function listSaves() {
  const files = [];
  const seen = new Set();
  for (const [dir, source, rec] of saveDirs()) {
    const found = [];
    walk(dir, rec, 0, found);
    for (const p of found) {
      const real = (() => { try { return fs.realpathSync(p); } catch { return p; } })();
      if (seen.has(real)) continue;
      seen.add(real);
      files.push({ p, source });
    }
  }
  const players = [], worlds = [];
  for (const { p, source } of files) {
    const base = path.basename(p);
    const kind = /\.plr/i.test(base) ? 'player' : 'world';
    const backup = /\.bak$/i.test(base);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.size < 32) continue;
    let info = { version: 0, name: null };
    try { info = kind === 'player' ? playerInfo(p) : worldInfo(p); } catch { /* Kopf unlesbar */ }
    const entry = {
      file: base.replace(RE_SAVE, ''),
      name: info.name || base.replace(RE_SAVE, ''),
      version: info.version || 0,
      difficulty: info.difficulty,
      source, backup, bytes: st.size, mtime: st.mtimeMs, p,
    };
    (kind === 'player' ? players : worlds).push(entry);
  }
  const sort = (a, b) => (a.backup - b.backup) || (b.mtime - a.mtime);
  players.sort(sort); worlds.sort(sort);
  players.forEach((e, i) => { e.id = `p${i}`; });
  worlds.forEach((e, i) => { e.id = `w${i}`; });
  return { players, worlds };
}

const strip = ({ p, ...rest }) => rest;   // eslint-disable-line no-unused-vars

const isLoopbackAddr = (a) => /^(127\.|::1$|::ffff:127\.)/.test(String(a ?? ''));
/** Host-Header muss localhost/IP sein (Schutz gegen DNS-Rebinding fremder Seiten) */
function hostOk(req) {
  const h = String(req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':');
}

/** Connect-Middleware für Vite (dev + preview) und die Mac-App.
 *  Nur für diesen Rechner selbst (Loopback) — Spielstände gehen nicht ins Netz.
 *  TERRARIA_SAVES_LAN=1 erlaubt es auch Geräten im eigenen WLAN (z. B. iPad). */
export function terrariaSavesMiddleware(req, res, next) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/__terraria/')) return next();
  const lanOk = process.env.TERRARIA_SAVES_LAN === '1';
  if (!hostOk(req) || (!lanOk && !isLoopbackAddr(req.socket?.remoteAddress))) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: 'only on this computer' }));
  }
  const send = (code, body, type = 'application/json') => {
    res.statusCode = code;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  try {
    if (req.method !== 'GET') return send(405, { ok: false });
    const all = listSaves();
    if (url.pathname === '/__terraria/saves') {
      return send(200, { ok: true, players: all.players.map(strip), worlds: all.worlds.map(strip) });
    }
    if (url.pathname === '/__terraria/save') {
      const id = url.searchParams.get('id') ?? '';
      const e = [...all.players, ...all.worlds].find((x) => x.id === id);
      if (!e) return send(404, { ok: false, error: 'not found' });
      return send(200, fs.readFileSync(e.p), 'application/octet-stream');
    }
    send(404, { ok: false });
  } catch (e) {
    send(500, { ok: false, error: String(e?.message ?? e) });
  }
}
