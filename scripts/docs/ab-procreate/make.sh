#!/bin/sh
# Rebuilds brand/ab/procreate-import: Procreate's own thumbnail of each fixture brush, the same stroke drawn with the first guess
# from the research notes, and the same stroke with the units the importer uses now. Run from the repo root. No Electron and no
# screen: the real importer and stroke engine run in Node.
#   sh scripts/docs/ab-procreate/make.sh [out dir]
set -e
T=$(mktemp -d)
npx esbuild scripts/docs/ab-procreate/entry.ts --bundle --platform=node --format=cjs --outfile="$T/engine.cjs" --log-level=error
node scripts/docs/ab-procreate/make.cjs "$T/engine.cjs" "$T/panels"
python3 scripts/docs/ab-procreate/compose.py "$T/panels" "${1:-brand/ab/procreate-import}"
rm -rf "$T"
