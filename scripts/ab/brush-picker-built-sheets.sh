#!/bin/bash
# Lays the raw shots from scripts/docs/ab-brush-picker-built side by side, dark above light, with a caption over each.
#   scripts/ab/brush-picker-built-sheets.sh brand/ab/brush-picker-built
set -e
d=${1:?folder with raw/}
r="$d/raw"
sheet() { # out, width, then name:caption pairs
  local out=$1 w=$2; shift 2
  local files=()
  for theme in dark light; do
    for pair in "$@"; do files+=(-label "${pair#*:}" "$r/${pair%%:*}-$theme.png"); done
  done
  montage "${files[@]}" -tile "$#x2" -geometry "${w}x+8+8" -background '#2a2a34' -fill '#f4c542' -pointsize 22 "$d/$out"
}
sheet 1-picker-built.png 450 'open-small:Small: 4 brushes' 'open-large:148 brushes, one group open' 'open-recent:148: Recent open' 'open-folded:148: every group folded' 'open-typing:148: typing "pen"'
sheet 2-favourites-and-two-columns.png 520 'open-favourites:Favourites open' 'open-two-columns-wide:Two columns, dragged bigger'
sheet 3-button-at-rest.png 400 'rest-small:4 brushes, shut' 'rest-large:148 brushes, shut' 'rest-large-changed:Changed since picked'
