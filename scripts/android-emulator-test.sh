#!/usr/bin/env bash
# Prova l'APK su un emulatore Android già acceso (usato dal workflow "Prova su Android").
# Installa l'app, la apre, la controlla con scripts/android-check.mjs e salva schermate e log.
# Uso: bash scripts/android-emulator-test.sh <file apk> <cartella risultati>
set -euo pipefail

APK="$1"
OUT="$2"
PKG=com.nikcirri.lupus
mkdir -p "$OUT"

save_log() {
  adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
}

adb wait-for-device
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 12

PID=$(adb shell pidof "$PKG" | tr -d '\r' || true)
if [ -z "$PID" ]; then
  save_log
  echo "::error::L'app non è partita (o si è chiusa subito)"
  grep -A 30 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -n 60 || true
  exit 1
fi
echo "App avviata (processo $PID)"

# Debug remoto della pagina: il WebView apre un socket con il numero del processo.
adb forward tcp:9222 "localabstract:webview_devtools_remote_$PID"

set +e
node scripts/android-check.mjs "$OUT"
RESULT=$?
set -e

adb exec-out screencap -p > "$OUT/6-fine.png" || true
save_log
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "::error::L'app si è chiusa da sola (FATAL EXCEPTION nel log)"
  grep -A 30 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -n 60
  exit 1
fi
if [ "$RESULT" -ne 0 ]; then
  echo "::error::Alcuni controlli sull'emulatore non sono riusciti"
fi
exit "$RESULT"
