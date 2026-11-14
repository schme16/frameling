#!/bin/bash
# Builds the captioned pictures in brand/ab/draw-anywhere/ from the shots made by draw-anywhere.cjs.
# Usage: scripts/docs/ab-draw-anywhere/sheets.sh <dir of shots> [out dir]
set -e
IN=${1:?dir of shots}
OUT=${2:-brand/ab/draw-anywhere}
mkdir -p "$OUT"
for th in dark light; do
  if [ "$th" = dark ]; then bg='#16141f'; fg='#f3eefc'; else bg='#fbf6ea'; fg='#2b2438'; fi
  # tile <file> <caption> <out>: the shot with its caption underneath, on the theme's own background.
  tile() {
    w=$(identify -format '%[fx:w+24]' "$1")
    convert "$1" -background "$bg" -bordercolor "$bg" -border 12 \
      -size "${w}x" -background "$bg" -fill "$fg" -pointsize 17 -font DejaVu-Sans "caption:$2" -append "$3"
  }
  T=$(mktemp -d)
  # The Layers panel: a pair as one row, against the same document with every layer on its own row.
  tile "$IN/layers-paired-$th.png" "A: each pair is one row. 2 rows for 4 layers. Pixels and Vectors chips, eye and padlock for both." "$T/a.png"
  tile "$IN/layers-split-$th.png" "B: the same drawing with every layer on its own row. 4 rows, and every stroke of the other kind adds one." "$T/b.png"
  convert "$T/a.png" "$T/b.png" -background "$bg" -gravity north +append "$OUT/layers-$th.png"
  # Reaching a half.
  tile "$IN/half-menu-$th.png" "Right-click a half's chip to hide it, lock it, swap which is on top, split it off or delete just that half." "$OUT/half-menu-$th.png"
  # The clip.
  cp "$IN/press-$th.mp4" "$OUT/draw-$th.mp4"
  rm -rf "$T"
done
ls -l "$OUT"
