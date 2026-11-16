#!/bin/bash
# Builds the captioned pictures in brand/ab/custom-start/ from the shots made by custom.cjs.
# Usage: scripts/docs/ab-custom-start/sheets.sh <dir of before shots> <dir of after shots> [out dir]
set -e
BEFORE=${1:?dir of before shots}
AFTER=${2:?dir of after shots}
OUT=${3:-brand/ab/custom-start}
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
  # The Custom form as it opens, before and after.
  tile "$BEFORE/form-$th.png" "Before: the frame rate is always on the form." "$T/a.png"
  tile "$AFTER/form-$th.png" "After: no frame rate until you add animation, and a Save as favourite button." "$T/b.png"
  convert "$T/a.png" "$T/b.png" -background "$bg" +append "$OUT/form-before-after-$th.png"
  # Width 1920, height 1080, Pixel art ticked and unticked: the numbers should come back.
  for who in before after; do
    d=$BEFORE; [ $who = after ] && d=$AFTER
    case $who in
      before) c1="Before: typed 1920 x 1080."; c2="Pixel art ticked."; c3="Unticked: back to 800 x 600. Your numbers are gone." ;;
      after) c1="After: typed 1920 x 1080."; c2="Pixel art ticked."; c3="Unticked: 1920 x 1080 is still there." ;;
    esac
    tile "$d/size-1-typed-$th.png" "$c1" "$T/$who-1.png"
    tile "$d/size-2-ticked-$th.png" "$c2" "$T/$who-2.png"
    tile "$d/size-3-unticked-$th.png" "$c3" "$T/$who-3.png"
    convert "$T/$who-1.png" "$T/$who-2.png" "$T/$who-3.png" -background "$bg" -append "$T/$who-col.png"
  done
  convert "$T/before-col.png" "$T/after-col.png" -background "$bg" +append "$OUT/sizes-tick-untick-$th.png"
  # Animation off and on.
  tile "$AFTER/animation-off-$th.png" "Add animation off: just the picture. No frame rate." "$T/c.png"
  tile "$AFTER/animation-on-$th.png" "Add animation on: Frames a second appears." "$T/d.png"
  convert "$T/c.png" "$T/d.png" -background "$bg" -append "$OUT/animation-off-on-$th.png"
  # One favourite saved, sitting beside the cards.
  cp "$AFTER/favourites-$th.png" "$OUT/favourites-row-$th.png"
  rm -rf "$T"
done
