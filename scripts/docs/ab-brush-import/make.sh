#!/bin/sh
# Rebuilds brand/ab/brush-import: strokes from real GIMP and Photoshop brush files, imported by the real importer, beside
# their names and settings. Needs the app built (npm run build). Run from the repo root.
#   BRUSH_AB_EXTRA=<folder with special.abr> sh scripts/docs/ab-brush-import/make.sh
#   BRUSH_AB_SETS=krita BRUSH_AB_OUT=brand/ab/brush-import2 sh scripts/docs/ab-brush-import/make.sh
set -e
T=$(mktemp -d)
npx esbuild src/brushes/import/index.ts --bundle --platform=node --format=cjs --outfile="$T/importer.cjs" --log-level=error
node scripts/docs/ab-brush-import/_describe.cjs "$T/importer.cjs" > "$T/captions.json"
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-import --out "$T/shots"
python3 scripts/docs/ab-brush-import/compose.py "$T/shots" "$T/captions.json" ${BRUSH_AB_OUT:-brand/ab/brush-import}
rm -rf "$T"
