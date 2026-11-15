#!/usr/bin/env python3
"""Lays each chalk and charcoal medium's marks beside a real scan of that medium, for brand/ab/charcoal.

  python3 scripts/ab/charcoal-compare.py <shotsDir> <refsDir> <outDir>

<shotsDir> holds the shots from scripts/docs/ab-charcoal (<medium>-medium-<theme>.png, ball-<medium>-medium-<theme>.png).
<refsDir> holds the originals named below (public domain scans and a few Creative Commons photos, see SOURCES).
Writes <outDir>/compare-<medium>-<theme>.png, <outDir>/overview-<theme>.png and the small reference crops in <outDir>/ref/.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

shots, refs, out = sys.argv[1:4]
os.makedirs(os.path.join(out, 'ref'), exist_ok=True)

# medium: (original file, crop x, y, w, h, what the real thing is)
SOURCES = {
    'vine-charcoal': ('jockey.jpg', 560, 640, 340, 330, 'Degas, jockey, charcoal on paper (public domain)'),
    'compressed-charcoal': ('echo.jpg', 250, 1040, 340, 330, "Seurat, L'Echo, conte crayon on paper (public domain)"),
    'chalk': ('chalkboard.jpg', 2500, 2400, 700, 700, 'Chalk on a blackboard, m01229 on Flickr, CC BY 2.0'),
    'soft-pastel': ('ballet.jpg', 1050, 500, 340, 330, 'Degas, Ballet Rehearsal, pastel (public domain)'),
    'oil-pastel': ('crayon3.jpg', 300, 200, 340, 330, 'Wax crayon, sunset, Punker1999, CC BY-SA 4.0 (nearest free match)'),
    'crayon': ('crayon3.jpg', 520, 560, 340, 330, 'Wax crayon, sunset, Punker1999, CC BY-SA 4.0'),
    'sketch-pencil': ('munch.jpg', 250, 500, 340, 330, 'Munch, pencil sketch, 1882 (public domain)'),
    'soft-pencil': ('munch.jpg', 330, 560, 340, 330, 'Munch, soft pencil hatching, 1882 (public domain)'),
    'colour-pencil': ('saintaubin.jpg', 1700, 1100, 340, 330, 'Saint-Aubin, graphite and red pencil (public domain)'),
}
LABEL = {'vine-charcoal': 'Vine charcoal', 'compressed-charcoal': 'Compressed charcoal', 'chalk': 'Chalk', 'soft-pastel': 'Soft pastel', 'oil-pastel': 'Oil pastel', 'crayon': 'Crayon', 'sketch-pencil': 'Sketch pencil', 'soft-pencil': 'Soft pencil (6B)', 'colour-pencil': 'Colour pencil'}
SIZE = 356


def font(n):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, n)
    return ImageFont.load_default()


def shot_crop(name):
    im = Image.open(os.path.join(shots, name)).convert('RGB')
    return im.crop((189, 44, 189 + SIZE, 44 + SIZE))


def ref_crop(medium):
    f, x, y, w, h, _ = SOURCES[medium]
    im = Image.open(os.path.join(refs, f)).convert('RGB').crop((x, y, x + w, y + h)).resize((SIZE, SIZE), Image.LANCZOS)
    im.save(os.path.join(out, 'ref', f'{medium}.jpg'), quality=88)
    return im


def ball_crop(medium, theme):
    name = f'ball-{medium}-medium-{theme}.png'
    return shot_crop(name) if os.path.exists(os.path.join(shots, name)) else None


for theme in ('light', 'dark'):
    tiles = []
    for medium in SOURCES:
        ours = shot_crop(f'{medium}-medium-{theme}.png')
        ball = ball_crop(medium, theme)
        real = ref_crop(medium)
        tiles.append(ours)
        pad = 10
        cap = 54
        panels = [ours] + ([ball] if ball else []) + [real]
        sheet = Image.new('RGB', (SIZE * len(panels) + pad * (len(panels) + 1), SIZE + cap + pad), (24, 24, 30) if theme == 'dark' else (244, 240, 232))
        for i, im in enumerate(panels):
            sheet.paste(im, (pad + i * (SIZE + pad), pad))
        d = ImageDraw.Draw(sheet)
        ink = (230, 226, 218) if theme == 'dark' else (40, 38, 46)
        d.text((pad, SIZE + pad + 6), f'Frameling: {LABEL[medium]}, medium paper', fill=ink, font=font(14))
        if ball:
            d.text((pad * 2 + SIZE, SIZE + pad + 6), 'the same, shading a ball', fill=ink, font=font(14))
        d.text((pad + (len(panels) - 1) * (SIZE + pad), SIZE + pad + 6), 'Real: ' + SOURCES[medium][5], fill=ink, font=font(12))
        sheet.save(os.path.join(out, f'compare-{medium}-{theme}.png'))
    # Every medium on one sheet, three across.
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    big = Image.new('RGB', (cols * (SIZE + 8) + 8, rows * (SIZE + 30) + 8), (24, 24, 30) if theme == 'dark' else (244, 240, 232))
    d = ImageDraw.Draw(big)
    ink = (230, 226, 218) if theme == 'dark' else (40, 38, 46)
    for i, (medium, t) in enumerate(zip(SOURCES, tiles)):
        x = 8 + (i % cols) * (SIZE + 8)
        y = 8 + (i // cols) * (SIZE + 30)
        big.paste(t, (x, y))
        d.text((x, y + SIZE + 6), LABEL[medium], fill=ink, font=font(14))
    big.save(os.path.join(out, f'overview-{theme}.png'))
print('done')
