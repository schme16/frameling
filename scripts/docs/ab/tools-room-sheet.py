# Puts the Tools menu and each submenu, open in turn, on one sheet per theme.
#   python3 scripts/docs/ab/tools-room-sheet.py <shots dir> <out prefix> "<heading>" [<crop tall lists to this height>]
# The shots come from scripts/docs/ab/tools-room.cjs. Lists taller than the crop (Saved brushes, which is a list of your
# own brushes and is the same before and after) are cut there.
import sys
from PIL import Image, ImageDraw, ImageFont

src, out, heading = sys.argv[1:4]
cut = int(sys.argv[4]) if len(sys.argv) > 4 else 700
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
pad, gap, wide = 24, 24, 1700

for theme in ('dark', 'light'):
    names = sorted((f for f in __import__('os').listdir(src) if f.endswith(f'-{theme}.png')), key=lambda f: (f != f'tools-root-{theme}.png', int(f.split('-')[2]) if f.startswith('tools-sub') else 0))
    shots = []
    for f in names:
        im = Image.open(f'{src}/{f}').convert('RGB')
        if im.height > cut:
            im = im.crop((0, 0, im.width, cut))
        shots.append(im)
    rows, row, x = [], [], pad
    for im in shots:
        if x + im.width + pad > wide and row:
            rows.append(row)
            row, x = [], pad
        row.append(im)
        x += im.width + gap
    rows.append(row)
    height = 48 + sum(max(i.height for i in r) + gap for r in rows) + pad
    sheet = Image.new('RGB', (wide, height), BG[theme])
    d = ImageDraw.Draw(sheet)
    d.text((pad, 16), heading, font=font, fill=FG[theme])
    y = 48
    for r in rows:
        x = pad
        for im in r:
            sheet.paste(im, (x, y))
            x += im.width + gap
        y += max(i.height for i in r) + gap
    sheet.save(f'{out}-{theme}.png')
