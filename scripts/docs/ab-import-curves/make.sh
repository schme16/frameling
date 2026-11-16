#!/bin/sh
# Rebuilds brand/ab/import-curves: Krita's Basic-5 Size before and after its curves are kept. Needs the app built
# (npm run build). Run from the repo root.
set -e
T=$(mktemp -d)
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-import-curves --out "$T/shots"
python3 scripts/docs/ab-import-curves/compose.py "$T/shots" ${BRUSH_AB_OUT:-brand/ab/import-curves}
rm -rf "$T"
