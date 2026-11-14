#!/bin/bash
# Lays the shots from scripts/docs/ab-brush-tips-list side by side with a caption over each: before shots in
# <dir>/before, after shots in <dir>/raw. Dark above light.
#   scripts/ab/brush-tips-list-sheets.sh brand/ab/brush-tips-list
set -e
d=${1:?folder with before/ and raw/}
sheet() { # out, width, rows (dark light | odd-dark odd-light), then file:caption pairs (file as dir/name)
  local out=$1 w=$2 modes=$3; shift 3
  local files=()
  for mode in $modes; do
    for pair in "$@"; do
      local f=${pair%%:*} cap=${pair#*:}
      local name=${f##*/} dir=${f%/*}
      files+=(-label "$cap" "$d/$dir/${name/@/$mode}.png")
    done
  done
  montage "${files[@]}" -tile "$#x" -geometry "${w}x+6+6" -background '#2a2a34' -fill '#f4c542' -pointsize 20 "$d/$out"
}
sheet 1-preview-contrast.png 400 'dark light' \
  'before/preview-8-@:Before: 8px' 'raw/preview-8-@:After: 8px' 'before/preview-3-@:Before: 3px' 'raw/preview-3-@:After: 3px'
sheet 1b-preview-contrast-other-themes.png 400 'dark light' \
  'before/preview-8-odd-@:Before: 8px' 'raw/preview-8-odd-@:After: 8px' 'before/preview-3-odd-@:Before: 3px' 'raw/preview-3-odd-@:After: 3px'
sheet 2-row-thumbnails.png 360 'dark light' \
  'before/open-default-@:Before: a plain dot' 'raw/g4-@:After: real tips (chalk, charcoal)' 'raw/g5-@:After: watercolour washes' 'raw/g6-@:After: stamps'
sheet 3-brush-list.png 360 'dark light' \
  'before/open-default-@:Before: 8 brushes' 'raw/groups-@:After: 45 in 7 groups' 'raw/g0-@:Pencils' 'raw/g1-@:Pens'
sheet 3b-brush-list-more.png 360 'dark light' \
  'raw/g2-@:Markers' 'raw/g3-@:Paint' 'raw/g4-@:Chalk and charcoal' 'raw/g6-@:Stamps and texture'
sheet 4-other-themes-rows.png 380 'dark light' \
  'before/open-default-odd-@:Before: a plain dot' 'raw/g1-odd-@:After: Pens' 'raw/g4-odd-@:After: chalk and charcoal'
