#!/usr/bin/env python3
"""Joins and captions the raw pictures from scripts/ab/brush-size.cjs.

  python3 scripts/ab/brush-size-sheets.py <rawDir> <outDir>

Writes <outDir>/sizes-{dark,light}.png (old cap, a middle size, the top of the slider) and
<outDir>/typed-{dark,light}.png (the Size control at the top of its range, a bigger number being typed, and the result).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

raw, out = sys.argv[1], sys.argv[2]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def sheet(panels, name, dark):
    bg = (22, 22, 30) if dark else (246, 242, 235)
    fg = (240, 238, 245) if dark else (40, 36, 48)
    sub = (170, 166, 184) if dark else (110, 104, 122)
    pad, gap, head, foot = 24, 20, 0, 74
    imgs = [Image.open(f'{raw}/raw-{p[0]}.png').convert('RGB') for p in panels]
    h = max(i.height for i in imgs)
    w = pad * 2 + sum(i.width for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new('RGB', (w, pad + h + foot + pad // 2), bg)
    d = ImageDraw.Draw(canvas)
    x = pad
    for img, (_, title, note) in zip(imgs, panels):
        canvas.paste(img, (x, pad))
        d.text((x, pad + h + 12), title, font=font(BOLD, 20), fill=fg)
        d.text((x, pad + h + 40), note, font=font(FONT, 15), fill=sub)
        x += img.width + gap
    canvas.save(f'{out}/{name}.png')


def rows(panels, name, dark):
    """The Size control only, one row per state, with its words beside it."""
    bg = (22, 22, 30) if dark else (246, 242, 235)
    fg = (240, 238, 245) if dark else (40, 36, 48)
    sub = (170, 166, 184) if dark else (110, 104, 122)
    pad, gap = 24, 16
    crops = []
    for p in panels:
        im = Image.open(f'{raw}/raw-{p[0]}.png').convert('RGB')
        # The Size label and slider sit just under the "Brush from selection" button.
        crops.append(im.crop((0, 348, im.width, 412)))
    cw = crops[0].width
    h = sum(c.height for c in crops) + gap * (len(crops) - 1)
    canvas = Image.new('RGB', (pad * 3 + cw + 420, pad * 2 + h), bg)
    d = ImageDraw.Draw(canvas)
    y = pad
    for c, (_, title, note) in zip(crops, panels):
        canvas.paste(c, (pad, y))
        d.text((pad * 2 + cw, y + 6), title, font=font(BOLD, 18), fill=fg)
        d.text((pad * 2 + cw, y + 32), note, font=font(FONT, 13), fill=sub)
        y += c.height + gap
    canvas.save(f'{out}/{name}.png')


import os
os.makedirs(out, exist_ok=True)
for mode in ('dark', 'light'):
    dark = mode == 'dark'
    sheet(
        [
            (f'old-{mode}', 'Before: the top of the slider was 120 px', 'A 120 px stroke on a 2000 x 1500 canvas.'),
            (f'mid-{mode}', 'After: 800 px, about halfway along', 'The slider now reaches much further than 120 px.'),
            (f'top-{mode}', 'After: 2200 px, the end of the slider', 'The longer side plus a tenth: wide enough to cover the canvas.'),
        ],
        f'sizes-{mode}',
        dark,
    )
    rows([
        (f'slider-{mode}', 'The slider at its end: 2200 px', 'First stretch for small sizes, last stretch for the huge ones.'),
        (f'typing-{mode}', 'Click the number and type 9000', 'The box takes sizes past the end of the slider.'),
        (f'typed-{mode}', 'Enter keeps it: 9000 px', 'Not clamped back. The slider rests at its end.'),
    ], f'typed-{mode}', dark)
print('written')
