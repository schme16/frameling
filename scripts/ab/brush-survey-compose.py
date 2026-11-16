#!/usr/bin/env python3
"""Contact sheet of every vector starter brush as a real stroke, named. Usage: brush-survey-compose.py <shots dir> <out dir> <theme>
Reads survey-<n>-<theme>.png (from scripts/docs/ab-brush-survey) and names each row from src/brushes/starters.ts."""
import re, sys
from PIL import Image, ImageDraw, ImageFont

src, out, theme = sys.argv[1], sys.argv[2], sys.argv[3]
text = open('src/brushes/starters.ts').read()
names = [m.group(2) for m in re.finditer(r"^  make\('([a-z0-9-]+)', '([^']*)'", text, re.M)]
PER = 8
BG = {'dark': (14, 14, 20), 'light': (250, 248, 243)}
FG = {'dark': (235, 232, 225), 'light': (30, 30, 36)}


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


pages = (len(names) + PER - 1) // PER
cols = 4
rows_ = (pages + cols - 1) // cols
cw, ch = 300, 410
pad = 14
im = Image.new('RGB', (cols * (cw + pad) + pad, rows_ * (ch + pad) + pad), BG[theme])
d = ImageDraw.Draw(im)
for n in range(pages):
    shot = Image.open(f'{src}/survey-{n}-{theme}.png').convert('RGB')
    # the page is the paper rectangle in the middle of the shot; find it by its difference from the surround
    w, h = shot.size
    bg = shot.getpixel((5, 5))
    xs = [x for x in range(w) if shot.getpixel((x, h // 2)) != bg]
    ys = [y for y in range(h) if shot.getpixel((w // 2, y)) != bg]
    page = shot.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    page = page.resize((cw, int(page.height * cw / page.width)))
    x = pad + (n % cols) * (cw + pad)
    y = pad + (n // cols) * (ch + pad)
    im.paste(page, (x, y))
    for i, nm in enumerate(names[n * PER:(n + 1) * PER]):
        yy = y + int((34 + i * 60 - 22) * cw / 400)
        d.text((x + 4, yy - 2), nm, font=font(10), fill=(150, 150, 160))
im.save(f'{out}/survey-{theme}.png')
print('wrote', f'{out}/survey-{theme}.png', im.size)
