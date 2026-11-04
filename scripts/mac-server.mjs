// Fork: kleiner Spielserver für die eigenständige Mac-App (scripts/make-mac-app.sh --release).
// Liefert das gebaute Spiel aus <dir> und bietet „Aus Terraria importieren“
// (/__terraria/*, scripts/terraria-saves.mjs). Keine Abhängigkeiten außer Node.
//   node mac-server.mjs <spielordner> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { terrariaSavesMiddleware } from './terraria-saves.mjs';

const root = path.resolve(process.argv[2] ?? 'game');
const port = Number(process.argv[3] ?? process.env.PORT ?? 5299);
const host = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip',
  '.xnb': 'application/octet-stream', '.bin': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  terrariaSavesMiddleware(req, res, () => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.statusCode = 400; return res.end(); }
    // kein Service Worker in der App (Dateien liegen lokal; der SW erwartet Zip-Pakete)
    if (rel === '/sw.js') { res.statusCode = 404; return res.end(); }
    let file = path.join(root, rel);
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* fehlt */ }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        // Seitenaufrufe ohne Datei → index.html (SPA); Ressourcen → 404
        if (!path.extname(rel)) file = path.join(root, 'index.html');
        else { res.statusCode = 404; return res.end('not found'); }
      }
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', /index\.html$|sw\.js$|build-id/.test(file) ? 'no-cache' : 'public, max-age=3600');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => { res.statusCode = 500; res.end(); }).pipe(res);
    });
  });
});
server.listen(port, host, () => console.log(`[mac-server] http://localhost:${port}/ (${root})`));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(() => process.exit(0)));
