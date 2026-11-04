// Fork: „Aus Terraria importieren“ — Liste der Spielstände des echten Terraria
// (lokal, tModLoader, Steam Cloud), geliefert vom Vite-Server über
// /__terraria/* (scripts/terraria-saves.mjs). Ein Klick importiert den Stand über
// den bestehenden Datei-Import (CharSelect.onImportFile / mainFlow.importWorldFile).
// Ohne diesen Server (z. B. reine statische Seite) bleibt nur „Datei wählen…“.
import { Lang } from '../i18n/Lang';
import { ensureStyle } from './CharSelect';
import { parsePlr } from '../save/PlrImport';
import { compositePaperDoll, dollFrame, IDLE_FRAME } from '../player/PaperDoll';
import { DIFFICULTY_INFO, type Appearance } from '../player/Appearance';

export interface TerrariaSave {
  id: string;
  file: string;
  name: string;
  version: number;
  difficulty?: number;
  source: 'terraria' | 'tmodloader' | 'cloud' | 'cloud-tmod';
  backup: boolean;
  bytes: number;
  mtime: number;
}

const TEXT = {
  de: {
    titlePlayer: 'Spieler aus Terraria',
    titleWorld: 'Welten aus Terraria',
    loading: 'Suche Spielstände …',
    nonePlayer: 'Keine Terraria-Spieler auf diesem Rechner gefunden.',
    noneWorld: 'Keine Terraria-Welten auf diesem Rechner gefunden.',
    unavailable: 'Die Terraria-Ordner können hier nicht direkt gelesen werden. Wähle die Datei selbst aus.',
    pathHint: (kind: string) => `Ordner am Mac: ~/Library/Application Support/Terraria/${kind} (im Finder: ⌘⇧G)`,
    browse: 'Datei wählen …',
    back: 'Zurück',
    source: { terraria: 'Terraria', tmodloader: 'tModLoader', cloud: 'Steam Cloud', 'cloud-tmod': 'Steam Cloud (tModLoader)' },
    backup: 'Sicherung',
    importing: 'Importiere …',
    tooOld: 'zu alt (vor 1.3)',
    diff: ['Classic', 'Mittelkern', 'Hardcore', 'Reise'],
  },
  en: {
    titlePlayer: 'Players from Terraria',
    titleWorld: 'Worlds from Terraria',
    loading: 'Looking for saves …',
    nonePlayer: 'No Terraria players found on this computer.',
    noneWorld: 'No Terraria worlds found on this computer.',
    unavailable: 'The Terraria folders can’t be read directly here. Pick the file yourself.',
    pathHint: (kind: string) => `Folder on Mac: ~/Library/Application Support/Terraria/${kind} (Finder: ⌘⇧G)`,
    browse: 'Choose file …',
    back: 'Back',
    source: { terraria: 'Terraria', tmodloader: 'tModLoader', cloud: 'Steam Cloud', 'cloud-tmod': 'Steam Cloud (tModLoader)' },
    backup: 'Backup',
    importing: 'Importing …',
    tooOld: 'too old (before 1.3)',
    diff: ['Classic', 'Mediumcore', 'Hardcore', 'Journey'],
  },
};
const T = () => ((Lang.activeCultureName ?? '').startsWith('de') ? TEXT.de : TEXT.en);

/** Terraria-Versionsnummer → Spielversion (grob, nur zur Anzeige) */
function gameVersion(v: number): string {
  const table: Array<[number, string]> = [
    [326, '1.4.5.8'], [315, '1.4.5'], [279, '1.4.4'], [248, '1.4.3'], [238, '1.4.2'], [230, '1.4.1'],
    [225, '1.4.0.5'], [194, '1.3.5'], [187, '1.3.4'], [173, '1.3.3'], [155, '1.3.1'], [146, '1.3.0'], [102, '1.2.4'],
  ];
  for (const [min, name] of table) if (v >= min) return name;
  return v ? `v${v}` : '';
}

const CSS = `
.sw-timp { z-index: 25; }
.sw-timp .sw-vitem.sw-timp-row { height: 64px; cursor: pointer; }
.sw-timp-row .sw-timp-ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  height: 40px; width: auto; image-rendering: pixelated; pointer-events: none; }
.sw-timp-row .sw-timp-doll { left: 14px; height: 52px; width: 37px; }
.sw-timp-row .sw-vitem-info { left: 66px; top: 10px; right: 12px; }
.sw-timp-row .sw-vitem-info .name, .sw-timp-row .sw-vitem-info .sub {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-timp-row.busy { opacity: .6; pointer-events: none; }
.sw-timp-row.bad { opacity: .45; pointer-events: none; }
.sw-timp-hint { color: #cfd6f4; font-size: 12px; text-align: center; margin-top: 8px;
  text-shadow: 1px 1px 0 #000; overflow-wrap: anywhere; }
`;
let styled = false;

/** Ruft die Liste ab; null = Server bietet /__terraria nicht an */
export async function fetchTerrariaSaves(): Promise<{ players: TerrariaSave[]; worlds: TerrariaSave[] } | null> {
  try {
    const r = await fetch('__terraria/saves', { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const j = await r.json() as { ok?: boolean; players?: TerrariaSave[]; worlds?: TerrariaSave[] };
    return j.ok ? { players: j.players ?? [], worlds: j.worlds ?? [] } : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Uint8Array>();
async function fetchSave(id: string): Promise<Uint8Array> {
  const hit = cache.get(id);
  if (hit) return hit;
  const r = await fetch(`__terraria/save?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  cache.set(id, bytes);
  return bytes;
}
const errText = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 80);

/** Standbild der Figur; Texturen laden evtl. noch → einige Frames erneut versuchen */
function drawDoll(cv: HTMLCanvasElement, a: Appearance, tries = 120): void {
  const doll = compositePaperDoll(a);
  if (!doll) {
    if (tries > 0 && cv.isConnected !== false) requestAnimationFrame(() => drawDoll(cv, a, tries - 1));
    return;
  }
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const f = dollFrame(doll, IDLE_FRAME);
  ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 40, 56);
}

export interface TerrariaImportOpts {
  kind: 'player' | 'world';
  /** wird während des Dialogs ausgeblendet */
  under?: HTMLElement;
  /** Datei importieren (Name endet auf .plr/.wld) */
  onFile(file: File): Promise<void>;
  /** normaler Dateidialog */
  onBrowse(): void;
}

/** Dialog öffnen. Schließt sich nach erfolgreichem Klick-Import selbst. */
export function openTerrariaImport(opts: TerrariaImportOpts): void {
  ensureStyle();
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const t = T();
  const ext = opts.kind === 'player' ? 'plr' : 'wld';
  const root = document.createElement('div');
  root.className = 'sw-vsel sw-timp';
  root.innerHTML = `
    <div class="sw-vsel-title sw-vbtn"></div>
    <div class="sw-vsel-panel sw-vpanel"><div class="sw-vsel-list"><div class="sw-vsel-empty"></div></div></div>
    <div class="sw-timp-hint"></div>
    <div class="sw-vsel-footer">
      <button class="sw-vbtn" data-act="back"></button>
      <button class="sw-vbtn" data-act="browse"></button>
    </div>`;
  root.querySelector('.sw-vsel-title')!.textContent = opts.kind === 'player' ? t.titlePlayer : t.titleWorld;
  root.querySelector('.sw-vsel-empty')!.textContent = t.loading;
  root.querySelector('.sw-timp-hint')!.textContent = t.pathHint(opts.kind === 'player' ? 'Players' : 'Worlds');
  root.querySelector('[data-act=back]')!.textContent = t.back;
  root.querySelector('[data-act=browse]')!.textContent = t.browse;
  const list = root.querySelector('.sw-vsel-list') as HTMLElement;

  const prevVis = opts.under?.style.visibility ?? '';
  if (opts.under) opts.under.style.visibility = 'hidden';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opts.under) opts.under.style.visibility = prevVis;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  root.querySelector('[data-act=back]')!.addEventListener('click', close);
  root.querySelector('[data-act=browse]')!.addEventListener('click', () => { close(); opts.onBrowse(); });
  (opts.under?.parentElement ?? document.body).appendChild(root);

  cache.clear();
  void (async () => {
    const saves = await fetchTerrariaSaves();
    if (closed) return;
    list.innerHTML = '';
    const empty = (msg: string) => {
      const d = document.createElement('div');
      d.className = 'sw-vsel-empty';
      d.textContent = msg;
      list.appendChild(d);
    };
    if (!saves) { empty(t.unavailable); return; }
    const entries = opts.kind === 'player' ? saves.players : saves.worlds;
    if (!entries.length) { empty(opts.kind === 'player' ? t.nonePlayer : t.noneWorld); return; }
    for (const s of entries) {
      const row = document.createElement('div');
      row.className = 'sw-vitem sw-vpanel-item sw-timp-row';
      const tooOld = opts.kind === 'world' ? s.version > 0 && s.version < 140 : s.version > 0 && s.version < 124;
      if (tooOld) row.classList.add('bad');
      const info = document.createElement('div');
      info.className = 'sw-vitem-info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = s.name;
      const sub = document.createElement('div');
      sub.className = 'sub';
      const bits = [t.source[s.source] ?? s.source];
      if (s.backup) bits.push(t.backup);
      if (opts.kind === 'player' && s.difficulty !== undefined && t.diff[s.difficulty]) bits.push(t.diff[s.difficulty]);
      const gv = gameVersion(s.version);
      if (gv) bits.push(gv);
      bits.push(new Date(s.mtime).toLocaleDateString(Lang.activeCultureName || undefined));
      if (tooOld) bits.push(t.tooOld);
      sub.textContent = bits.join(' · ');
      info.append(name, sub);
      let ico: HTMLElement;
      if (opts.kind === 'player') {
        // Spielerfigur wie in der Spielerauswahl (Datei ist klein → gleich laden und lesen)
        const cv = document.createElement('canvas');
        cv.className = 'sw-timp-ico sw-timp-doll';
        cv.width = 40; cv.height = 56;
        ico = cv;
        void (async () => {
          try {
            const bytes = await fetchSave(s.id);
            const a = parsePlr(bytes).appearance;
            const dc = DIFFICULTY_INFO[a.difficulty]?.color;
            if (dc) name.style.color = `rgb(${dc.r},${dc.g},${dc.b})`;
            drawDoll(cv, a);
          } catch (e) {
            if (!tooOld) { row.classList.add('bad'); sub.textContent += ` · ${errText(e)}`; }
          }
        })();
      } else {
        const img = document.createElement('img');
        img.className = 'sw-timp-ico';
        img.src = 'sprites/vanilla-ui/UI_IconCorruption.png';
        img.onerror = () => { img.remove(); };
        ico = img;
      }
      row.append(ico, info);
      row.addEventListener('click', async () => {
        if (row.classList.contains('busy')) return;
        row.classList.add('busy');
        const oldSub = sub.textContent;
        sub.textContent = t.importing;
        try {
          const bytes = await fetchSave(s.id);
          close();
          await opts.onFile(new File([bytes as BlobPart], `${s.file}.${ext}`, { type: 'application/octet-stream' }));
        } catch (e) {
          sub.textContent = `${oldSub} · ${errText(e)}`;
          row.classList.remove('busy');
        }
      });
      list.appendChild(row);
    }
  })();
}
