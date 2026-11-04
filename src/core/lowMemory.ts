// Fork: Sparmodus für Geräte mit knappem Arbeitsspeicher (iPhone/iPad: iOS beendet den
// Web-Prozess bei ~1,5 GB → App „startet neu“, Welt ungespeichert).
// Aktiv in der iPhone/iPad-App, in Safari auf iPhone/iPad und mit ?lowmem=1 (?lowmem=0 = aus).
//  - NPC-/Gegner-Grafiken nicht alle beim Weltstart laden (bei Bedarf, liegen lokal)
//  - nur 1 entpacktes Musikstück im Speicher
//  - kleinerer Tile-Cache
//  - Weltgenerierungs-Worker nach dem Erstellen beenden
let cached: boolean | null = null;
export function lowMemoryMode(): boolean {
  if (cached !== null) return cached;
  let v = false;
  try {
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    if (q.get('lowmem') === '0') v = false;
    else if (q.get('lowmem') === '1') v = true;
    else if (typeof window !== 'undefined' && (window as unknown as { __otNative?: unknown }).__otNative) v = true;
    else if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
      v = /iPhone|iPad|iPod/.test(ua) || iPadOS;
    }
  } catch { v = false; }
  cached = v;
  return v;
}
