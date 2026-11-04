# Open-Terraria auf einem eigenen Server

Mit diesem Ordner läuft das Spiel auf deinem Server (VPS, Root-Server, Raspberry Pi mit x86-Emulation ausgenommen) und ist im Browser erreichbar, auch von iPhone/iPad (Safari → „Zum Home-Bildschirm“).
**Optional** startet zusätzlich ein **kleiner echter Terraria-Server** (1.4.5.8, kleine Welt, max. 3 Spieler), dem alle direkt aus dem Spiel beitreten.

```
Browser ──https──▶ Caddy (web) ──▶ Spiel-Dateien
   │
   └──wss /bridge──▶ bridge (Node) ──tcp──▶ terraria (optional, Port 7777)
```

> **Achtung:** Das Spiel enthält Original-Terraria-Grafiken (© Re-Logic). Nur für dich und deine Freunde verwenden, nicht öffentlich anbieten. Lass deshalb den Passwortschutz an (`AUTH_MODE=basic`, Standard in `.env.example`).

## Voraussetzungen

- Linux-Server mit **Docker** und **Docker Compose** (`curl -fsSL https://get.docker.com | sh`)
- **x86_64 (amd64)** — das Terraria-Server-Image gibt es nur dafür (auf ARM-Servern läuft nur das Spiel, nicht der Terraria-Server)
- Für den Bau des Spiels **≈ 6 GB RAM** (einmalig beim Bauen; im Betrieb reichen ~1 GB, mit Terraria-Server ~2 GB)
- Ports **80** und **443** offen (Firewall des Anbieters)
- Optional eine **Domain**, die auf den Server zeigt (für HTTPS)

## Installation

```bash
git clone https://github.com/en-code23/terra.git open-terraria   # privates Repo: mit GitHub-Token anmelden
cd open-terraria/deploy
cp .env.example .env
nano .env
```

In `.env` mindestens einstellen:

| Einstellung | Bedeutung |
|---|---|
| `SITE_ADDRESS` | Domain, z. B. `terraria.example.org` → HTTPS automatisch (Let's Encrypt). Ohne Domain `:80` |
| `SITE_USER` / `SITE_PASSWORD_HASH` | Login für die Spielseite. Hash erzeugen: `docker run --rm caddy:2.8-alpine caddy hash-password --plaintext 'DEIN-PASSWORT'` — in `.env` jedes `$` verdoppeln (`$$`) |
| `COMPOSE_PROFILES=terraria` | **optional**: kleinen Terraria-Server mitstarten |
| `TERRARIA_MAX_PLAYERS` | Standard 3 |
| `TERRARIA_WORLD_SIZE` | 1 klein (Standard), 2 mittel, 3 groß |
| `TERRARIA_PASSWORD` | optionales Server-Passwort |

Starten:

```bash
docker compose up -d --build
```

Das erste Bauen dauert ein paar Minuten. Danach: `https://deine-domain/` (bzw. `http://<server-ip>/`) öffnen.

## Zusammen spielen

- **Mit dem eingebauten Terraria-Server** (`COMPOSE_PROFILES=terraria`): im Spiel **Mehrspieler → Server → „Beitreten“**. Die Welt wird beim ersten Start erzeugt und bleibt im Volume `terraria_world` erhalten.
- **Echtes Terraria am PC / iPhone-App**: in `.env` `TERRARIA_PUBLIC_BIND=0.0.0.0` setzen, Port **7777/tcp** öffnen, dann „Über IP beitreten“ → Domain bzw. IP des Servers.
- **Andere Server** (TShock, beardedio, Freunde): `EXTRA_SERVERS=Name=host:7777` eintragen oder `ALLOW_PUBLIC_SERVERS=1` (dann darf das Spiel beliebigen Internet-Servern beitreten). Die Server müssen Terraria **1.4.5.8** sein.

Spielstände (Charaktere, eigene Einzelspieler-Welten) speichert der Browser jedes Spielers selbst.

## Verwaltung

```bash
docker compose ps                         # läuft alles?
docker compose logs -f bridge terraria    # Protokolle
docker attach open-terraria-terraria-1    # Konsole des Terraria-Servers (save, exit, kick …)
                                          # verlassen ohne Beenden: Strg+P, dann Strg+Q
docker compose restart terraria           # Terraria-Server neu starten (speichert vorher)
```

Aktualisieren:

```bash
git pull
docker compose up -d --build
```

Welt sichern:

```bash
docker run --rm -v open-terraria_terraria_world:/w -v "$PWD":/b alpine tar czf /b/welt-backup.tgz -C /w .
```

## Sicherheit

- Die Brücke verbindet **nur** zu den eingetragenen Servern (eingebauter Server, `EXTRA_SERVERS`) und nur von der eigenen Spielseite aus (Origin-Prüfung). Mit `ALLOW_PUBLIC_SERVERS=1` zusätzlich zu öffentlichen Internet-Adressen, nie zu internen Netzen.
- Der Terraria-Server ist standardmäßig nur intern erreichbar (`TERRARIA_PUBLIC_BIND=127.0.0.1`).
- `MAX_CONNECTIONS` begrenzt gleichzeitige Verbindungen über die Brücke.
