#!/bin/bash
# Builds the captioned pictures in brand/ab/toggle/ from the shots made by toggle.cjs.
# Usage: scripts/docs/ab-toggle/sheets.sh <dir of shots> [out dir]
set -e
IN=${1:?dir of shots}
OUT=${2:-brand/ab/toggle}
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
  # The switch on each kind of layer, wide and icons only.
  tile "$IN/rail-vectors-$th.png" "On a vector layer: Vectors is lit. The tools make shapes." "$T/a.png"
  tile "$IN/rail-pixels-$th.png" "On a pixel layer: Pixels is lit. The tools paint pixels." "$T/b.png"
  tile "$IN/narrow-vectors-$th.png" "Narrow rail: icons only, and the 5 is tools off." "$T/c.png"
  tile "$IN/narrow-pixels-$th.png" "Narrow rail, pixel layer." "$T/d.png"
  convert "$T/a.png" "$T/b.png" "$T/c.png" "$T/d.png" -background "$bg" -gravity north +append "$OUT/switch-$th.png"
  # The moment a pixel-only tool is picked.
  tile "$IN/flip-before-$th.png" "Before: on a vector layer, with the Brush." "$T/e.png"
  tile "$IN/flip-after-$th.png" "After picking Shade: it needs pixels, so the switch flips to Pixels and you are on the pixel layer." "$T/f.png"
  convert "$T/e.png" "$T/f.png" -background "$bg" -gravity north +append "$OUT/flip-$th.png"
  # The offer, with no layer of that kind.
  tile "$IN/offer-$th.png" "Pressing Pixels with no pixel layer: asked once, then remembered." "$T/g.png"
  cp "$T/g.png" "$OUT/offer-$th.png"
  rm -rf "$T"
done
# The clip: pressing Pixels, then Vectors, then picking Shade.
for th in dark light; do cp "$IN/press-$th.mp4" "$OUT/press-$th.mp4"; done
ls -l "$OUT"
