#!/bin/bash
# Records the pen-up shimmer at 30% zoom before and after the fix, in both themes, and encodes the clips (H.264, yuv420p)
# and the pixel-difference pictures into brand/ab/far-zoom-shimmer/. Needs two builds of the renderer:
#   before = the build from before the fix, after = the build with it (a copy of dist/renderer each).
#   scripts/ab/far-zoom-shimmer.sh <before renderer dir> <after renderer dir> <work dir>
set -e
BEFORE=$1; AFTER=$2; WORK=$3
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$ROOT/brand/ab/far-zoom-shimmer
FONT=/usr/share/fonts/truetype/msttcorefonts/arial.ttf
mkdir -p "$OUT" "$WORK"
for v in before after; do
  for t in dark light; do
    r=$BEFORE; [ $v = after ] && r=$AFTER
    SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron "$ROOT/scripts/ab/far-zoom-shimmer.cjs" "$WORK/clip-$v-$t" --renderer "$r" --theme $t 2>&1 | grep recorded
    d=$WORK/clip-$v-$t
    up=$(python3 -c "import json;print(json.load(open('$d/phases.json'))['up']/1000)")
    dn=$(python3 -c "import json;print(json.load(open('$d/phases.json'))['down']/1000)")
    L='Before the fix, 30% zoom'; [ $v = after ] && L='After the fix, 30% zoom'
    if [ $t = dark ]; then FG=white; BG=black@0.55; else FG=black; BG=white@0.7; fi
    box="fontfile=$FONT:fontsize=26:fontcolor=$FG:box=1:boxcolor=$BG:boxborderw=8:expansion=none"
    ffmpeg -y -loglevel error -f concat -safe 0 -i "$d/list.txt" \
      -vf "fps=30,scale=iw*4:ih*4:flags=neighbor,drawtext=$box:text='$L':x=14:y=12,drawtext=$box:text='Stroke held down':x=14:y=h-46:enable='between(t,$dn,$up)',drawtext=$box:text='Pen lifted':x=14:y=h-46:enable='gte(t,$up)',format=yuv420p" \
      -c:v libx264 -preset slow -crf 20 -movflags +faststart -an "$OUT/$v-$t.mp4"
  done
done
python3 - "$WORK" "$OUT" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
import numpy as np
work, out = sys.argv[1], sys.argv[2]
F = ImageFont.truetype('/usr/share/fonts/truetype/msttcorefonts/arial.ttf', 22)
Fb = ImageFont.truetype('/usr/share/fonts/truetype/msttcorefonts/arialbd.ttf', 24)
K = 3
for t in ['dark', 'light']:
    bg = (29, 27, 38) if t == 'dark' else (246, 243, 238)
    fg = (233, 230, 242) if t == 'dark' else (29, 27, 38)
    rows = []
    for v, title in [('before', 'Before the fix'), ('after', 'After the fix')]:
        a = Image.open(f'{work}/clip-{v}-{t}/held.png').convert('RGB')
        b = Image.open(f'{work}/clip-{v}-{t}/done.png').convert('RGB')
        n = np.abs(np.array(a).astype(int) - np.array(b).astype(int)).sum(2) > 0
        box = (40, 40, 260, 206)
        d = np.array(a.convert('L')).astype(float) * 0.25
        m = np.stack([d, d, d], 2).astype(np.uint8)
        m[n] = (255, 40, 40)
        tiles = [x.crop(box).resize(((box[2] - box[0]) * K, (box[3] - box[1]) * K), Image.NEAREST) for x in (a, b, Image.fromarray(m))]
        rows.append((title, int(n.sum()), tiles))
    w, h = tiles[0].size
    pad, head = 16, 36
    im = Image.new('RGB', (pad + 3 * (w + pad), pad + len(rows) * (h + head + pad)), bg)
    dr = ImageDraw.Draw(im)
    caps = ['stroke held down', 'pen lifted', 'screen pixels that changed']
    y = pad
    for title, cnt, tiles in rows:
        for i, x in enumerate(tiles):
            X = pad + i * (w + pad)
            im.paste(x, (X, y + head))
            dr.text((X, y + 4), f'{title}: {caps[i]}' + (f' ({cnt})' if i == 2 else ''), font=Fb if i == 2 else F, fill=fg)
        y += h + head + pad
    im.save(f'{out}/pixel-diff-{t}.png')
PY
ls -l "$OUT"
