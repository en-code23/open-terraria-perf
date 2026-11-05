// Open-Terraria — Mehrspieler-Brücke für das Server-Deployment (deploy/).
// Browser können kein rohes TCP; diese Brücke verbindet WebSocket ⇄ TCP zum Terraria-Server.
//
//   GET  /config  (öffentlich als /ot-deploy.json)  → { bridge, servers }
//   WS   /bridge?host=H&port=P                        → TCP H:P (nur erlaubte Ziele)
//
// Umgebung:
//   TERRARIA_HOST / TERRARIA_PORT  eingebauter Server (docker-compose Profil „terraria“), leer = keiner
//   TERRARIA_NAME                  Anzeigename im Mehrspieler-Menü
//   EXTRA_SERVERS                  weitere erlaubte Ziele „name=host:port,name2=host2:port“
//   ALLOW_PUBLIC_SERVERS=1         zusätzlich beliebige Server im Internet (öffentliche IPs) erlauben
//   ALLOWED_ORIGINS                erlaubte Seiten-Herkünfte (Komma-Liste); leer = gleicher Host wie die Anfrage
//   MAX_CONNECTIONS                gleichzeitige Verbindungen (Standard 12)
// Keine Abhängigkeiten (WebSocket von Hand, RFC 6455).
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 5290);
const MAX_CONN = Number(process.env.MAX_CONNECTIONS ?? 12);
const MAX_WS_MSG = 4 * 1024 * 1024;
const ALLOW_PUBLIC = process.env.ALLOW_PUBLIC_SERVERS === '1';
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** feste Ziele: [{ name, host, port }] */
const TARGETS = [];
if (process.env.TERRARIA_HOST) {
  TARGETS.push({
    name: process.env.TERRARIA_NAME || 'Terraria-Server',
    host: process.env.TERRARIA_HOST,
    port: Number(process.env.TERRARIA_PORT ?? 7777),
  });
}
for (const part of (process.env.EXTRA_SERVERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  const m = /^(?:([^=]+)=)?([a-z0-9.-]+):(\d{2,5})$/i.exec(part);
  if (m) TARGETS.push({ name: m[1] ?? m[2], host: m[2], port: Number(m[3]) });
}

let active = 0;

/** Nur Ziele anbieten, deren Name auflösbar ist (z. B. läuft der optionale Container
 *  „terraria“ nicht → nicht im Menü). Ergebnis 10 s zwischengespeichert. */
let reachCache = { at: 0, list: [] };
async function reachableTargets() {
  if (Date.now() - reachCache.at < 10_000) return reachCache.list;
  const list = [];
  for (const t of TARGETS) {
    if (net.isIP(t.host)) { list.push(t); continue; }
    try { await dns.lookup(t.host); list.push(t); } catch { /* läuft nicht */ }
  }
  reachCache = { at: Date.now(), list };
  return list;
}

function isPublicIp(a) {
  const v = net.isIP(a);
  if (v === 4) {
    const [x, y] = a.split('.').map(Number);
    if (x === 0 || x === 10 || x === 127 || x >= 224 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
      || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || (x === 192 && y === 0)) return false;
    return true;
  }
  if (v === 6) return /^[23][0-9a-f]{3}:/i.test(a);
  return false;
}

/** Herkunft erlaubt? Standard: Seite muss vom selben Host kommen wie die Anfrage */
function originOk(req) {
  const o = String(req.headers.origin ?? '').toLowerCase();
  if (!o) return false;   // nur Browser-Seiten des Spiels
  if (ORIGINS.length) return ORIGINS.includes(o);
  let oh;
  try { oh = new URL(o).host; } catch { return false; }
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').toLowerCase().split(',')[0].trim();
  return !!host && oh === host;
}

/** Ziel → { host, port } zum Verbinden oder null */
async function resolveTarget(hostRaw, port) {
  const host = String(hostRaw ?? '').trim().toLowerCase();
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const fixed = TARGETS.find((t) => t.host.toLowerCase() === host && t.port === port);
  if (fixed) return { host: fixed.host, port };
  if (!ALLOW_PUBLIC || port < 1024 || !/^[a-z0-9.:-]{1,253}$/i.test(host)) return null;
  let ip = host.replace(/^\[|\]$/g, '');
  if (!net.isIP(ip)) {
    try { ip = (await dns.lookup(ip)).address; } catch { return null; }
  }
  return isPublicIp(ip) ? { host: ip, port } : null;
}

function wsFrame(payload, opcode = 2) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, payload]);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'GET' && (url.pathname === '/config' || url.pathname === '/ot-deploy.json')) {
    void reachableTargets().then((list) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ bridge: '/bridge', servers: list.map(({ name, host, port }) => ({ name, host, port })) }));
    });
    return;
  }
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"ok":false}');
});

server.on('upgrade', async (req, sock) => {
  sock.on('error', () => {});
  const url = new URL(req.url ?? '/', 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (!key || !/^\/bridge\/?$/.test(url.pathname) || !originOk(req) || active >= MAX_CONN) { sock.destroy(); return; }
  // Platz vor dem await reservieren (sonst überholen parallele Anfragen das Limit)
  active++;
  let counted = true;
  const release = () => { if (counted) { counted = false; active--; } };
  const target = await resolveTarget(url.searchParams.get('host'), Number(url.searchParams.get('port') ?? 7777));
  if (!target || sock.destroyed) { release(); sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const tcp = net.connect(target);
  tcp.setNoDelay(true);
  // bis der Server antwortet: Browser-Daten anhalten statt unbegrenzt puffern; 10 s Verbindungs-Timeout
  sock.pause();
  const connectTimer = setTimeout(() => tcp.destroy(new Error('connect timeout')), 10_000);
  const pending = [];
  let pendingBytes = 0;
  let tcpReady = false;
  tcp.on('connect', () => {
    clearTimeout(connectTimer);
    tcpReady = true; for (const b of pending) tcp.write(b); pending.length = 0; pendingBytes = 0;
    sock.resume();
  });
  // Gegendruck: schreibt der Server-Socket nicht schnell genug, Browser-Seite anhalten
  tcp.on('drain', () => sock.resume());
  tcp.on('data', (d) => { if (!sock.destroyed) sock.write(wsFrame(d)); });
  const closeBoth = () => {
    release();
    try { if (!sock.destroyed) sock.end(wsFrame(Buffer.alloc(0), 8)); } catch { /* */ }
    tcp.destroy();
  };
  tcp.on('close', () => { clearTimeout(connectTimer); closeBoth(); });
  tcp.on('error', () => { clearTimeout(connectTimer); closeBoth(); });
  let buf = Buffer.alloc(0);
  let frag = [];
  let fragLen = 0;
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (buf.length > MAX_WS_MSG + 16) { closeBoth(); sock.destroy(); return; }
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_WS_MSG || fragLen + len > MAX_WS_MSG) { closeBoth(); sock.destroy(); return; }
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[mOff + (i & 3)];
      buf = buf.subarray(off + len);
      if (op === 8) { closeBoth(); return; }
      if (op === 9) { sock.write(wsFrame(payload, 10)); continue; }
      if (op === 10) continue;
      frag.push(payload);
      fragLen += len;
      if (!fin) continue;
      const msg = frag.length === 1 ? frag[0] : Buffer.concat(frag);
      frag = []; fragLen = 0;
      if (tcpReady) {
        if (!tcp.write(msg)) sock.pause();
        if (tcp.writableLength > MAX_WS_MSG) { closeBoth(); sock.destroy(); return; }
      } else {
        pendingBytes += msg.length;
        if (pendingBytes > MAX_WS_MSG) { closeBoth(); sock.destroy(); return; }
        pending.push(msg);
      }
    }
  });
  sock.on('close', () => { release(); tcp.destroy(); });
  sock.on('error', () => { release(); tcp.destroy(); });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] Port ${PORT} · Ziele: ${TARGETS.map((t) => `${t.name}=${t.host}:${t.port}`).join(', ') || '—'}`
    + `${ALLOW_PUBLIC ? ' · + öffentliche Server' : ''}`);
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(() => process.exit(0)));
