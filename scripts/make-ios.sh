#!/bin/bash
# Fork: baut die iPhone/iPad-App.
#   sh scripts/make-ios.sh            → Spiel bauen + Xcode-Projekt erzeugen (ios/OpenTerraria.xcodeproj)
#   sh scripts/make-ios.sh sim        → zusätzlich für den iOS-Simulator bauen und dort starten
#   sh scripts/make-ios.sh ipa        → zusätzlich unsignierte .ipa (build/release/Open-Terraria-iOS.ipa)
#                                       zum Installieren mit Sideloadly/AltStore (eigene Apple-ID)
# Aufs eigene iPhone direkt: ios/OpenTerraria.xcodeproj in Xcode öffnen → Target „OpenTerraria“
# → Signing & Capabilities → eigenes Team (kostenlose Apple-ID reicht) → iPhone wählen → ▶.
# Enthält Original-Terraria-Grafiken → nur privat verwenden.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS="$ROOT/ios"
GAME="$IOS/build/game"
MODE="${1:-}"

if [ "${SKIP_WEB:-0}" != "1" ]; then
  echo "[ios] baue das Spiel …"
  rm -rf "$GAME"
  (cd "$ROOT" && npx vite build --outDir "$GAME" --emptyOutDir --logLevel error)
  (cd "$ROOT" && git checkout -- src/version.ts 2>/dev/null || true)
  # nicht gebraucht in der App (Service Worker / Web-Hosting-Dateien)
  rm -f "$GAME/sw.js" "$GAME/_headers" "$GAME/_redirects"
fi
mkdir -p "$GAME"

command -v xcodegen >/dev/null || { echo "xcodegen fehlt: brew install xcodegen"; exit 1; }
# Signier-Team: OT_TEAM=… oder automatisch aus dem „Apple Development“-Zertifikat im Schlüsselbund
if [ -z "${OT_TEAM:-}" ]; then
  OT_TEAM="$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU=\([A-Z0-9]*\).*/\1/p' | head -1 || true)"
fi
export OT_TEAM
[ -n "$OT_TEAM" ] && echo "[ios] Signier-Team: $OT_TEAM"
(cd "$IOS" && xcodegen generate --quiet)
echo "[ios] Projekt: $IOS/OpenTerraria.xcodeproj"

DD="$IOS/build/dd"
case "$MODE" in
  device)
    # aufs angeschlossene iPhone installieren und starten (Debug, eigenes Team)
    xcodebuild -project "$IOS/OpenTerraria.xcodeproj" -scheme OpenTerraria -configuration Debug \
      -sdk iphoneos -derivedDataPath "$DD" -allowProvisioningUpdates DEVELOPMENT_TEAM="$OT_TEAM" -quiet build
    APP="$DD/Build/Products/Debug-iphoneos/Terraria.app"
    DEV="${OT_DEVICE:-$(xcrun devicectl list devices 2>/dev/null | awk '/physical/ && /connected/ && /iPhone|iPad/ {for(i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) print $i}' | head -1)}"
    [ -n "$DEV" ] || { echo "kein iPhone/iPad angeschlossen"; exit 1; }
    xcrun devicectl device install app --device "$DEV" "$APP"
    echo "[ios] installiert auf $DEV"
    ;;
  sim)
    xcodebuild -project "$IOS/OpenTerraria.xcodeproj" -scheme OpenTerraria -configuration Release \
      -sdk iphonesimulator -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO -quiet build
    APP="$DD/Build/Products/Release-iphonesimulator/Terraria.app"
    DEV="${SIM_DEVICE:-iPhone 15 Pro}"
    xcrun simctl boot "$DEV" 2>/dev/null || true
    open "$(xcode-select -p)/Applications/Simulator.app" 2>/dev/null || true
    xcrun simctl install "$DEV" "$APP"
    xcrun simctl launch "$DEV" local.open-terraria.app
    echo "[ios] läuft im Simulator ($DEV)"
    ;;
  ipa)
    xcodebuild -project "$IOS/OpenTerraria.xcodeproj" -scheme OpenTerraria -configuration Release \
      -sdk iphoneos -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -quiet build
    APP="$DD/Build/Products/Release-iphoneos/Terraria.app"
    OUT="$ROOT/build/release"; mkdir -p "$OUT"
    TMP="$(mktemp -d)"; mkdir -p "$TMP/Payload"; cp -R "$APP" "$TMP/Payload/"
    rm -f "$OUT/Open-Terraria-iOS.ipa"
    (cd "$TMP" && zip -qry "$OUT/Open-Terraria-iOS.ipa" Payload)
    rm -rf "$TMP"
    echo "[ios] Fertig: $OUT/Open-Terraria-iOS.ipa ($(du -h "$OUT/Open-Terraria-iOS.ipa" | cut -f1))"
    ;;
esac
