#!/bin/bash
# Burns a caption into the before and after clips (the clip entry of previews.cjs, run against the old build and the new
# one) and lays them side by side, one per theme. H.264, yuv420p, even dimensions.
#   scripts/docs/ab-brush-looks/caption.sh <raw before dir> <raw after dir> <out dir>
set -e
before=$1; after=$2; out=$3
mkdir -p "$out"
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
for theme in dark light; do
  for v in before after; do
    src=$before; [ $v = after ] && src=$after
    if [ $v = before ]; then text="Before. Oil, bristle and dry brush are one speckled worm"; else text="After. Solid streaked paint, separate hairs, skipping paper"; fi
    ffmpeg -y -loglevel error -i "$src/clip-$theme.mp4" \
      -vf "pad=iw:ih+56:0:0:color=black,drawtext=fontfile=$font:text='$text':fontcolor=white:fontsize=18:x=(w-text_w)/2:y=h-40,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" \
      -c:v libx264 -preset slow -crf 22 -movflags +faststart -an "$out/clip-$v-$theme.mp4"
  done
  ffmpeg -y -loglevel error -i "$out/clip-before-$theme.mp4" -i "$out/clip-after-$theme.mp4" -filter_complex \
    "[0]scale=640:-2[a];[1]scale=640:-2[b];[a][b]hstack=inputs=2,format=yuv420p" \
    -c:v libx264 -preset slow -crf 24 -movflags +faststart -an "$out/clip-side-by-side-$theme.mp4"
done
ls -l "$out"
