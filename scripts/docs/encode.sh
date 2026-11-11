#!/bin/bash
# Turns a folder of frames recorded by record.cjs into an H.264 MP4 plus a poster PNG.
#   scripts/docs/encode.sh <frames dir> <name> [poster frame number, default the last] [width, default 800]
# Writes public/help/<name>.mp4 and public/help/<name>-poster.png. H.264 only: the people this is for can't play AV1.
set -e
dir=$1; name=$2; poster=${3:-last}; width=${4:-800}
out=$(cd "$(dirname "$0")/../.." && pwd)/public/help
mkdir -p "$out"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$dir/list.txt" \
  -vf "fps=30,scale='min($width,iw)':-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 26 -movflags +faststart -an "$out/$name.mp4"
if [ "$poster" = last ]; then pf=$(ls "$dir"/f*.png | tail -1); else pf=$(printf "%s/f%04d.png" "$dir" "$poster"); fi
convert "$pf" -resize "${width}x>" -strip -define png:compression-level=9 "$out/$name-poster.png"
ls -l "$out/$name.mp4" "$out/$name-poster.png"
