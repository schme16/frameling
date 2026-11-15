#!/bin/bash
# Burns a caption into each clip made by pen-mods.cjs, and lays all six side by side (one montage per theme).
#   scripts/docs/ab-pen-mods/caption.sh <dir with the raw <name>-<theme>.mp4 clips> <out dir>
# H.264, yuv420p, even dimensions, as every board clip must be.
set -e
raw=$1; out=$2
mkdir -p "$out"
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
declare -A words=(
  [plain]="Plain, no modifier"
  [steady]="Steady hand, extra smooth"
  [shaky]="Shaky hand, a wobble on the pen"
  [thin]="Thin brush, a third of the size"
  [fat]="Fat brush, two and a half times the size"
  [rope]="Long rope, the pen trails behind"
)
for theme in dark light; do
  for n in plain steady shaky thin fat rope; do
    ffmpeg -y -loglevel error -i "$raw/$n-$theme.mp4" \
      -vf "pad=iw:ih+56:0:0:color=black,drawtext=fontfile=$font:text='${words[$n]}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-42,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" \
      -c:v libx264 -preset slow -crf 24 -movflags +faststart -an "$out/$n-$theme.mp4"
  done
  # Six at once: three across, two down, each at 640 wide.
  ins=(); for n in plain steady shaky thin fat rope; do ins+=(-i "$out/$n-$theme.mp4"); done
  ffmpeg -y -loglevel error "${ins[@]}" -filter_complex \
    "[0]scale=640:-2[a];[1]scale=640:-2[b];[2]scale=640:-2[c];[3]scale=640:-2[d];[4]scale=640:-2[e];[5]scale=640:-2[f];[a][b][c][d][e][f]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0,format=yuv420p" \
    -c:v libx264 -preset slow -crf 26 -movflags +faststart -an "$out/all-$theme.mp4"
done
ls -l "$out"
