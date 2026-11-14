#!/bin/sh
# Builds the side by side pictures in brand/ab/pixel-gradient/ from the single looks made by
#   npm run help:media -- --entries scripts/docs/ab-pixel-gradient --out <dir>
# Usage: scripts/ab/pixel-gradient-montage.sh <dir of looks> [out dir]
set -e
IN=${1:?dir of looks}
OUT=${2:-brand/ab/pixel-gradient}
mkdir -p "$OUT"
for th in dark light; do
  if [ "$th" = dark ]; then bg='#16141f'; fg='#f3eefc'; else bg='#fbf6ea'; fg='#2b2438'; fi
  mont() {
    out=$1; tile=$2; shift 2
    set -- "$@"
    cmd=""
    for pair in "$@"; do f=${pair%%=*}; l=${pair#*=}; cmd="$cmd -label \"$l\" $IN/ab-$f-$th.png"; done
    eval montage $cmd -tile "${tile}x" -geometry +14+14 -background "'$bg'" -fill "'$fg'" -pointsize 20 "$out"
  }
  mont "$OUT/dither-styles-$th.png" 3 "dither-classic=Classic (4 by 4)" "dither-smooth=Smooth (8 by 8)" "dither-chunky=Chunky (2 by 2)" "dither-grainy=Grainy" "dither-bands=Bands (no dither)"
  mont "$OUT/colours-$th.png" 3 "colours-two=A: Two colours only" "colours-palette=B: Palette steps (new default)" "colours-smooth=C: Smooth mix"
  mont "$OUT/radial-vs-linear-$th.png" 2 "colours-palette=Linear" "radial-palette=Radial"
done
