// 联机面板 v3：中央服务器房间制（docs/multiplayer-design.md §房间）。
// lobby HTTP（:lobbyPort）= 房间列表/建房/码校验；WS（lobbyPort-1）/<房间码>?token=。
// 房主：选存档建房（勾选公开性 + 破坏保护 + 物品保护）→ 得 6 位房间码 → 进房。
// 其他玩家：房间列表点击加入，或输房间码进非公开房。
// 文案 = Mods.SandboxWorld.MP.*（自制联机 UI,原版无对应键）
import { Lang } from '../i18n/Lang';
import { ensureVanillaKit } from './vanillaKit';
const T = (k: string, ...a: (string | number)[]) => Lang.text(`Mods.SandboxWorld.MP.${k}`, ...a);
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface SaveEntry { id: number; name: string; json: string | null }

export interface MultiplayerSelectCallbacks {
  /** 连接原版(1.4.5.x)专用服（vanilla interop P0,2026-10-25）。
   *  target = host:port（原版服本体地址,浏览器经本地桥 vanillaBridge 转发接入） */
  onJoinVanilla: (target: string) => void;
  /** 加入房间（完整 ws URL：ws://host:wsPort/<房间码>[?token=...]）。
   *  worldId=建房链进房时传入的本机世界槽位 id（★BJ704-G7 件1:playedWorlds 绑定;
   *  码入房/房间列表进房不传=undefined） */
  onJoinRoom: (url: string, hostToken: string, worldId?: number) => void;
  /** 创建房间资产链(2026-08-25 用户要求,单人式流程):角色选择 → 世界列表 →
   *  then(saveJson, worldName, worldId?) 继续建房（worldId=选定世界槽位 id） */
  onCreateRoomFlow: (then: (worldJson: string, worldName: string, worldId?: number) => void) => void;
  /** 加入/创建前需要角色(2026-08-25 用户要求):跳转既有单人角色列表
   *  (CharSelectPanel 覆盖层,多人面板保持挂载)——选完 then() 继续动作 */
  onNeedCharacter: (then: () => void) => void;
  onBack: () => void;
  /** Fork: Browser-Welt (Save-JSON) → .wld-Bytes für den echten Terraria-Server */
  exportWld?: (worldJson: string) => Promise<Uint8Array>;
  /** Fork: .wld vom LAN-Rechner zurück in die Browser-Weltenliste übernehmen */
  importWld?: (bytes: Uint8Array, name: string) => Promise<void>;
}

export interface RoomListItem {
  code: string; name: string; online: number; maxPlayers: number; w: number; h: number;
  protectTiles: boolean; protectItems: boolean;
}

const DEFAULT_SERVER = '127.0.0.1:7778'; // lobby 端口（WS = lobby-1）

/** 地址 → { httpBase, wsBase }（lobby 端口约定：WS 在 lobby-1） */
function serverBase(addr: string): { httpBase: string; wsBase: string } | null {
  const a = addr.trim();
  if (!a) return null;
  const m = a.match(/^(\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d+))?$/i);
  if (!m) return null;
  const lobbyPort = m[2] ? parseInt(m[2], 10) : 7778;
  return { httpBase: `http://${m[1]}:${lobbyPort}`, wsBase: `ws://${m[1]}:${lobbyPort - 1}` };
}

export class MultiplayerSelect {
  root: HTMLElement;
  private lan: LanSection;
  private roomList = el('div');
  private codeInput: HTMLInputElement;
  private vanInput: HTMLInputElement;
  private createName: HTMLInputElement;
  private createPublic: HTMLInputElement;
  private createTiles: HTMLInputElement;
  private createItems: HTMLInputElement;
  private createPvp: HTMLInputElement;
  private createdInfo = el('div');
  private hostCode = '';
  private hostToken = '';
  private status = (elm: HTMLElement, text: string, color = '#8b98bd') => {
    elm.textContent = text;
    elm.style.color = color;
  };

  constructor(private cb: MultiplayerSelectCallbacks) {
    ensureVanillaKit();
    ensureMpStyle();
    this.root = el('div', 'sw-mp');
    const title = el('div', 'sw-mp-title sw-vbtn', L().title);
    this.root.appendChild(title);
    const body = el('div', 'sw-mp-body sw-vpanel');
    this.root.appendChild(body);
    this.lan = new LanSection(body, cb);
    // Alter Projekt-Server (Raumcode): braucht den nicht mitgelieferten SandboxWorld-Server → eingeklappt
    const adv = el('details', 'sw-mp-adv');
    adv.appendChild(el('summary', undefined, L().advanced));
    body.appendChild(adv);
    const legacy = el('div');
    adv.appendChild(legacy);
    const footer = el('div', 'sw-mp-footer');
    const backBtn = el('button', 'sw-vbtn', Lang.text('UI.Back')) as HTMLButtonElement;
    backBtn.onclick = () => { this.lan.destroy(); cb.onBack(); };
    const refBtn = el('button', 'sw-vbtn', L().refresh) as HTMLButtonElement;
    refBtn.onclick = () => void this.lan.refresh();
    footer.append(backBtn, refBtn);
    this.root.appendChild(footer);
    const realRoot = this.root;
    this.root = legacy;   // der alte Aufbau unten hängt sich in den eingeklappten Bereich

    // ---- 角色选择不再自造列表(2026-08-25 用户要求):加入/创建时经
    //      onNeedCharacter 跳转既有单人角色列表(CharSelectPanel) ----

    // ---- 加入：房间列表(2026-08-25 用户要求:刷新按钮在列表下方) ----
    const sJoin = el('div', undefined, T('JoinSection'));
    sJoin.style.cssText = 'margin:10px 0 6px; color:#c9d4ff;';
    this.root.appendChild(sJoin);
    this.roomList.style.cssText = 'min-height:60px; max-height:220px; overflow-y:auto; background:rgba(10,16,40,0.5); border-radius:4px; padding:4px; margin-bottom:8px;';
    this.root.appendChild(this.roomList);
    const srvRow = el('div');
    srvRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:10px;';
    const srvBtn = el('button', 'sw-btn', T('Refresh')) as HTMLButtonElement;
    srvBtn.style.cssText = 'width:auto; margin:0; padding:8px 12px; flex:none;';
    srvBtn.onclick = () => void this.refreshRooms();
    srvRow.appendChild(srvBtn);
    this.root.appendChild(srvRow);

    // 码加入（非公开房）
    const codeRow = el('div');
    codeRow.style.cssText = 'display:flex; gap:8px;';
    this.codeInput = el('input') as HTMLInputElement;
    this.codeInput.placeholder = T('RoomCodeHint');
    this.codeInput.style.cssText = 'flex:1; padding:8px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    const codeBtn = el('button', 'sw-btn', T('JoinByCode')) as HTMLButtonElement;
    codeBtn.style.cssText = 'width:auto; margin:0; padding:8px 14px; flex:none;';
    codeBtn.onclick = () => {
      const code = this.codeInput.value.trim();
      if (!/^\d{6}$/.test(code)) { this.status(this.roomList, T('BadCode'), '#ff6b6b'); return; }
      this.cb.onNeedCharacter(() => void this.joinByCode());
    };
    this.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') codeBtn.click(); });
    codeRow.appendChild(this.codeInput);
    codeRow.appendChild(codeBtn);
    this.root.appendChild(codeRow);

    // ---- 连接原版服务器（vanilla interop 全功能:PvE/PvP 战斗/挖掘建造/箱子/物品/弹幕/液体均已接线,
    //      2026-10-25 战役收官;遗留债见 memory/vanilla-server-interop-scope）----
    const vanHr = el('hr');
    vanHr.style.cssText = 'border:none; border-top:1px solid rgba(90,120,220,0.3); margin:14px 0;';
    this.root.appendChild(vanHr);
    const sVanilla = el('div', undefined, T('VanillaSection'));
    sVanilla.style.cssText = 'margin:0 0 6px; color:#c9d4ff;';
    this.root.appendChild(sVanilla);
    const vanRow = el('div');
    vanRow.style.cssText = 'display:flex; gap:8px;';
    this.vanInput = el('input') as HTMLInputElement;
    this.vanInput.value = '127.0.0.1:7781';
    this.vanInput.placeholder = T('VanillaAddrHint');
    this.vanInput.style.cssText = 'flex:1; padding:8px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    const vanBtn = el('button', 'sw-btn', T('JoinVanilla')) as HTMLButtonElement;
    vanBtn.style.cssText = 'width:auto; margin:0; padding:8px 14px; flex:none;';
    vanBtn.onclick = () => {
      const target = this.vanInput.value.trim();
      if (!/^[\w.-]+:\d+$/.test(target)) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return; }
      this.cb.onNeedCharacter(() => this.cb.onJoinVanilla(target));
    };
    this.vanInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') vanBtn.click(); });
    vanRow.appendChild(this.vanInput);
    vanRow.appendChild(vanBtn);
    this.root.appendChild(vanRow);
    const vanNote = el('div', undefined, T('VanillaBridgeNote'));
    vanNote.style.cssText = 'font-size:12px; color:#8b98bd; margin:4px 0 0;';
    this.root.appendChild(vanNote);

    // ---- 分隔 ----
    const hr = el('hr');
    hr.style.cssText = 'border:none; border-top:1px solid rgba(90,120,220,0.3); margin:14px 0;';
    this.root.appendChild(hr);

    // ---- 建房（房主） ----
    const sHost = el('div', undefined, T('HostSection'));
    sHost.style.cssText = 'margin:0 0 6px; color:#c9d4ff;';
    this.root.appendChild(sHost);

    // 存档选择器已移除(2026-08-25 用户要求):创建房间走 角色选择 → 世界列表
    // (onCreateRoomFlow,单人式流程),选中的世界 JSON 在链尾传入 createRoom

    this.createName = el('input') as HTMLInputElement;
    this.createName.placeholder = T('RoomNameHint');
    this.createName.style.cssText = 'width:100%; box-sizing:border-box; padding:6px; margin-bottom:6px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    this.root.appendChild(this.createName);

    const mkCheck = (label: string, checked: boolean): HTMLInputElement => {
      const wrap = el('label');
      wrap.style.cssText = 'display:flex; align-items:center; gap:6px; color:#c9d4ff; font-size:13px; margin:2px 0;';
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = checked;
      wrap.appendChild(box);
      wrap.appendChild(el('span', undefined, label));
      this.root.appendChild(wrap);
      return box;
    };
    this.createPublic = mkCheck(T('PublicRoom'), true);
    this.createTiles = mkCheck(T('TileProtect'), false);
    this.createItems = mkCheck(T('ItemProtect'), false);
    this.createPvp = mkCheck(T('PvpAllow'), false);

    const createBtn = el('button', 'sw-btn', T('Create')) as HTMLButtonElement;
    createBtn.style.margin = '8px 0 4px';
    createBtn.onclick = () => {
      // 单人式资产链:角色选择 → 世界列表 → 建房(2026-08-25 用户要求)
      this.cb.onCreateRoomFlow((worldJson, worldName, worldId) => void this.createRoom(createBtn, worldJson, worldName, worldId));
    };
    this.root.appendChild(createBtn);

    this.createdInfo.style.cssText = 'min-height:18px; font-size:13px; color:#8b98bd; word-break:break-all;';
    this.root.appendChild(this.createdInfo);

    this.root = realRoot;
    adv.addEventListener('toggle', () => { if (adv.open) void this.refreshRooms(); });
  }

  // ================= 加入 =================

  private joinUrl(code: string, token = ''): string | null {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return null; }
    return token ? `${base.wsBase}/${code}?token=${encodeURIComponent(token)}` : `${base.wsBase}/${code}`;
  }

  private async refreshRooms() {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return; }
    this.status(this.roomList, T('Fetching'));
    try {
      const r = await fetch(`${base.httpBase}/rooms`);
      const data = await r.json() as { ok: boolean; rooms: RoomListItem[] };
      if (!data.ok) throw new Error('bad response');
      this.roomList.textContent = '';
      if (!data.rooms.length) {
        this.status(this.roomList, T('NoRooms'));
        return;
      }
      for (const rm of data.rooms) {
        const item = el('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid rgba(90,120,220,0.2); cursor:pointer;';
        item.onmouseenter = () => { item.style.background = 'rgba(60,80,160,0.3)'; };
        item.onmouseleave = () => { item.style.background = ''; };
        const prot = [rm.protectTiles ? '🛡' + T('Shield') : '', rm.protectItems ? '📦' + T('Box') : ''].filter(Boolean).join(' ');
        const left = el('div', undefined, `${rm.name}  ${rm.w}×${rm.h}${prot ? '  ' + prot : ''}`);
        left.style.cssText = 'color:#e8ecf8; font-size:13px;';
        const right = el('div', undefined, `👤${rm.online}/${rm.maxPlayers ?? 255}  [${rm.code}]`);
        right.style.cssText = 'color:#8b98bd; font-size:12px;';
        item.appendChild(left);
        item.appendChild(right);
        item.onclick = () => {
          this.cb.onNeedCharacter(() => {
            const url = this.joinUrl(rm.code);
            if (url) this.cb.onJoinRoom(url, '');
          });
        };
        this.roomList.appendChild(item);
      }
    } catch {
      // ★连不上=列表为空(2026-08-25 用户要求:不报错不暴露服务器细节)
      this.status(this.roomList, T('NoRooms'));
    }
  }

  private async joinByCode() {
    const code = this.codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) { this.status(this.roomList, T('BadCode'), '#ff6b6b'); return; }
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return; }
    this.status(this.roomList, T('Checking', code));
    try {
      const r = await fetch(`${base.httpBase}/rooms/${code}`);
      if (!r.ok) throw new Error(await r.json().then((d: { error?: string }) => d.error ?? T('RoomNotFound')).catch(() => T('RoomNotFound')));
      const url = this.joinUrl(code);
      if (url) this.cb.onJoinRoom(url, '');
    } catch (e) {
      this.status(this.roomList, (e as Error).message, '#ff6b6b');
    }
  }

  // ================= 建房 =================

  private async createRoom(btn: HTMLButtonElement, worldJson: string, worldName: string, worldId?: number) {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.createdInfo, T('BadAddr'), '#ff6b6b'); return; }
    btn.disabled = true;
    this.status(this.createdInfo, T('Uploading'));
    try {
      const r = await fetch(`${base.httpBase}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.createName.value.trim() || worldName,
          public: this.createPublic.checked,
          protectTiles: this.createTiles.checked,
          protectItems: this.createItems.checked,
          pvpAllowed: this.createPvp.checked,
          save: worldJson,
        }),
      });
      const data = await r.json() as { ok: boolean; code?: string; hostToken?: string; error?: string };
      if (!data.ok || !data.code || !data.hostToken) throw new Error(data.error ?? T('CreateFail'));
      this.hostCode = data.code;
      this.hostToken = data.hostToken;
      this.status(this.createdInfo, T('RoomCreated', data.code) + (this.createPublic.checked ? '' : T('RoomPrivateNote')), '#7dff8a');
      const enter = el('button', 'sw-btn', T('EnterRoom', data.code)) as HTMLButtonElement;
      enter.style.cssText = 'width:auto; margin:6px 0 0; display:block;';
      enter.onclick = () => {
        const url = this.joinUrl(this.hostCode, this.hostToken);
        if (url) this.cb.onJoinRoom(url, this.hostToken, worldId);   // ★BJ704-G7 件1:建房世界槽位 id 随进房下传
      };
      this.createdInfo.appendChild(enter);
      // 建房成功后房间码所在房可能进列表（公开时）——轻刷一次
      void this.refreshRooms();
    } catch (e) {
      this.status(this.createdInfo, T('CreateFailDetail', (e as Error).message), '#ff6b6b');
    } finally {
      btn.disabled = false;
    }
  }
}

// ====================================================================
// Fork: LAN-Welten über den ECHTEN Terraria-Server (scripts/lan-host.mjs)
// --------------------------------------------------------------------
// Der Rechner, der das Spiel ausliefert (Mac mit Steam-Terraria), startet
// TerrariaServer-Prozesse; Browser (auch iPad/Handy) treten über die
// WebSocket-Brücke desselben Helfers bei. Auch das echte Terraria am PC kann
// diesen Servern über "Über IP beitreten" beitreten.
// ====================================================================

const MP_TEXT = {
  de: {
    title: 'Mehrspieler',
    lan: 'LAN-Welten',
    helperOk: (h: string) => `LAN-Rechner: ${h}`,
    helperMissing: 'LAN-Helfer nicht erreichbar. Am Mac starten: npm run lan',
    noTerraria: 'Terraria-Server nicht gefunden – Hosten nicht möglich (Beitreten geht).',
    noServers: 'Keine Welt wird gerade gehostet.',
    players: (n: number) => (n === 1 ? '1 Spieler' : `${n} Spieler`),
    generating: 'Welt wird erstellt …',
    starting: 'Startet …',
    join: 'Beitreten',
    stop: 'Beenden',
    hostTitle: 'Welt hosten',
    hostBrowser: 'Eigene Welt',
    hostNew: 'Neue Welt',
    hostFiles: 'Gespeicherte LAN-Welten',
    host: 'Hosten',
    toBrowser: 'In Browser übernehmen',
    imported: 'Welt übernommen – zu finden unter Einzelspieler.',
    name: 'Name',
    sizes: ['Klein', 'Mittel', 'Groß'],
    diffs: ['Normal', 'Experte', 'Meister', 'Reise'],
    create: 'Erstellen und hosten',
    ipTitle: 'Über IP beitreten',
    ipHint: 'IP:Port (z. B. 192.168.1.20:7777)',
    badAddr: 'Adresse im Format IP:Port eingeben',
    uploading: 'Welt wird übertragen …',
    waitReady: 'Server startet …',
    failed: (e: string) => `Fehler: ${e}`,
    advanced: 'Projekt-Server (Raumcode)',
    refresh: 'Aktualisieren',
    pcNote: (ip: string) => `Echtes Terraria am PC: Mehrspieler → Über IP beitreten → ${ip}`,
  },
  en: {
    title: 'Multiplayer',
    lan: 'LAN worlds',
    helperOk: (h: string) => `LAN host: ${h}`,
    helperMissing: 'LAN helper not reachable. On the Mac run: npm run lan',
    noTerraria: 'Terraria server not found – hosting unavailable (joining works).',
    noServers: 'No world is being hosted right now.',
    players: (n: number) => (n === 1 ? '1 player' : `${n} players`),
    generating: 'Creating world …',
    starting: 'Starting …',
    join: 'Join',
    stop: 'Stop',
    hostTitle: 'Host a world',
    hostBrowser: 'My world',
    hostNew: 'New world',
    hostFiles: 'Saved LAN worlds',
    host: 'Host',
    toBrowser: 'Copy to browser',
    imported: 'World copied – find it under Single Player.',
    name: 'Name',
    sizes: ['Small', 'Medium', 'Large'],
    diffs: ['Classic', 'Expert', 'Master', 'Journey'],
    create: 'Create and host',
    ipTitle: 'Join via IP',
    ipHint: 'IP:port (e.g. 192.168.1.20:7777)',
    badAddr: 'Enter the address as IP:port',
    uploading: 'Sending world …',
    waitReady: 'Server is starting …',
    failed: (e: string) => `Error: ${e}`,
    advanced: 'Project server (room code)',
    refresh: 'Refresh',
    pcNote: (ip: string) => `Real Terraria on PC: Multiplayer → Join via IP → ${ip}`,
  },
};
function L() { return (Lang.activeCultureName ?? '').startsWith('de') ? MP_TEXT.de : MP_TEXT.en; }

interface LanServerInfo { port: number; name: string; ready: boolean; generating: boolean; progress: string; players: string[] }
interface LanWorldInfo { file: string; name: string; source: 'browser' | 'terraria'; bytes: number; mtime: number }
interface LanStatus { ok: boolean; terraria: boolean; ips: string[]; servers: LanServerInfo[]; worlds: LanWorldInfo[] }

/** Fork: nur IP-Literale aus dem eigenen Netz (127/10/172.16-31/192.168, ::1, fc/fd, fe80) */
export function isLocalNetAddr(h: string): boolean {
  const a = h.replace(/^\[|\]$/g, '').toLowerCase();
  if (a === 'localhost' || a === '::1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (m) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    return x === 127 || x === 10 || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31) || (x === 169 && y === 254);
  }
  // IPv6: nur reine Hex-/Doppelpunkt-Literale (voll verankert, keine Zusätze wie „@host“)
  return /^[0-9a-f:]+$/.test(a) && a.includes(':') && /^(f[cd]|fe[89ab])[0-9a-f]{0,2}:/.test(a);
}
function helperBase(): string {
  const q = new URLSearchParams(location.search);
  const p = q.get('lanhost');
  const host = p && isLocalNetAddr(p) ? p : (location.hostname || '127.0.0.1');
  const port = /^\d{2,5}$/.test(q.get('vbridge') ?? '') ? q.get('vbridge')! : '5290';
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${h}:${port}`;
}

let mpStyleDone = false;
function ensureMpStyle(): void {
  if (mpStyleDone) return;
  mpStyleDone = true;
  const st = document.createElement('style');
  st.textContent = `
.sw-mp { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20;
  width: min(92vw, 680px); max-height: 92vh; max-height: 92dvh; display: flex; flex-direction: column;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; color: #fff; cursor: auto; }
.sw-mp-title { align-self: center; padding: 8px 26px; margin-bottom: 12px; font-size: 20px; white-space: nowrap;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-mp-body { padding: 14px; overflow-y: auto; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 10px; }
.sw-mp h3 { margin: 4px 0 0; font-size: 17px; font-weight: normal; color: #fff;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-mp .sw-mp-note { font-size: 13px; color: #cfd6f4; text-shadow: 1px 1px 0 #000; }
.sw-mp .sw-mp-note.err { color: #ff9a8a; }
.sw-mp-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 52px; }
.sw-mp-row .info { flex: 1; min-width: 0; }
.sw-mp-row .info .n { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-mp-row .info .s { font-size: 12px; color: #cfd6f4; text-shadow: 1px 1px 0 #000; }
.sw-mp .sw-vbtn { min-height: 40px; padding: 6px 14px; font-size: 15px; color: #fff; cursor: pointer; flex: none; }
.sw-mp-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.sw-mp-tabs .sw-vbtn.on { color: #ffe745; }
.sw-mp-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sw-mp input[type=text], .sw-mp select { min-height: 40px; padding: 6px 10px; font: inherit; font-size: 15px; color: #fff;
  background: rgba(20, 28, 60, 0.85); border: 2px solid #0b1030; border-radius: 4px; flex: 1 1 160px; min-width: 0; }
.sw-mp-footer { display: flex; gap: 10px; margin-top: 12px; }
.sw-mp-footer .sw-vbtn { flex: 1; height: 50px; font-size: 17px; }
.sw-mp-adv summary { cursor: pointer; color: #cfd6f4; font-size: 13px; }
.sw-mp-adv[open] { background: rgba(10, 16, 40, 0.35); padding: 8px; border-radius: 4px; }
@media (hover: none) and (pointer: coarse) { .sw-mp .sw-vbtn { min-height: 46px; } }
`;
  document.head.appendChild(st);
}

class LanSection {
  private status: LanStatus | null = null;
  private statusEl: HTMLElement;
  private serversEl: HTMLElement;
  private hostEl: HTMLElement;
  private hostTab: 'browser' | 'new' | 'files' = 'new';
  private msgEl: HTMLElement;
  private ipInput: HTMLInputElement;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Port, dem nach dem Hosten automatisch beigetreten wird, sobald der Server bereit ist */
  private autoJoinPort: number | null = null;
  private destroyed = false;
  private seenMounted = false;

  constructor(parent: HTMLElement, private cb: MultiplayerSelectCallbacks) {
    const t = L();
    parent.appendChild(el('h3', undefined, t.lan));
    this.statusEl = el('div', 'sw-mp-note');
    parent.appendChild(this.statusEl);
    this.serversEl = el('div');
    this.serversEl.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
    parent.appendChild(this.serversEl);
    parent.appendChild(el('h3', undefined, t.hostTitle));
    this.hostEl = el('div');
    this.hostEl.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
    parent.appendChild(this.hostEl);
    this.msgEl = el('div', 'sw-mp-note');
    parent.appendChild(this.msgEl);
    parent.appendChild(el('h3', undefined, t.ipTitle));
    const ipRow = el('div', 'sw-mp-form');
    this.ipInput = el('input') as HTMLInputElement;
    this.ipInput.type = 'text';
    this.ipInput.placeholder = t.ipHint;
    this.ipInput.value = `${location.hostname || '127.0.0.1'}:7777`;
    const ipBtn = el('button', 'sw-vbtn', t.join) as HTMLButtonElement;
    ipBtn.onclick = () => {
      const v = this.ipInput.value.trim();
      if (!/^[\w.-]+:\d+$/.test(v)) { this.msg(t.badAddr, true); return; }
      this.joinTarget(v);
    };
    this.ipInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ipBtn.click(); });
    ipRow.append(this.ipInput, ipBtn);
    parent.appendChild(ipRow);
    this.renderHost();
    void this.refresh();
    this.timer = setInterval(() => { if (!this.destroyed) void this.refresh(); }, 2000);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
  }

  private msg(text: string, err = false): void {
    this.msgEl.textContent = text;
    this.msgEl.classList.toggle('err', err);
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(`${helperBase()}${path}`, { cache: 'no-store', ...init });
    const data = await r.json() as T & { ok?: boolean; error?: string };
    if (!r.ok || data.ok === false) throw new Error(data.error ?? `HTTP ${r.status}`);
    return data;
  }

  async refresh(): Promise<void> {
    // Panel entfernt (Zurück/Beitreten) → Abfragen einstellen; vor dem ersten Einhängen nicht
    if (this.statusEl.isConnected) this.seenMounted = true;
    else if (this.seenMounted) { this.destroy(); return; }
    const t = L();
    try {
      this.status = await this.api<LanStatus>('/api/status');
    } catch {
      this.status = null;
    }
    if (this.destroyed) return;
    const st = this.status;
    if (!st) {
      this.statusEl.textContent = t.helperMissing;
      this.statusEl.classList.add('err');
    } else {
      const ip = st.ips[0] ?? location.hostname;
      this.statusEl.textContent = `${t.helperOk(ip)}${st.terraria ? '' : ` · ${t.noTerraria}`}`;
      this.statusEl.classList.toggle('err', !st.terraria);
    }
    this.renderServers();
    if (this.hostTab === 'files') this.renderHost();
    // automatisch beitreten, sobald der eben gehostete Server bereit ist
    if (this.autoJoinPort != null && st) {
      const s = st.servers.find((x) => x.port === this.autoJoinPort);
      if (s?.ready) { const port = this.autoJoinPort; this.autoJoinPort = null; this.cb.onJoinVanilla(`127.0.0.1:${port}`); }
      else if (s) this.msg(s.generating ? `${L().generating} ${s.progress.split(' - ')[0]}` : L().waitReady);
      else { this.autoJoinPort = null; this.msg(L().failed('Server beendet'), true); }
    }
  }

  private renderServers(): void {
    const t = L();
    this.serversEl.textContent = '';
    const list = this.status?.servers ?? [];
    if (!this.status) return;
    if (!list.length) { this.serversEl.appendChild(el('div', 'sw-mp-note', t.noServers)); return; }
    for (const s of list) {
      const row = el('div', 'sw-mp-row sw-vpanel-item');
      const info = el('div', 'info');
      info.appendChild(el('div', 'n', s.name));
      const sub = s.ready ? `${t.players(s.players.length)} · Port ${s.port}`
        : s.generating ? `${t.generating} ${s.progress.split(' - ')[0]}` : t.starting;
      info.appendChild(el('div', 's', sub));
      row.appendChild(info);
      const join = el('button', 'sw-vbtn', t.join) as HTMLButtonElement;
      join.disabled = !s.ready;
      join.style.opacity = s.ready ? '' : '0.5';
      join.onclick = () => this.joinTarget(`127.0.0.1:${s.port}`);
      const stop = el('button', 'sw-vbtn', t.stop) as HTMLButtonElement;
      stop.onclick = () => void this.api('/api/stop', { method: 'POST', body: JSON.stringify({ port: s.port }) }).then(() => this.refresh());
      row.append(join, stop);
      this.serversEl.appendChild(row);
    }
    const ip = this.status.ips[0];
    if (ip && list.some((s) => s.ready)) this.serversEl.appendChild(el('div', 'sw-mp-note', t.pcNote(`${ip}:${list.find((s) => s.ready)!.port}`)));
  }

  /** Beitreten braucht einen Charakter → Charakterauswahl, dann verbinden */
  private joinTarget(target: string): void {
    this.cb.onNeedCharacter(() => this.cb.onJoinVanilla(target));
  }

  private renderHost(): void {
    const t = L();
    this.hostEl.textContent = '';
    const tabs = el('div', 'sw-mp-tabs');
    const mkTab = (id: 'browser' | 'new' | 'files', label: string) => {
      const b = el('button', `sw-vbtn${this.hostTab === id ? ' on' : ''}`, label) as HTMLButtonElement;
      b.onclick = () => { this.hostTab = id; this.renderHost(); };
      tabs.appendChild(b);
    };
    mkTab('new', t.hostNew);
    mkTab('browser', t.hostBrowser);
    mkTab('files', t.hostFiles);
    this.hostEl.appendChild(tabs);
    if (this.hostTab === 'new') {
      const form = el('div', 'sw-mp-form');
      const name = el('input') as HTMLInputElement;
      name.type = 'text';
      name.placeholder = t.name;
      name.value = 'LAN-Welt';
      const size = el('select') as HTMLSelectElement;
      t.sizes.forEach((s, i) => size.appendChild(new Option(s, ['small', 'medium', 'large'][i])));
      const diff = el('select') as HTMLSelectElement;
      t.diffs.forEach((s, i) => diff.appendChild(new Option(s, ['normal', 'expert', 'master', 'journey'][i])));
      const go = el('button', 'sw-vbtn', t.create) as HTMLButtonElement;
      go.onclick = () => this.cb.onNeedCharacter(() => void this.host({ create: { name: name.value, size: size.value, difficulty: diff.value } }));
      form.append(name, size, diff, go);
      this.hostEl.appendChild(form);
    } else if (this.hostTab === 'browser') {
      // Charakter → Welt aus der Browser-Liste → als .wld an den Server → hosten → beitreten
      const go = el('button', 'sw-vbtn', `${t.hostBrowser} …`) as HTMLButtonElement;
      go.onclick = () => this.cb.onCreateRoomFlow((json, worldName) => void this.hostBrowserWorld(json, worldName));
      this.hostEl.appendChild(go);
    } else {
      const worlds = this.status?.worlds ?? [];
      if (!worlds.length) this.hostEl.appendChild(el('div', 'sw-mp-note', '—'));
      for (const w of worlds.slice(0, 30)) {
        const row = el('div', 'sw-mp-row sw-vpanel-item');
        const info = el('div', 'info');
        info.appendChild(el('div', 'n', w.name));
        info.appendChild(el('div', 's', `${w.source === 'terraria' ? 'Terraria' : 'LAN'} · ${(w.bytes / 1048576).toFixed(1)} MB · ${new Date(w.mtime).toLocaleString()}`));
        row.appendChild(info);
        const host = el('button', 'sw-vbtn', t.host) as HTMLButtonElement;
        host.onclick = () => this.cb.onNeedCharacter(() => void this.host({ file: w.file }));
        row.appendChild(host);
        if (this.cb.importWld) {
          const imp = el('button', 'sw-vbtn', t.toBrowser) as HTMLButtonElement;
          imp.onclick = () => void this.importToBrowser(w);
          row.appendChild(imp);
        }
        this.hostEl.appendChild(row);
      }
    }
  }

  private async host(body: { file?: string; create?: { name: string; size: string; difficulty: string } }): Promise<void> {
    try {
      this.msg(L().waitReady);
      const r = await this.api<{ port: number }>('/api/host', { method: 'POST', body: JSON.stringify(body) });
      this.autoJoinPort = r.port;
      await this.refresh();
    } catch (e) {
      this.msg(L().failed((e as Error).message), true);
    }
  }

  private async hostBrowserWorld(json: string, worldName: string): Promise<void> {
    if (!this.cb.exportWld) return;
    try {
      this.msg(L().uploading);
      const bytes = await this.cb.exportWld(json);
      const up = await this.api<{ file: string }>(`/api/upload?replace=1&name=${encodeURIComponent(worldName)}`, {
        method: 'POST', body: bytes as BodyInit,
      });
      await this.host({ file: up.file });
    } catch (e) {
      this.msg(L().failed((e as Error).message), true);
    }
  }

  private async importToBrowser(w: LanWorldInfo): Promise<void> {
    try {
      const r = await fetch(`${helperBase()}/api/world?file=${encodeURIComponent(w.file)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await this.cb.importWld!(new Uint8Array(await r.arrayBuffer()), w.name);
      this.msg(L().imported);
    } catch (e) {
      this.msg(L().failed((e as Error).message), true);
    }
  }
}
