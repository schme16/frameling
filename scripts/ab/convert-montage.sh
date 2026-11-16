#!/usr/bin/env bash
# Builds the captioned side by side pictures for Turn into pixels / Turn into shapes from the entries in
# scripts/docs/ab-convert. Run the entries first:
#   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-convert --out /tmp/convert-ab
#   scripts/ab/convert-montage.sh /tmp/convert-ab brand/ab/convert
set -euo pipefail
src="${1:?folder the entries wrote to}"
out="${2:?folder for the montages}"
mkdir -p "$out"

card() { # card <png> <caption> <bg> <fg> <outfile>: the picture under a caption, padded
  convert "$1" -background "$3" -gravity south -splice 0x34 -fill "$4" -pointsize 17 -annotate +0+8 "$2" -bordercolor "$3" -border 12 "$5"
}

for theme in dark light; do
  if [ "$theme" = dark ]; then bg='#1c1b26'; fg='#e8e6f0'; else bg='#f4f2ee'; fg='#2a2733'; fi
  t="$(mktemp -d)"
  card "$src/pixels-4x-hard-$theme.png" "A: shapes into pixels, 4x, hard edges (a fine grid)" "$bg" "$fg" "$t/a.png"
  card "$src/pixels-16x-hard-$theme.png" "B: the same shapes, 16x, hard edges (big chunky pixels)" "$bg" "$fg" "$t/b.png"
  convert "$t/a.png" "$t/b.png" -background "$bg" +append "$out/pixels-two-sizes-$theme.png"

  card "$src/pixels-1x-soft-$theme.png" "A: finest size, soft edges (the page's own pixels)" "$bg" "$fg" "$t/c.png"
  card "$src/pixels-4x-hard-$theme.png" "B: 4x, hard edges (pixel art)" "$bg" "$fg" "$t/d.png"
  convert "$t/c.png" "$t/d.png" -background "$bg" +append "$out/pixels-soft-vs-hard-$theme.png"

  card "$src/trace-art-steps-$theme.png" "Pixel art, keep the pixel steps: exact" "$bg" "$fg" "$t/e.png"
  card "$src/trace-art-curves-$theme.png" "Pixel art, round into curves: smooth, softer detail" "$bg" "$fg" "$t/f.png"
  convert "$t/e.png" "$t/f.png" -background "$bg" +append "$out/trace-art-steps-vs-curves-$theme.png"

  card "$src/trace-art-steps-$theme.png" "GOOD: flat-colour pixel art traced: 5 shapes, nothing lost" "$bg" "$fg" "$t/g.png"
  card "$src/trace-photo-$theme.png" "BAD: a photo traced: a mosaic of small shapes, and Frameling warns first" "$bg" "$fg" "$t/h.png"
  convert "$t/g.png" "$t/h.png" -background "$bg" -gravity center +append "$out/trace-good-vs-bad-$theme.png"

  cp "$src/trace-photo-dialog-$theme.png" "$out/trace-photo-warning-$theme.png"
  rm -rf "$t"
done
