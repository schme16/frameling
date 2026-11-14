#!/bin/bash
# Records the whole virtual screen while the real app restarts itself (the relaunched copy runs the harness again).
# Run it inside xvfb, from the checkout, after `npm run build`:
#   THEME=dark xvfb-run -a -s "-screen 0 1600x1000x24" scripts/ab/restart-recent-record.sh /tmp/restart-dark
#   python3 scripts/ab/restart-recent-cut.py dark   # cuts, crops and captions (reads /tmp/restart-<theme>)
OUT=$1
rm -rf "$OUT" /tmp/frameling-rr-work; mkdir -p "$OUT"
ffmpeg -loglevel error -y -f x11grab -framerate 15 -video_size 1400x900 -i "$DISPLAY" -c:v libx264 -preset veryfast -pix_fmt yuv420p "$OUT/raw.mp4" &
FF=$!
date +%s%3N > "$OUT/start.txt"; sleep 1
RR_THEME=${THEME:-dark} RR_MODE=${MODE:-restart} RR_OUT="$OUT" RR_WORK=/tmp/frameling-rr-work npx electron scripts/ab/restart-recent.cjs > "$OUT/log.txt" 2>&1 &
APP=$!
for i in $(seq 1 90); do [ -f "$OUT/result.json" ] && break; sleep 1; done
sleep 4
kill -INT $FF; wait $FF 2>/dev/null
pkill -f "scripts/ab/restart-recent.cjs" 2>/dev/null; true
echo recorded; exit 0
