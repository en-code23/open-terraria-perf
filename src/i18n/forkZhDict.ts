// Fork: Laufzeit-Übersetzung für hart kodierte chinesische UI-Texte (Upstream ist
// ein chinesisches Projekt; viele Toasts/Fallbacks sind nicht in l10n). Wird von
// TerrariaSkin auf DOM-Text und Canvas-fillText angewendet. Unbekannte Texte mit
// CJK-Zeichen werden einmalig per console.debug gemeldet ([zh-miss]).

type Tr = { en: string; de: string };

/** Exakte Texte */
export const ZH_EXACT: Record<string, Tr> = {
  软核: { en: 'Classic', de: 'Klassisch' },
  中核: { en: 'Mediumcore', de: 'Mediumcore' },
  硬核: { en: 'Hardcore', de: 'Hardcore' },
  旅程: { en: 'Journey', de: 'Reise' },
  玩家: { en: 'Player', de: 'Spieler' },
  松露人: { en: 'Truffle', de: 'Trüffel' },
  血月: { en: 'Blood Moon', de: 'Blutmond' },
  日食: { en: 'Solar Eclipse', de: 'Sonnenfinsternis' },
  陨石坠落: { en: 'Meteor', de: 'Meteorit' },
  流星雨: { en: 'Meteor Shower', de: 'Meteorschauer' },
  哥布林入侵: { en: 'Goblin Army', de: 'Goblin-Armee' },
  海盗入侵: { en: 'Pirate Invasion', de: 'Piraten-Invasion' },
  世界未就绪: { en: 'World not ready', de: 'Welt nicht bereit' },
  仅房主可触发事件: { en: 'Only the host can start events', de: 'Nur der Host kann Ereignisse starten' },
  '日食是困难模式事件——需先击败血肉墙': { en: 'The Solar Eclipse is a Hardmode event: defeat the Wall of Flesh first', de: 'Die Sonnenfinsternis ist ein Hardmode-Ereignis: Besiege zuerst die Fleischwand' },
  '现在是夜晚——日食黄昏即被自然清除,请白天触发': { en: 'It is night: an eclipse ends at dusk, start it during the day', de: 'Es ist Nacht: Eine Finsternis endet bei Dämmerung, starte sie tagsüber' },
  '无法开启(见提示:生命上限<200/已有入侵或入侵冷却中)': { en: 'Cannot start (max life < 200, or an invasion is active/cooling down)', de: 'Start nicht möglich (max. Leben < 200 oder Invasion aktiv/abklingend)' },
  '调试：无敌 + 无限魔力 已开启': { en: 'Debug: god mode + infinite mana ON', de: 'Debug: Unverwundbar + unendlich Mana AN' },
  '调试：无敌 + 无限魔力 已关闭': { en: 'Debug: god mode + infinite mana OFF', de: 'Debug: Unverwundbar + unendlich Mana AUS' },
  连接原版服务器超时: { en: 'Connection to server timed out', de: 'Zeitüberschreitung bei der Serververbindung' },
  '调试面板已开启（碰撞盒高亮）': { en: 'Debug panel on (hitboxes)', de: 'Debug-Panel an (Hitboxen)' },
  调试面板已关闭: { en: 'Debug panel off', de: 'Debug-Panel aus' },
  '全图迷雾消除（再按可恢复）': { en: 'Reveal map (press again to restore)', de: 'Karte aufdecken (erneut drücken zum Zurücksetzen)' },
  '已消除全图迷雾（再按 Shift+F4 恢复）': { en: 'Map revealed (Shift+F4 to restore)', de: 'Karte aufgedeckt (Shift+F4 zum Zurücksetzen)' },
  已恢复迷雾快照: { en: 'Map fog restored', de: 'Kartennebel wiederhergestellt' },
  召唤面板: { en: 'Spawn panel', de: 'Beschwörungs-Panel' },
  导线显示: { en: 'Wire display', de: 'Kabelanzeige' },
  '导线显示:强制开启': { en: 'Wire display: always on', de: 'Kabelanzeige: immer an' },
  '导线显示:手持电路工具时': { en: 'Wire display: when holding wiring tools', de: 'Kabelanzeige: mit Kabelwerkzeug' },
  怪物生成开关: { en: 'Toggle enemy spawns', de: 'Gegner-Spawns umschalten' },
  怪物生成已开启: { en: 'Enemy spawns on', de: 'Gegner-Spawns an' },
  '怪物生成已关闭（已有怪物不受影响）': { en: 'Enemy spawns off (existing enemies stay)', de: 'Gegner-Spawns aus (vorhandene Gegner bleiben)' },
  全画面照亮: { en: 'Full bright', de: 'Volle Helligkeit' },
  '已开灯：全画面无暗影': { en: 'Full bright on', de: 'Volle Helligkeit an' },
  '已关灯：恢复正常光照': { en: 'Normal lighting', de: 'Normale Beleuchtung' },
  地图点击传送: { en: 'Map click teleport', de: 'Teleport per Kartenklick' },
  '地图点击传送已启用：全屏地图点击选点，再点同一点传送': { en: 'Map teleport on: click a spot on the full map, click again to teleport', de: 'Karten-Teleport an: Punkt auf der Karte anklicken, erneut klicken zum Teleportieren' },
  地图点击传送已禁用: { en: 'Map teleport off', de: 'Karten-Teleport aus' },
  '贴图纠错模式：点击方块打开其贴图表': { en: 'Texture fix mode: click a tile', de: 'Textur-Korrekturmodus: Block anklicken' },
  已关闭贴图纠错模式: { en: 'Texture fix mode off', de: 'Textur-Korrekturmodus aus' },
  标注模式已关闭: { en: 'Marker mode off', de: 'Markierungsmodus aus' },
  已导出地图存档: { en: 'Map save exported', de: 'Kartenspeicher exportiert' },
  还没有记录任何贴图纠错: { en: 'No texture fixes recorded yet', de: 'Noch keine Texturkorrekturen' },
  空白世界: { en: 'Empty world', de: 'Leere Welt' },
  存档数据缺失: { en: 'Save data missing', de: 'Speicherdaten fehlen' },
  创建新世界: { en: 'Create new world', de: 'Neue Welt erstellen' },
  小: { en: 'Small', de: 'Klein' },
  中: { en: 'Medium', de: 'Mittel' },
  大: { en: 'Large', de: 'Groß' },
  晴朗: { en: 'Clear', de: 'Klar' },
  多云: { en: 'Cloudy', de: 'Bewölkt' },
  小雨: { en: 'Light rain', de: 'Leichter Regen' },
  大雨: { en: 'Heavy rain', de: 'Starker Regen' },
  风暴: { en: 'Storm', de: 'Sturm' },
  沙尘暴: { en: 'Sandstorm', de: 'Sandsturm' },
  史莱姆雨: { en: 'Slime Rain', de: 'Schleimregen' },
  随机: { en: 'Random', de: 'Zufällig' },
  '− 风': { en: '− Wind', de: '− Wind' },
  '+ 风': { en: '+ Wind', de: '+ Wind' },
  'F3 关闭调试面板': { en: 'F3: close debug panel', de: 'F3: Debug-Panel schließen' },
  '绿=主角 橙=中心 红=怪物 蓝=动物 黄=鼠标': { en: 'green=player orange=center red=enemy blue=critter yellow=mouse', de: 'grün=Spieler orange=Mitte rot=Gegner blau=Tier gelb=Maus' },
  '添加到主屏幕:点 Safari 底部「分享」→「添加到主屏幕」,离线可玩、独占全屏': { en: 'Add to Home Screen: Safari "Share" → "Add to Home Screen" (offline, fullscreen)', de: 'Zum Home-Bildschirm: Safari „Teilen“ → „Zum Home-Bildschirm“ (offline, Vollbild)' },
  '将 SandboxWorld 安装到桌面——离线可玩、独立窗口、不再重复下载': { en: 'Install SandboxWorld as an app: offline, own window, no re-downloads', de: 'SandboxWorld als App installieren: offline, eigenes Fenster, kein erneuter Download' },
  安装: { en: 'Install', de: 'Installieren' },
  用户关闭: { en: 'Closed', de: 'Geschlossen' },
  '为了游戏体验，如非卡关或调试不建议使用此功能，可能破坏游戏乐趣。确认启用后不再拦截。': { en: 'This can spoil the game; only use it if you are stuck or testing. Enable anyway?', de: 'Das kann den Spielspaß verderben; nur nutzen, wenn du feststeckst oder testest. Trotzdem aktivieren?' },
  取消: { en: 'Cancel', de: 'Abbrechen' },
  确认启用: { en: 'Enable', de: 'Aktivieren' },
  时间调整: { en: 'Time control', de: 'Zeitsteuerung' },
  天气调整: { en: 'Weather control', de: 'Wettersteuerung' },
  '2D 沙盒动作冒险 · 泰拉瑞亚风格复刻': { en: '2D sandbox action adventure · Terraria-style remake', de: '2D-Sandbox-Abenteuer · Nachbau im Terraria-Stil' },
  '世界种子（留空随机）': { en: 'World seed (empty = random)', de: 'Welt-Seed (leer = zufällig)' },
  '小世界 4200×1200': { en: 'Small world 4200×1200', de: 'Kleine Welt 4200×1200' },
  '中世界 6400×1800': { en: 'Medium world 6400×1800', de: 'Mittlere Welt 6400×1800' },
  '大世界 8400×2400': { en: 'Large world 8400×2400', de: 'Große Welt 8400×2400' },
  继续上次存档: { en: 'Continue last save', de: 'Letzten Spielstand fortsetzen' },
  '读取存档文件…': { en: 'Load save file…', de: 'Speicherdatei laden…' },
  '导入泰拉瑞亚地图 (.wld)…': { en: 'Import Terraria world (.wld)…', de: 'Terraria-Welt importieren (.wld)…' },
  '开发者模式（全道具入包 + 出生点展示区）': { en: 'Developer mode (all items + showcase)', de: 'Entwicklermodus (alle Items + Vitrine)' },
  墓碑: { en: 'Tombstone', de: 'Grabstein' },
  道具搜索: { en: 'Item search', de: 'Item-Suche' },
  '名称 / key / 原版 id…': { en: 'Name / key / id…', de: 'Name / Key / ID…' },
  无匹配: { en: 'No matches', de: 'Keine Treffer' },
  '筛选配方名…': { en: 'Filter recipes…', de: 'Rezepte filtern…' },
  '…更多结果请细化': { en: '…refine for more results', de: '…für mehr Treffer genauer suchen' },
  任何组物: { en: 'Any', de: 'Beliebig' },
  该物品不用于任何配方: { en: 'Not used in any recipe', de: 'Wird in keinem Rezept verwendet' },
  智能堆叠至附近宝箱: { en: 'Smart stack to nearby chests', de: 'Intelligent in Truhen in der Nähe stapeln' },
  快速堆叠至附近宝箱: { en: 'Quick stack to nearby chests', de: 'Schnell in Truhen in der Nähe stapeln' },
  天气控制: { en: 'Weather control', de: 'Wettersteuerung' },
  时间控制: { en: 'Time control', de: 'Zeitsteuerung' },
  存钱罐: { en: 'Piggy Bank', de: 'Sparschwein' },
  守护者熔炉: { en: "Defender's Forge", de: 'Verteidiger-Schmiede' },
  我已知晓: { en: 'Got it', de: 'Verstanden' },
  '📢 欢迎来到 SandboxWorld': { en: '📢 Welcome to SandboxWorld', de: '📢 Willkommen bei SandboxWorld' },
  购买原版: { en: 'Buy the original', de: 'Original kaufen' },
  禁用: { en: 'Disabled', de: 'Deaktiviert' },
  无风: { en: 'No wind', de: 'Windstill' },
  力量菜单: { en: 'Power Menu', de: 'Kräftemenü' },
  你无权使用此能力: { en: 'You are not allowed to use this power', de: 'Du darfst diese Kraft nicht nutzen' },
  复制: { en: 'Duplication', de: 'Duplizieren' },
  研究: { en: 'Research', de: 'Forschung' },
  时间: { en: 'Time', de: 'Zeit' },
  天气: { en: 'Weather', de: 'Wetter' },
  敌人难度: { en: 'Enemy difficulty', de: 'Gegnerschwierigkeit' },
  个人: { en: 'Personal', de: 'Persönlich' },
  感染蔓延已禁用: { en: 'Biome spread disabled', de: 'Biom-Ausbreitung deaktiviert' },
  感染蔓延已启用: { en: 'Biome spread enabled', de: 'Biom-Ausbreitung aktiviert' },
  停止时间流逝: { en: 'Freeze time', de: 'Zeit anhalten' },
  时间已经定格: { en: 'Time is frozen', de: 'Die Zeit ist angehalten' },
  时间恢复流逝: { en: 'Time resumes', de: 'Die Zeit läuft weiter' },
  黎明: { en: 'Dawn', de: 'Morgengrauen' },
  正午: { en: 'Noon', de: 'Mittag' },
  黄昏: { en: 'Dusk', de: 'Abenddämmerung' },
  午夜: { en: 'Midnight', de: 'Mitternacht' },
  时间速度: { en: 'Time speed', de: 'Zeitgeschwindigkeit' },
  风力: { en: 'Wind strength', de: 'Windstärke' },
  西风: { en: 'West wind', de: 'Westwind' },
  东风: { en: 'East wind', de: 'Ostwind' },
  风况变化已禁用: { en: 'Wind changes disabled', de: 'Windänderung deaktiviert' },
  风况变化已启用: { en: 'Wind changes enabled', de: 'Windänderung aktiviert' },
  降雨: { en: 'Rain', de: 'Regen' },
  雨季: { en: 'Rainy season', de: 'Regenzeit' },
  细雨: { en: 'Drizzle', de: 'Nieselregen' },
  晴天: { en: 'Clear', de: 'Klar' },
  雨情变化已禁用: { en: 'Rain changes disabled', de: 'Regenänderung deaktiviert' },
  雨情变化已启用: { en: 'Rain changes enabled', de: 'Regenänderung aktiviert' },
  敌人强度: { en: 'Enemy strength', de: 'Gegnerstärke' },
  大师: { en: 'Master', de: 'Meister' },
  专家: { en: 'Expert', de: 'Experte' },
  经典: { en: 'Classic', de: 'Klassisch' },
  旅行: { en: 'Journey', de: 'Reise' },
  调整敌人的强度: { en: 'Adjust enemy difficulty', de: 'Gegnerstärke anpassen' },
  '获得无敌效果！': { en: 'Godmode!', de: 'Unverwundbar!' },
  无敌模式已启用: { en: 'Godmode enabled', de: 'Unverwundbarkeit aktiviert' },
  无敌模式已禁用: { en: 'Godmode disabled', de: 'Unverwundbarkeit deaktiviert' },
  放置范围: { en: 'Placement range', de: 'Platzierreichweite' },
  扩大放置范围: { en: 'Increased placement range', de: 'Erhöhte Platzierreichweite' },
  正常放置范围: { en: 'Normal placement range', de: 'Normale Platzierreichweite' },
  刷怪率: { en: 'Enemy spawn rate', de: 'Gegner-Spawnrate' },
  打开研究菜单: { en: 'Open research menu', de: 'Forschungsmenü öffnen' },
  '名字：': { en: 'Name:', de: 'Name:' },
  清空: { en: 'Clear', de: 'Leeren' },
  '力量权限（点击切换：所有人 → 仅房主 → 锁定）': { en: 'Power permissions (click: everyone → host only → locked)', de: 'Kräfte-Rechte (Klick: alle → nur Host → gesperrt)' },
  所有人: { en: 'Everyone', de: 'Alle' },
  仅房主: { en: 'Host only', de: 'Nur Host' },
  锁定: { en: 'Locked', de: 'Gesperrt' },
  进度探针: { en: 'Progress probe', de: 'Fortschrittssonde' },
};

/** Muster für Template-Strings ($1… = Platzhalter) */
export const ZH_PATTERNS: Array<{ re: RegExp } & Tr> = [
  { re: /^世界装载失败：(.*)$/s, en: 'World failed to load: $1', de: 'Welt konnte nicht geladen werden: $1' },
  { re: /^原版服连接失败：(.*)$/s, en: 'Server connection failed: $1', de: 'Serververbindung fehlgeschlagen: $1' },
  { re: /^联机失败：(.*)$/s, en: 'Multiplayer failed: $1', de: 'Mehrspieler fehlgeschlagen: $1' },
  { re: /^未知事件 (.*)$/s, en: 'Unknown event $1', de: 'Unbekanntes Ereignis $1' },
  { re: /^玩家(\d+)$/, en: 'Player$1', de: 'Spieler$1' },
  { re: /^站点 (.*)$/, en: 'Station $1', de: 'Station $1' },
  { re: /^（东风 (\d+) mph）$/, en: '($1 mph East)', de: '($1 mph Ost)' },
  { re: /^（西风 (\d+) mph）$/, en: '($1 mph West)', de: '($1 mph West)' },
  { re: /^可复制物品 (\d+) 件$/, en: '$1 duplicable items', de: '$1 duplizierbare Items' },
  { re: /^显示 (\d+) \/ (\d+) 件$/, en: 'Showing $1 / $2', de: 'Zeige $1 / $2' },
  { re: /^命中 (\d+) \/ (\d+) 件$/, en: '$1 / $2 matches', de: '$1 / $2 Treffer' },
  { re: /^共 (\d+) 件（滚动浏览全部）$/, en: '$1 items (scroll to browse)', de: '$1 Items (scrollen zum Durchsuchen)' },
  { re: /^风 (.*)$/, en: 'Wind $1', de: 'Wind $1' },
  { re: /^加载失败: (.*)$/s, en: 'Failed to load: $1', de: 'Laden fehlgeschlagen: $1' },
  { re: /^调试报告已生成：(.*)$/s, en: 'Debug report saved: $1', de: 'Debug-Bericht gespeichert: $1' },
  { re: /^已导出 (\d+) 处标注$/, en: 'Exported $1 markers', de: '$1 Markierungen exportiert' },
  { re: /^已导出 (\d+) 处贴图纠错$/, en: 'Exported $1 texture fixes', de: '$1 Texturkorrekturen exportiert' },
];

const CJK = /[㐀-鿿！-｠　-〿]/;

export function hasCjk(s: string): boolean { return CJK.test(s); }

const missed = new Set<string>();
let lang: 'de' | 'en' = 'en';
export function setZhTargetLanguage(culture: string | null): void {
  lang = (culture ?? '').startsWith('de') ? 'de' : 'en';
}
/** Ziel-Sprache ist Chinesisch → nichts übersetzen */
let passthrough = false;
export function setZhPassthrough(v: boolean): void { passthrough = v; }

/** Übersetzt einen Text mit CJK-Zeichen; ohne Treffer bleibt er unverändert. */
export function translateZh(s: string): string {
  if (passthrough || !CJK.test(s)) return s;
  const trimmed = s.trim();
  const ex = ZH_EXACT[trimmed];
  if (ex) return s.replace(trimmed, ex[lang]);
  for (const p of ZH_PATTERNS) {
    const m = trimmed.match(p.re);
    if (m) return s.replace(trimmed, p[lang].replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ''));
  }
  if (!missed.has(trimmed) && missed.size < 500) {
    missed.add(trimmed);
    console.debug('[zh-miss]', trimmed);
  }
  return s;
}
