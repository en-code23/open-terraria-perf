#!/bin/bash
# Fork: baut build/Open-Terraria.app – startet den lokalen Spielserver und öffnet
# das Spiel als eigenes Vollbild-Fenster (Chrome im App-Modus, eigenes Profil,
# Spielstände bleiben darin erhalten). Beim Schließen des Fensters stoppt der Server.
#   sh scripts/make-mac-app.sh   →   open build/Open-Terraria.app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/build/Open-Terraria.app"
NODE_BIN="$(dirname "$(command -v node)")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome nicht gefunden"; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Open-Terraria</string>
  <key>CFBundleDisplayName</key><string>Open-Terraria (inoffiziell)</string>
  <key>CFBundleIdentifier</key><string>local.open-terraria.perf</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/launcher" <<LAUNCH
#!/bin/bash
export PATH="$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$ROOT"
PORT=5299
URL="http://localhost:\$PORT/"
LOG="\$HOME/Library/Logs/Open-Terraria.log"
PROFILE="\$HOME/Library/Application Support/Open-Terraria/chrome-profile"
mkdir -p "\$PROFILE" "\$(dirname "\$LOG")"
STARTED=0
if ! curl -sf -o /dev/null "\$URL"; then
  cd "\$ROOT"
  SW_PORT=\$PORT SW_NO_HMR=1 SW_CACHE="\$HOME/Library/Caches/Open-Terraria-vite" npx vite > "\$LOG" 2>&1 &
  SERVER=\$!
  STARTED=1
  for i in \$(seq 1 120); do curl -sf -o /dev/null "\$URL" && break; sleep 0.5; done
fi
"$CHROME" --app="\$URL" --start-fullscreen --user-data-dir="\$PROFILE" \\
  --no-first-run --no-default-browser-check --disable-features=Translate >> "\$LOG" 2>&1
if [ "\$STARTED" = 1 ]; then kill "\$SERVER" 2>/dev/null; pkill -P "\$SERVER" 2>/dev/null || true; fi
LAUNCH
chmod +x "$APP/Contents/MacOS/launcher"

# Icon aus dem Favicon des Projekts (lokal)
if [ -f "$ROOT/public/icons/icon-512.png" ] || [ -f "$ROOT/public/favicon.png" ]; then
  SRC="$ROOT/public/icons/icon-512.png"; [ -f "$SRC" ] || SRC="$ROOT/public/favicon.png"
  ICONSET="$(mktemp -d)/icon.iconset"; mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1 || true
    d=$((s*2)); sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns" 2>/dev/null || true
fi
echo "Fertig: $APP"
