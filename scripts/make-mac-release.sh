#!/bin/bash
# Fork: baut die EIGENSTÄNDIGE Mac-App zum Herunterladen (GitHub-Release):
#   sh scripts/make-mac-release.sh   →   build/release/Open-Terraria-mac.zip
#
# Unterschied zu scripts/make-mac-app.sh (startet den Code aus diesem Repo-Ordner):
# Hier steckt das fertig gebaute Spiel in der App (Contents/Resources/game) samt
# kleinem Server (mac-server.mjs). Auf dem Ziel-Mac nötig: Node.js (nodejs.org).
# Google Chrome ist empfohlen (eigenes Vollbild-Fenster); sonst Standardbrowser.
# Enthält Original-Terraria-Grafiken → nur privat weitergeben.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/release"
APP="$OUT/Open-Terraria.app"
GAME="$ROOT/build/mac-game"

echo "[mac] baue das Spiel …"
rm -rf "$GAME"
(cd "$ROOT" && npx vite build --outDir "$GAME" --emptyOutDir --logLevel error)
# vite schreibt beim Build den Zeitstempel in src/version.ts — nicht committen
(cd "$ROOT" && git checkout -- src/version.ts 2>/dev/null || true)

rm -rf "$APP" "$OUT/Open-Terraria-mac.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -R "$GAME" "$APP/Contents/Resources/game"
cp "$ROOT/scripts/mac-server.mjs" "$ROOT/scripts/terraria-saves.mjs" "$ROOT/scripts/lan-host.mjs" "$APP/Contents/Resources/"

VERSION="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo 1.0)"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Open-Terraria</string>
  <key>CFBundleDisplayName</key><string>Open-Terraria (inoffiziell)</string>
  <key>CFBundleIdentifier</key><string>local.open-terraria.app</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/launcher" <<'LAUNCH'
#!/bin/bash
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
PORT=5299
URL="http://localhost:$PORT/"
# ?nosw: lokales Spiel ohne Service Worker (alle Dateien liegen direkt in der App)
APPURL="${URL}?nosw"
LOG="$HOME/Library/Logs/Open-Terraria.log"
PROFILE="$HOME/Library/Application Support/Open-Terraria/chrome-profile"
mkdir -p "$PROFILE" "$(dirname "$LOG")"
# Node finden (Homebrew, offizielles Paket, nvm, volta)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  for c in "$HOME"/.nvm/versions/node/*/bin/node; do [ -x "$c" ] && NODE="$c"; done
fi
if [ -z "$NODE" ]; then
  osascript -e 'display dialog "Open-Terraria braucht Node.js.\n\nBitte installieren: https://nodejs.org (LTS) und die App erneut öffnen." buttons {"OK"} default button 1 with title "Open-Terraria"'
  open "https://nodejs.org/"
  exit 1
fi
SERVER=""
if ! curl -sf -o /dev/null "$URL"; then
  "$NODE" "$RES/mac-server.mjs" "$RES/game" "$PORT" > "$LOG" 2>&1 &
  SERVER=$!
  for i in $(seq 1 60); do curl -sf -o /dev/null "$URL" && break; sleep 0.25; done
fi
# LAN-Helfer (Mehrspieler mit dem echten Terraria-Server), falls nicht schon aktiv
HELPER=""
if ! curl -sf -o /dev/null "http://localhost:5290/lan"; then
  "$NODE" "$RES/lan-host.mjs" >> "$LOG" 2>&1 &
  HELPER=$!
fi
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$CHROME" ]; then
  "$CHROME" --app="$APPURL" --start-fullscreen --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check --disable-features=Translate >> "$LOG" 2>&1
else
  # ohne Chrome: Standardbrowser; Server läuft, bis die App beendet wird
  open "$APPURL"
  trap 'true' TERM INT
  wait "$SERVER" 2>/dev/null
fi
[ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null
# Helfer beenden → speichert laufende LAN-Welten (bis 20 s)
if [ -n "$HELPER" ]; then kill -TERM "$HELPER" 2>/dev/null; for i in $(seq 1 40); do kill -0 "$HELPER" 2>/dev/null || break; sleep 0.5; done; fi
LAUNCH
chmod +x "$APP/Contents/MacOS/launcher"

# Icon (macOS-Stil, abgerundet)
SRC="$ROOT/public/icons/icon-mac-1024.png"
[ -f "$SRC" ] || SRC="$ROOT/public/icons/icon-512.png"
ICONSET="$(mktemp -d)/icon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1 || true
  d=$((s*2)); sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns" 2>/dev/null || true

# Ad-hoc-Signatur (kein Apple-Developer-Zertifikat) — beim ersten Start: Rechtsklick → Öffnen
codesign --force --deep -s - "$APP" 2>/dev/null || true
(cd "$OUT" && ditto -c -k --keepParent "Open-Terraria.app" "Open-Terraria-mac.zip")
echo "Fertig: $OUT/Open-Terraria-mac.zip ($(du -h "$OUT/Open-Terraria-mac.zip" | cut -f1))"
