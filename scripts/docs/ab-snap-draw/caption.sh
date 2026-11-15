#!/bin/bash
# Burns a caption into each before and after clip made by snap-draw.cjs, and lays them side by side (one per theme).
#   scripts/docs/ab-snap-draw/caption.sh <raw before dir> <raw after dir> <out dir>
# H.264, yuv420p, even dimensions, as every board clip must be.
set -e
before=$1; after=$2; out=$3
mkdir -p "$out"
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
for theme in dark light; do
  for v in before after; do
    src=$before; [ $v = after ] && src=$after
    if [ $v = before ]; then text="Before. A gap at every join"; else text="After. Lines meet at the ends"; fi
    ffmpeg -y -loglevel error -i "$src/zigzag-$theme.mp4" \
      -vf "pad=iw:ih+56:0:0:color=black,drawtext=fontfile=$font:text='$text':fontcolor=white:fontsize=22:x=(w-text_w)/2:y=h-40,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" \
      -c:v libx264 -preset slow -crf 22 -movflags +faststart -an "$out/$v-$theme.mp4"
  done
  ffmpeg -y -loglevel error -i "$out/before-$theme.mp4" -i "$out/after-$theme.mp4" -filter_complex \
    "[0]scale=640:-2[a];[1]scale=640:-2[b];[a][b]hstack=inputs=2,format=yuv420p" \
    -c:v libx264 -preset slow -crf 24 -movflags +faststart -an "$out/side-by-side-$theme.mp4"
done
ls -l "$out"
