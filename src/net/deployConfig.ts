// Fork: Server-Deployment (deploy/ — Docker + Caddy). Läuft das Spiel auf einem eigenen
// Server, liefert dieser /ot-deploy.json:
//   { bridge: "/bridge", servers: [{ name, host, port }] }
// bridge  = Pfad der WebSocket⇄TCP-Brücke auf demselben Host (wss bei https)
// servers = Terraria-Server, die man von dort direkt beitreten kann (z. B. der kleine
//           Server aus docker-compose, Profil „terraria“)
// Ohne Deployment (lokal, Mac-App, iPhone-App) gibt es die Datei nicht → null.
export interface DeployServer { name: string; host: string; port: number }
export interface DeployConfig { bridge: string; servers: DeployServer[] }

let cfg: DeployConfig | null = null;
let loaded: Promise<DeployConfig | null> | null = null;

export function loadDeployConfig(): Promise<DeployConfig | null> {
  if (loaded) return loaded;
  loaded = (async () => {
    if (typeof fetch === 'undefined' || typeof location === 'undefined') return null;
    if ((window as unknown as { __otNative?: unknown }).__otNative) return null;
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('ot-deploy.json', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) return null;
      const j = await r.json() as Partial<DeployConfig>;
      if (typeof j?.bridge !== 'string' || !j.bridge.startsWith('/')) return null;
      const servers = Array.isArray(j.servers) ? j.servers.filter((s): s is DeployServer =>
        !!s && typeof s.host === 'string' && /^[a-z0-9.-]{1,253}$/i.test(s.host)
        && Number.isInteger(s.port) && s.port > 0 && s.port < 65536).map((s) => ({
        name: String(s.name ?? s.host).slice(0, 40), host: s.host, port: s.port,
      })) : [];
      cfg = { bridge: j.bridge.replace(/\/+$/, ''), servers };
      return cfg;
    } catch { return null; }
  })();
  return loaded;
}

export function deployConfig(): DeployConfig | null { return cfg; }

/** WebSocket-URL der Brücke dieses Hosts für Ziel host:port (nur im Deployment) */
export function deployBridgeUrl(host: string, port: number): string | null {
  if (!cfg) return null;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${cfg.bridge}/?host=${encodeURIComponent(host)}&port=${port}`;
}
