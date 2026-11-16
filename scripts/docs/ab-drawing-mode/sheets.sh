#!/bin/bash
# Builds the captioned side by side pictures in brand/ab/drawing-mode/ from the single shots made by rail.cjs.
# Usage: scripts/docs/ab-drawing-mode/sheets.sh <dir of before shots> <dir of after shots> [out dir]
set -e
BEFORE=${1:?dir of before shots}
AFTER=${2:?dir of after shots}
OUT=${3:-brand/ab/drawing-mode}
mkdir -p "$OUT"
for th in dark light; do
  if [ "$th" = dark ]; then bg='#16141f'; fg='#f3eefc'; else bg='#fbf6ea'; fg='#2b2438'; fi
  # tile <file> <caption>: the shot with its caption underneath, on the theme's own background.
  tile() {
    w=$(identify -format '%[fx:w+24]' "$1")
    convert "$1" -background "$bg" -bordercolor "$bg" -border 12 \
      -size "${w}x" -background "$bg" -fill "$fg" -pointsize 17 -font DejaVu-Sans "caption:$2" -append "$3"
  }
  T=$(mktemp -d)
  tile "$BEFORE/scene-vector-$th.png" "A: before. The Pixel workspace on a vector layer. Three of the four pixel tools are gone and nothing says why." "$T/a.png"
  tile "$AFTER/scene-vector-$th.png" "B: after. The line at the top says Vector layer, 5 tools off. The Pixel tools heading says 3 off." "$T/b.png"
  convert "$T/a.png" "$T/b.png" -background "$bg" -gravity north +append "$OUT/tools-missing-$th.png"

  tile "$BEFORE/rail-pixel-$th.png" "Before: pixel layer" "$T/r1.png"
  tile "$BEFORE/rail-vector-$th.png" "Before: vector layer, tools hidden" "$T/r2.png"
  tile "$BEFORE/rail-vector-grey-$th.png" "Before: vector layer, greyed" "$T/r3.png"
  tile "$AFTER/rail-pixel-$th.png" "After: pixel layer" "$T/r4.png"
  tile "$AFTER/rail-vector-$th.png" "After: vector layer, tools hidden" "$T/r5.png"
  tile "$AFTER/rail-vector-grey-$th.png" "After: vector layer, greyed" "$T/r6.png"
  convert "$T/r1.png" "$T/r2.png" "$T/r3.png" -background "$bg" -gravity north +append "$T/row1.png"
  convert "$T/r4.png" "$T/r5.png" "$T/r6.png" -background "$bg" -gravity north +append "$T/row2.png"
  convert "$T/row1.png" "$T/row2.png" -background "$bg" -gravity west -append "$OUT/rails-$th.png"

  tile "$AFTER/menu-vector-$th.png" "1: press the line. The first item is the way back." "$T/f1.png"
  tile "$AFTER/fixed-vector-$th.png" "2: press it. The pixel layer is picked and the pixel tools are back." "$T/f2.png"
  convert "$T/f1.png" "$T/f2.png" -background "$bg" -gravity north +append "$OUT/fix-$th.png"

  tile "$AFTER/statusbar-wide-vector-$th.png" "A: a line at the top of the rail (chosen). It is where the eye is when the tools go missing." "$T/s1.png"
  tile "$AFTER/statusbar-vector-$th.png" "B: a chip in the status bar (mock). Far from the tools, among size, fps and frame." "$T/s2.png"
  convert "$T/s1.png" "$T/s2.png" -background "$bg" -gravity north +append "$OUT/where-$th.png"
  rm -rf "$T"
done
