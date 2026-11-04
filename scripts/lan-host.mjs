// Fork: LAN-Helfer für Mehrspieler mit dem ECHTEN Terraria-Server.
//
//   node scripts/lan-host.mjs            # Port 5290 (wie der Spiel-Client erwartet)
//
// Läuft auf dem Rechner, auf dem Terraria (Steam) installiert ist, und bietet:
//   1) Brücke Browser ⇄ Terraria-Server: WebSocket  ws://<rechner>:5290/?host=H&port=P
//      → TCP H:P (nur Loopback/privates Netz). Browser können kein rohes TCP.
//   2) HTTP-API (für das Mehrspieler-Menü im Spiel):
//        GET  /api/status            Terraria gefunden?, laufende Server, Welten
//        POST /api/host              {file?|create:{name,size,difficulty}} → Server starten
//        POST /api/stop              {port} → speichern + beenden
//        POST /api/upload?name=N     Body = .wld (Welt aus dem Browser) → Welten-Ordner
//        GET  /api/world?file=F      .wld herunterladen (Welt zurück in den Browser)
//   Gestartete Server sind normale Terraria-Server: auch das echte Terraria am PC
//   kann ihnen beitreten (Mehrspieler → Über IP beitreten → IP dieses Rechners).
//
// Nur fürs eigene Netz gedacht. Keine Abhängigkeiten (WebSocket von Hand, RFC 6455).
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.LAN_HOST_PORT ?? 5290);
/** 0.0.0.0 = im WLAN erreichbar (iPad/Handy); LAN_HOST_BIND=127.0.0.1 = nur dieser Rechner */
const BIND = process.env.LAN_HOST_BIND ?? '0.0.0.0';
const HOME = os.homedir();

// ---------- Terraria-Server finden ----------
function findTerrariaServer() {
  const env = process.env.TERRARIA_SERVER;
  const cands = [
    env,
    path.join(HOME, 'Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/MacOS/TerrariaServer.bin.osx'),
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Terraria\\TerrariaServer.exe',
    path.join(HOME, '.local/share/Steam/steamapps/common/Terraria/TerrariaServer.bin.x86_64'),
  ].filter(Boolean);
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) ?? null;
}
const SERVER_BIN = findTerrariaServer();

/** Welten des echten Terraria + eigener Ordner für hochgeladene Browser-Welten */
const TERRARIA_WORLDS = process.platform === 'darwin'
  ? path.join(HOME, 'Library/Application Support/Terraria/Worlds')
  : process.platform === 'win32'
    ? path.join(HOME, 'Documents/My Games/Terraria/Worlds')
    : path.join(HOME, '.local/share/Terraria/Worlds');
const LAN_WORLDS = process.env.LAN_WORLDS ?? (process.platform === 'darwin'
  ? path.join(HOME, 'Library/Application Support/Open-Terraria/lan-worlds')
  : path.join(HOME, '.open-terraria/lan-worlds'));
fs.mkdirSync(LAN_WORLDS, { recursive: true });

function listWorlds() {
  const out = [];
  for (const [dir, source] of [[LAN_WORLDS, 'browser'], [TERRARIA_WORLDS, 'terraria']]) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.wld')); } catch { /* fehlt */ }
    for (const n of names) {
      const st = fs.statSync(path.join(dir, n));
      out.push({ file: `${source}/${n}`, name: n.replace(/\.wld$/, ''), source, bytes: st.size, mtime: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
/** "browser/X.wld" | "terraria/X.wld" → absoluter Pfad (ohne Ausbruch aus dem Ordner) */
function resolveWorld(file) {
  const m = /^(browser|terraria)\/([^/\\]+\.wld)$/.exec(String(file ?? ''));
  if (!m) return null;
  return path.join(m[1] === 'browser' ? LAN_WORLDS : TERRARIA_WORLDS, m[2]);
}
const safeName = (s) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 40) || 'World';

// ---------- laufende Server ----------
/** port → { proc, name, file, ready, players:Set, log:string[] } */
const servers = new Map();

function freePort(start = 7777) {
  let p = start;
  while (servers.has(p)) p++;
  return p;
}

function startServer({ file, create }) {
  if (!SERVER_BIN) throw new Error('Terraria-Server nicht gefunden (Steam-Installation?)');
  if (servers.size >= 4) throw new Error('Es laufen schon 4 Server');
  const port = freePort();
  const args = ['-port', String(port), '-players', '16', '-noupnp'];
  let name;
  let worldPath;
  if (file) {
    worldPath = resolveWorld(file);
    if (!worldPath || !fs.existsSync(worldPath)) throw new Error('Welt nicht gefunden');
    // dieselbe Datei läuft schon → diesen Server nehmen (zwei Server auf einer Datei = Datenverlust)
    const running = [...servers.values()].find((x) => x.file === worldPath);
    if (running) return running;
    name = path.basename(worldPath, '.wld');
  } else {
    name = safeName(create?.name);
    worldPath = path.join(LAN_WORLDS, `${name}.wld`);
    let i = 2;
    while (fs.existsSync(worldPath)) worldPath = path.join(LAN_WORLDS, `${name} ${i++}.wld`);
    const size = { small: 1, medium: 2, large: 3 }[create?.size] ?? 1;
    args.push('-autocreate', String(size), '-worldname', name);
    const diff = { normal: 0, expert: 1, master: 2, journey: 3 }[create?.difficulty];
    if (diff != null) args.push('-difficulty', String(diff));
    if (create?.seed) args.push('-seed', String(create.seed).slice(0, 60));
  }
  args.push('-world', worldPath);
  const cwd = path.dirname(SERVER_BIN);
  const env = { ...process.env };
  if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = path.join(cwd, 'osx');
  const proc = spawn(SERVER_BIN, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { proc, name, file: worldPath, port, ready: false, generating: !file, progress: '', players: new Set(), log: [] };
  servers.set(port, s);
  const onLine = (line) => {
    line = line.replace(/\r/g, '').trim();
    if (!line) return;
    s.log.push(line); if (s.log.length > 50) s.log.shift();
    if (/Server started/i.test(line)) { s.ready = true; s.generating = false; console.log(`[lan] Server „${name}“ bereit auf Port ${port}`); }
    else if (/^\d+(\.\d+)?% - /.test(line)) s.progress = line;
    let m;
    if ((m = /^(.+) has joined\.?$/.exec(line))) s.players.add(m[1]);
    else if ((m = /^(.+) has left\.?$/.exec(line))) s.players.delete(m[1]);
  };
  let buf = '';
  const feed = (d) => { buf += d.toString(); const parts = buf.split(/\n|(?=\d+(?:\.\d+)?% - )/); buf = parts.pop() ?? ''; parts.forEach(onLine); };
  proc.stdout.on('data', feed);
  proc.stderr.on('data', feed);
  proc.on('exit', (code) => { servers.delete(port); console.log(`[lan] Server „${name}“ beendet (${code})`); });
  console.log(`[lan] starte Server „${name}“ (Port ${port}) …`);
  return s;
}

function stopServer(port) {
  const s = servers.get(Number(port));
  if (!s) return false;
  try { s.proc.stdin.write('exit\n'); } catch { /* */ }   // speichert die Welt
  setTimeout(() => { if (servers.get(s.port) === s) s.proc.kill('SIGTERM'); }, 20000);
  return true;
}

const lanIps = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

function status() {
  return {
    ok: true,
    terraria: !!SERVER_BIN,
    ips: lanIps(),
    servers: [...servers.values()].map((s) => ({
      port: s.port, name: s.name, ready: s.ready, generating: s.generating, progress: s.progress,
      players: [...s.players], file: path.relative(HOME, s.file),
    })),
    worlds: listWorlds(),
  };
}

// ---------- HTTP ----------
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (url.pathname === '/api/status' && req.method === 'GET') return send(res, 200, status());
    if (url.pathname === '/api/host' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}');
      const s = startServer(body);
      return send(res, 200, { ok: true, port: s.port, name: s.name });
    }
    if (url.pathname === '/api/stop' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)).toString() || '{}');
      return send(res, 200, { ok: stopServer(body.port) });
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const data = await readBody(req, 200 * 1024 * 1024);
      if (data.length < 64) throw new Error('keine Weltdatei');
      const name = safeName(url.searchParams.get('name'));
      let p = path.join(LAN_WORLDS, `${name}.wld`);
      const inUse = (q) => [...servers.values()].some((x) => x.file === q);
      if (fs.existsSync(p) && (url.searchParams.get('replace') !== '1' || inUse(p))) {
        let i = 2; while (fs.existsSync(p) || inUse(p)) p = path.join(LAN_WORLDS, `${name} ${i++}.wld`);
      }
      fs.writeFileSync(p, data);
      return send(res, 200, { ok: true, file: `browser/${path.basename(p)}` });
    }
    if (url.pathname === '/api/world' && req.method === 'GET') {
      const p = resolveWorld(url.searchParams.get('file'));
      if (!p || !fs.existsSync(p)) return send(res, 404, { ok: false, error: 'nicht gefunden' });
      return send(res, 200, fs.readFileSync(p), 'application/octet-stream');
    }
    if (url.pathname === '/' || url.pathname === '/lan') return send(res, 200, { ok: true, kind: 'open-terraria-lan-host', terraria: !!SERVER_BIN });
    send(res, 404, { ok: false });
  } catch (e) {
    send(res, 400, { ok: false, error: String(e?.message ?? e) });
  }
});

// ---------- WebSocket-Brücke (RFC 6455, nur Binärframes) ----------
const isPrivate = (h) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost$)/i.test(h);

function wsFrame(payload, opcode = 2) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, payload]);
}

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const host = url.searchParams.get('host') ?? '127.0.0.1';
  const port = Number(url.searchParams.get('port') ?? 7777);
  const key = req.headers['sec-websocket-key'];
  if (!key || !isPrivate(host) || !(port > 0 && port < 65536)) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const tcp = net.connect({ host, port });
  tcp.setNoDelay(true);
  const pending = [];
  let tcpReady = false;
  tcp.on('connect', () => { tcpReady = true; for (const b of pending) tcp.write(b); pending.length = 0; });
  tcp.on('data', (d) => { if (!sock.destroyed) sock.write(wsFrame(d)); });
  const closeBoth = () => { try { if (!sock.destroyed) sock.end(wsFrame(Buffer.alloc(0), 8)); } catch { /* */ } tcp.destroy(); };
  tcp.on('close', closeBoth);
  tcp.on('error', closeBoth);
  let buf = Buffer.alloc(0);
  let frag = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[mOff + (i & 3)];
      buf = buf.subarray(off + len);
      if (op === 8) { closeBoth(); return; }
      if (op === 9) { sock.write(wsFrame(payload, 10)); continue; }
      if (op === 10) continue;
      frag.push(payload);
      if (!fin) continue;
      const msg = frag.length === 1 ? frag[0] : Buffer.concat(frag);
      frag = [];
      if (tcpReady) tcp.write(msg); else pending.push(msg);
    }
  });
  sock.on('close', () => tcp.destroy());
  sock.on('error', () => tcp.destroy());
});

server.listen(PORT, BIND, () => {
  console.log(`[lan] Helfer läuft auf Port ${PORT}${SERVER_BIN ? '' : ' — Terraria-Server NICHT gefunden (Hosten nicht möglich, Beitreten geht)'}`);
});

const shutdown = () => {
  console.log('[lan] speichere und beende Server …');
  for (const s of servers.values()) stopServer(s.port);
  const t0 = Date.now();
  const iv = setInterval(() => { if (!servers.size || Date.now() - t0 > 15000) { clearInterval(iv); process.exit(0); } }, 200);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
