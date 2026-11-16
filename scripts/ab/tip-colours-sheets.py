# Puts the before and after tip pictures from scripts/ab/tip-colours.cjs side by side, one per theme, plus one sheet
# of every theme. Also prints how many pixels differ in each pair, so "nothing moved" is a number.
#   python3 scripts/ab/tip-colours-sheets.py <shotsDir> <outDir>
import os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
ids = sorted({f[len('before-'):-4] for f in os.listdir(src) if f.startswith('before-')})
SIDE = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
MODE = {'midnight-sketchbook': 'dark', 'batwing': 'dark', 'lantern-night': 'dark'}
rows = []
for i in ids:
    a = Image.open(os.path.join(src, f'before-{i}.png')).convert('RGB')
    b = Image.open(os.path.join(src, f'after-{i}.png')).convert('RGB')
    mode = MODE.get(i, 'light')
    bg = SIDE[mode]
    fg = (235, 232, 245) if mode == 'dark' else (40, 34, 30)
    if a.size == b.size:
        n = sum(1 for p in ImageChops.difference(a, b).getdata() if max(p) > 2)
    else:
        n = -1
    w = max(a.width, b.width)
    h = max(a.height, b.height)
    sheet = Image.new('RGB', (w * 2 + 30, h + 52), bg)
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), f'Before: {i}', fill=fg, font=font)
    d.text((w + 20, 8), 'After' + (' (no pixels moved)' if n == 0 else f' ({n} pixels differ)'), fill=fg, font=font)
    sheet.paste(a, (10, 36))
    sheet.paste(b, (w + 20, 36))
    sheet.save(os.path.join(out, f'{i}-before-vs-after.png'))
    rows.append(sheet)
    print(i, 'differing pixels:', n)
H = sum(r.height for r in rows)
big = Image.new('RGB', (max(r.width for r in rows), H), (128, 128, 128))
y = 0
for r in rows:
    big.paste(r, (0, y)); y += r.height
big.save(os.path.join(out, 'all-themes-before-vs-after.png'))
