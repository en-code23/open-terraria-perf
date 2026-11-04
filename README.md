# Open Terraria

> [!IMPORTANT]
> **Verbesserte Version von [SandboxWorldOnline/Open-Terraria](https://github.com/SandboxWorldOnline/Open-Terraria)** (Branch `perf`, privat, nur für den persönlichen Gebrauch).
> - Behoben: Freeze ca. 2 s nach Weltbeitritt (Endlosschleife Minecart-Schienen ↔ Stützprüfung; Stack-Overflow bei langen Einsturzketten).
> - Weltgenerierung ca. 2× schneller (4200×1200: 35,6 s → 17,3 s), bitgenau identische Welten (per Hash über 5 Seeds verifiziert).
> - Hauptmenü wie im Original (Terraria-Schrift, Reihenfolge, Workshop/Credits). Die Schrift liest `npm i --no-save xnb@1.3.0-a && node scripts/extract-local-fonts.mjs` aus **deiner eigenen** Steam-Installation nach `public/sprites/local/` (wird nicht committet; ohne sie bleibt die Pixelschrift).
> - **Mac-App herunterladen:** [Open-Terraria-mac.zip](https://github.com/en-code23/terra/releases/latest/download/Open-Terraria-mac.zip) (Releases dieses Repos). Entpacken, `Open-Terraria.app` in „Programme“ ziehen, beim ersten Start **Rechtsklick → Öffnen** (nicht von Apple signiert). Braucht [Node.js](https://nodejs.org) (LTS); Google Chrome empfohlen (eigenes Vollbild-Fenster). Selbst bauen: `sh scripts/make-mac-release.sh` → `build/release/Open-Terraria-mac.zip`.
> - **iPhone/iPad-App herunterladen:** [Open-Terraria-iOS.ipa](https://github.com/en-code23/terra/releases/latest/download/Open-Terraria-iOS.ipa) — mit [Sideloadly](https://sideloadly.io) oder AltStore und deiner Apple-ID aufs iPhone (kostenlose Apple-ID: alle 7 Tage neu signieren). Oder direkt aus Xcode: `sh scripts/make-ios.sh` → `ios/OpenTerraria.xcodeproj` öffnen → Signing → eigenes Team → iPhone wählen → ▶. Läuft offline, Querformat, 60 FPS, Spielstände bleiben in der App; Mehrspieler-Brücke ist eingebaut (Vanilla-, TShock- und LAN-Server direkt vom iPhone).
> - **Steuerung wie die Mobil-App:** Bewegungs-Stick mit Steuerkreuz, Item-/Ziel-Stick mit gehaltenem Item, großer Doppelpfeil-Sprung, Schnellwechsel, Greifhaken, Smart-Cursor, Heiltrank, Zoom ±, Durchfallen, Interagieren (NPC/Truhe/Tür), Reittier, Karte, Schnell-Buff, Inventar-Raster und Zahnrad; Leben/Mana als waagerechte Leisten oben rechts mit Chat/Minikarte/Karte daneben.
> - **Für LAN öffnen:** Im Spiel Einstellungen → „Für LAN öffnen“: die aktuelle Welt startet auf dem echten Terraria-Server (Mac-App/`npm run lan`), du trittst automatisch bei, andere im WLAN über Mehrspieler → Server beitreten (IP wird angezeigt). In der iPhone-App: unter Mehrspieler einmal die IP des Macs eintragen.
> - **Server beitreten:** Mehrspieler → „Server beitreten“: IP oder Domain (Port optional, Standard 7777) — Vanilla-Server, [TShock](https://github.com/Pryaxis/TShock) und [beardedio/terraria](https://github.com/beardedio/terraria) (`vanilla-1.4.5.8`/`tshock-latest`), im LAN oder im Internet. Getestet mit TShock 6.2.1 (Terraria 1.4.5.8) im Docker-Container. Server müssen Terraria 1.4.5.8 sein.
> - Mac-App: `sh scripts/make-mac-app.sh` baut `build/Open-Terraria.app` (Doppelklick = Server + Vollbild-Fenster). Debug-Tasten F3–F10 nur mit `?dev=1`. Deutsche Übersetzung der projekteigenen Texte: `node scripts/apply-fork-l10n.mjs`.
> - **iPad/Handy:** `npm run lan` baut das Spiel und startet es im WLAN (Adresse wird angezeigt, in Safari öffnen, „Zum Home-Bildschirm“ = Vollbild). Touch-Steuerung mit Original-Icons, Auto-Sprung, größeren Knöpfen.
> - **LAN-Welten (echter Terraria-Server):** Mehrspieler → LAN-Welten: neue Welt, eigene Browser-Welt oder gespeicherte Welt hosten; der Helfer (`scripts/lan-host.mjs`, startet mit `npm run lan` und der Mac-App) nutzt `TerrariaServer` aus deiner Steam-Installation. Auch das echte Terraria am PC kann über „Über IP beitreten“ mitspielen. Welten lassen sich zurück in den Browser übernehmen.
> - **Karte:** Tab-/Minikarte und Vollbildkarte (M) zeigen standardmäßig die ganze Welt (X-Ray, abschaltbar unter Einstellungen → Spiel).
> - **Spieler & Welten aus dem echten Terraria:** Spieler-/Weltauswahl → Importieren listet die Spielstände deiner Terraria-Installation (lokal, Steam Cloud, tModLoader; über `scripts/terraria-saves.mjs` im Vite-Server). Welten ab Terraria 1.3, Spieler ab 1.2 bis 1.4.5.8.
> - **Mobil-App-Look (Touch):** Hotbar 2×5 links, Minikarte per Knopf, NPC-Dialog klassisch (ohne Porträt, in den Einstellungen umschaltbar); App-Icon im Stil der App-Store-Version.
> - **Ressourcenpakete:** echte Terraria-Pakete (zip mit `pack.json` + `Content/`) über Workshop → Ressourcenpakete. tModLoader-Mods (C#/.NET) laufen in diesem Browser-Nachbau nicht.
> - Alle Rechte an Terraria-Assets liegen bei Re-Logic, siehe [ASSETS.md](ASSETS.md).

**[简体中文](README.md) | [English](README_EN.md)**

> [!NOTE]
> 当前代码仍在积极迭代更新，可能仍存在一些尚未解决的Bug与待优化的性能项，如果您发现游戏中与原版不一致的情况，欢迎在issue中提出问题

一个完全开放的 **Terraria 1.4.5.8** ，历经70天，总消耗1238亿Tokens，其中GLM-5.3贡献477亿，GLM-5.3-Flash贡献761亿，使用Claude Code作为Vibe Coding工具。

未基于任何游戏引擎，完全基于Web平台原生实现，采用 Canvas 2D + WebGL2 混合渲染管线，部分模块采用Web Worker并行化处理或编译为WebAssembly以提升性能，当前最高帧率上限可支持120fps。

支持移植mod、材质包、原版世界/角色存档导入导出。

人类不写代码只发指令，我发送了7827条指令，会话数达到124个，使用1484个子代理

Agent侧产生了112338条消息，工具调用数量达36815次

150 万行 TypeScript（引擎 47 万手写 + 数据定义 2 万 + 测试 45 万 + 探针工具 46 万 + mod 参考实现 5.5 万），2600+ 测试用例，全部开发过程有逐日开发日志（[docs/devlog/DAILY_DEVLOG.md](docs/devlog/DAILY_DEVLOG.md)）存档。这个仓库本身，就是这场人机协作实验的完整记录。

多人模式服务端仍在开发中，后续可能支持大型公共房间。

## 在线地址

[https://sandboxworld.online](https://sandboxworld.online)

建议使用 Google Chrome 浏览器访问，以获得最佳游戏性能，如使用国内网络首次访问可能遇到网络延迟，请多加等待。

如多次刷新无法访问，可尝试强制刷新以刷新Service Worker缓存状态。

## 效果预览

#### 世界生成（含9个彩蛋种子+37个秘密种子）

同时支持导入原版*.wld格式存档和*.plr格式角色

![shot-worldgen](docs/screenshots/shot-worldgen.png)

![shot-worldgen-2](docs/screenshots/shot-worldgen-2.png)

![shot-worldgen-3](docs/screenshots/shot-worldgen-3.png)

#### 游玩演示

![shot-gameplay-1](docs/screenshots/shot-gameplay-1.png)

![shot-gameplay-2](docs/screenshots/shot-gameplay-2.png)

![shot-gameplay-3](docs/screenshots/shot-gameplay-3.png)

![shot-gameplay-4](docs/screenshots/shot-gameplay-4.png)

![shot-gameplay-5](docs/screenshots/shot-gameplay-5.png)

#### 移植mod演示

![shot-mod-list](docs/screenshots/shot-mod-list.png)

![shot-mod-view](docs/screenshots/shot-mod-view.png)

#### 材质包导入演示

![shot-respack-list](docs/screenshots/shot-respack-list.png)

![shot-respack-view](docs/screenshots/shot-respack-view.png)

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5199
npm test             # vitest 全量(2600+ 用例)
npm run build        # 产物 dist/
```

## AI Agent 工程迭代

**→ [AGENTS.md](AGENTS.md)**

本项目的全部开发均由 AI Agent 完成协作迭代。如果你想让 AI Agent（Claude Code / Codex / Cursor 等）
参与本项目的开发，它可以通过 [AGENTS.md](AGENTS.md) 快速上手——其中包含：项目真值层级（反编译源码 → 数据表 → wiki）、
测试三层结构与金标闸门纪律、诊断探针方法（F5 调试报告 / 性能 trace 拆解）、迭代方法论（先定谳再动刀 / 红蓝对抗），
以及仓内 70 天逐日开发日志等全部判例档案的路由表。AI Agent 无需任何会话记忆，即可按本项目已验证的工作流进行工程迭代。

## Mod 开发

**→ 完整指南:[docs/mod-dev-guide.md](docs/mod-dev-guide.md)**

由于跨语言与平台的原因，无法支持tmod载入，建议通过AI精准转译到swmod（目前我们正在尝试全量转译灾厄mod）

10 分钟从零做出第一个 mod(脚手架/L1 声明式内容 16 域/L2 脚本 API 总表/
浏览器独有六接口/实战示例/发布):

```bash
node scripts/mod-cli.mjs init mods/my_mod --ts   # TypeScript 入口(缺省=JavaScript)
node scripts/mod-cli.mjs validate mods/my_mod    # 校验
node scripts/mod-cli.mjs build mods/my_mod       # → mods/dist/my_mod.swmod
```

- 接口类型签名(IDE):[templates/mod-api.d.ts](templates/mod-api.d.ts)
- Boss mod 工作流:[docs/howto-boss-mod.md](docs/howto-boss-mod.md)
- 城镇 NPC mod 工作流:[docs/howto-town-npc-mod.md](docs/howto-town-npc-mod.md)
- 平台设计定谳:[docs/mod-loader-design.md](docs/mod-loader-design.md)

## 文档

| 域 | 文档 |
|---|---|
| Mod 开发(入口) | [docs/mod-dev-guide.md](docs/mod-dev-guide.md) |
| 迭代方法论 | [docs/methodology/campaign-playbook.md](docs/methodology/campaign-playbook.md) |
| 架构定谳史 | [docs/](docs/)(按域归档;战役实录见各 recon/wave 文档) |

## 许可证

**工程代码以 [MIT](LICENSE) 授权**;仓库内的游戏资产(贴图/音效/BGM)与
反编译数据表属 © Re-Logic,不在 MIT 范围内,仅供个人学习与研究——
边界详见 [ASSETS.md](ASSETS.md)。

## 技术栈

TypeScript · Canvas 2D · WebGL2 · Vite · vitest · Web Assembly · Web Worker

## 致谢

- 感谢 [c.c.c.](https://linux.do/u/12311/summary) 对项目提供持续测试和验证
- 感谢 [Linux.do](https://linux.do) 社区对项目的推广与反馈