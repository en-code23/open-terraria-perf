// Fork: spielt die deutschen Übersetzungen der projekteigenen Texte
// (tools/l10n-fork/de-DE.sandboxworld.json, Schlüssel ohne "Mods.SandboxWorld.")
// in public/l10n/de-DE.json ein. Idempotent; prüft Platzhalter {n} gegen en-US.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = JSON.parse(fs.readFileSync(path.join(root, 'tools/l10n-fork/de-DE.sandboxworld.json'), 'utf8'));
const dePath = path.join(root, 'public/l10n/de-DE.json');
const de = JSON.parse(fs.readFileSync(dePath, 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'public/l10n/en-US.json'), 'utf8'));
const get = (o, ks) => ks.reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
const ph = (s) => [...String(s).matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join(',');

let applied = 0;
const problems = [];
for (const [k, v] of Object.entries(src)) {
  // Struktur der l10n-Dateien: { Mods: { "SandboxWorld.<Rest>": "…" } }
  const ks = ['Mods', `SandboxWorld.${k}`];
  const enV = get(en, ks);
  if (typeof enV !== 'string') { problems.push(`unbekannter Schlüssel ${k}`); continue; }
  if (ph(enV) !== ph(v)) { problems.push(`Platzhalter passen nicht: ${k}`); continue; }
  const parent = get(de, ks.slice(0, -1));
  if (!parent || typeof parent !== 'object') { problems.push(`fehlender Elternknoten ${k}`); continue; }
  if (parent[ks.at(-1)] !== v) { parent[ks.at(-1)] = v; applied++; }
}
const text = JSON.stringify(de);
fs.writeFileSync(dePath, text);
// Größenangabe im Sprachindex nachziehen (rein informativ, wie build-l10n)
const idxPath = path.join(root, 'public/l10n/index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
const ent = idx.find((c) => c.name === 'de-DE');
if (ent) { ent.bytes = Buffer.byteLength(text, 'utf8'); fs.writeFileSync(idxPath, JSON.stringify(idx)); }
console.log(`[fork-l10n] de-DE: ${applied} Texte gesetzt, ${Object.keys(src).length} im Wörterbuch`);
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
