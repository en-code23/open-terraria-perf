// Fork: Spiel für iPad/Handy im eigenen WLAN bereitstellen.
//
//   node scripts/serve-lan.mjs            # baut (falls nötig) und startet den Server
//   node scripts/serve-lan.mjs --rebuild  # Build erzwingen
//   PORT=5300 node scripts/serve-lan.mjs
//   node scripts/serve-lan.mjs --no-host  # ohne LAN-Helfer (kein Mehrspieler-Hosting)
//
// Baut nach build/lan/ (gitignored, NICHT "geprunt" → alle Bilddateien liegen
// einzeln vor und laden auch ohne Service Worker, also über einfaches http).
// Danach auf dem iPad/Handy (gleiches WLAN) die angezeigte Adresse in Safari
// öffnen; "Teilen → Zum Home-Bildschirm" startet es später im Vollbild.
// Nur für das eigene Netz gedacht — nicht ins Internet freigeben.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build', 'lan');
const port = Number(process.env.PORT ?? 5300);

function newestMtime(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

const stamp = path.join(out, 'index.html');
const stale = !fs.existsSync(stamp)
  || newestMtime(path.join(root, 'src')) > fs.statSync(stamp).mtimeMs
  || fs.statSync(path.join(root, 'index.html')).mtimeMs > fs.statSync(stamp).mtimeMs;
if (process.argv.includes('--rebuild') || stale) {
  console.log('[lan] baue das Spiel (ca. 30 s) …');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: root, stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (r.status !== 0) { console.error('[lan] Build fehlgeschlagen'); process.exit(1); }
  // vite schreibt beim Build den Zeitstempel in src/version.ts — nicht committen
  spawnSync('git', ['checkout', '--', 'src/version.ts'], { cwd: root, stdio: 'ignore' });
}

const ips = Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
console.log('\n[lan] Auf iPad/Handy (gleiches WLAN) in Safari öffnen:');
for (const ip of ips) console.log(`        http://${ip}:${port}/`);
console.log(`       Am Mac: http://localhost:${port}/`);
console.log('       Beenden: Strg+C\n');

const srv = spawn('npx', ['vite', 'preview', '--outDir', out, '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'],
});
// LAN-Helfer (Mehrspieler mit dem echten Terraria-Server, siehe scripts/lan-host.mjs)
const helper = process.argv.includes('--no-host') ? null
  : spawn(process.execPath, [path.join(root, 'scripts/lan-host.mjs')], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
const stop = () => {
  srv.kill('SIGTERM');
  if (!helper) process.exit(0);
  helper.kill('SIGTERM');   // speichert laufende Welten
  helper.on('exit', () => process.exit(0));
  setTimeout(() => process.exit(0), 20000);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
srv.on('exit', (c) => process.exit(c ?? 0));
