#!/bin/bash
# Starts Adobe Illustrator (under Wine) with a script file and waits until the script says it is done.
# Called by scripts/e2e/illustrator.cjs inside xvfb-run. Never run it on a real desktop.
#
#   illustrator-run.sh <script.jsx> <done-file> <timeout-seconds> <shots-dir>
#
# Environment: ILLUSTRATOR_PREFIX (the Wine prefix), WINE_RUNNER (the folder of the Wine build Lutris uses for it).
# Illustrator runs inside a Wine virtual desktop so its windows show on the virtual screen without a window manager.
# Two boxes are answered by pressing a button (screenshots are looked at for them): "Adobe Illustrator quit unexpectedly
# during the previous launch" (Launch Illustrator), and "You are about to run the script" (Continue).
set -u
JSX="$1"; DONE_FILE="$2"; T="${3:-300}"; SHOTS="$4"
: "${ILLUSTRATOR_PREFIX:?set ILLUSTRATOR_PREFIX to the Wine prefix}"
: "${WINE_RUNNER:?set WINE_RUNNER to the Wine build folder}"
export WINEPREFIX="$ILLUSTRATOR_PREFIX"
export PATH="$WINE_RUNNER/bin:$PATH" WINEDEBUG=-all WINEARCH=win64
# What Lutris sets for this game: DXVK in the prefix, dxgi native then builtin.
export WINEDLLOVERRIDES="d3d10core,d3d11,d3d9=n;dxgi=n,b" DXVK_CONFIG="dxgi.nvapiHack=False" DXVK_FILTER_DEVICE_NAME=NVIDIA LC_ALL=
EXE="$WINEPREFIX/drive_c/Program Files/Adobe/Adobe Illustrator 2026/Support Files/Contents/Windows/Illustrator.exe"
mkdir -p "$SHOTS"
rm -f "$DONE_FILE"
wine explorer /desktop=ai,1600x1000 "$EXE" "Z:${JSX//\//\\}" > "$SHOTS/wine.log" 2>&1 &
i=0
while [ $i -lt "$T" ]; do
  sleep 3; i=$((i+3))
  import -window root "$SHOTS/cur.png" 2>/dev/null
  [ $((i%30)) -eq 0 ] && cp "$SHOTS/cur.png" "$SHOTS/shot-$i.png"
  px() { convert "$SHOTS/cur.png" -format "$1" info: 2>/dev/null; }
  if [ "$(px '%[hex:p{300,81}]%[hex:p{300,275}]')" = "3296FAF5F5F5" ]; then
    xdotool mousemove 381 255 click 1; echo "pressed Launch Illustrator at ${i}s" >> "$SHOTS/actions.log"
  fi
  if [ "$(px '%[hex:p{900,444}]%[hex:p{700,560}]')" = "3296FA535353" ]; then
    xdotool mousemove 902 543 click 1; echo "pressed Continue at ${i}s" >> "$SHOTS/actions.log"
  fi
  [ -e "$DONE_FILE" ] && break
done
[ -e "$DONE_FILE" ] || cp "$SHOTS/cur.png" "$SHOTS/timeout.png"
echo "waited ${i}s"
# The script ends with app.quit(): give Illustrator a moment to leave cleanly, then stop whatever is left of this prefix.
timeout 40 wineserver -w
wineserver -k
exit 0
