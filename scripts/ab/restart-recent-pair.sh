#!/bin/bash
# pair <theme> <name> <beforecaption> <aftercaption>
theme=$1; name=$2
bg=$([ "$theme" = dark ] && echo '#14121b' || echo '#f3ece0'); fg=$([ "$theme" = dark ] && echo '#f1e9d8' || echo '#2a2433')
cap() { convert -background "$bg" -fill "$fg" -font DejaVu-Sans -pointsize 17 -size ${3}x caption:"$2" "$1"; }
W=$(identify -format %w /tmp/claude-1000/rr-before/$name-$theme.png); W2=$(identify -format %w /tmp/claude-1000/rr-after/$name-$theme.png)
cap /tmp/claude-1000/c1.png "$3" $W; cap /tmp/claude-1000/c2.png "$4" $W2
convert /tmp/claude-1000/rr-before/$name-$theme.png /tmp/claude-1000/c1.png -background "$bg" -append /tmp/claude-1000/p1.png
convert /tmp/claude-1000/rr-after/$name-$theme.png /tmp/claude-1000/c2.png -background "$bg" -append /tmp/claude-1000/p2.png
convert /tmp/claude-1000/p1.png /tmp/claude-1000/p2.png -background "$bg" -gravity north +smush 40 -bordercolor "$bg" -border 24 "$5"
