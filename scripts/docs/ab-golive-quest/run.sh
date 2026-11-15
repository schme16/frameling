#!/bin/bash
# The Go live quest walked in both themes: a short H.264 clip and a picture per step, into brand/ab/golive-quest/.
# Everything runs inside xvfb, never on the desktop you are working at.
#   npm run build && scripts/docs/ab-golive-quest/run.sh
set -e
root=$(cd "$(dirname "$0")/../../.." && pwd)
out=$root/brand/ab/golive-quest
raw=$(mktemp -d)
mkdir -p "$out"
node "$root/scripts/docs/ab-golive-quest/steps.cjs" > "$raw/steps.json"
for theme in dark light; do
  mkdir -p "$raw/$theme"
  SHOT_SHOW=1 SHOT_STREAM_OK=1 SHOT_WAIT=2500 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron "$root/scripts/docs/record.cjs" "$raw/$theme" "$raw/steps.json" \
    --theme "$theme" --prefs '{"reduceMotion":true,"showTips":false}'
  HELP_OUT=$out "$root/scripts/docs/encode.sh" "$raw/$theme/golive-quest" "golive-quest-$theme" last 960
  for f in "$raw/$theme"/*.png; do cp "$f" "$out/$(basename "${f%.png}")-$theme.png"; done
done
rm -rf "$raw"
