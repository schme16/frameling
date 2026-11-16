#!/usr/bin/env python3
"""Lays each vector chalk and charcoal brush (paper tooth) beside the pixel version and a real scan, for brand/ab/vector-charcoal.

  python3 scripts/ab/vector-charcoal-compare.py <vectorShotsDir> <outDir> [<pixelShotsDir>]

<vectorShotsDir> holds the shots from scripts/docs/ab-vector-charcoal (<brush>-<theme>.png, ball-<brush>-<theme>.png, and
<brush>-holes-<theme>.png for the older grain made of tiny shapes when it was shot too).
<pixelShotsDir> holds the pixel version's shots from scripts/docs/ab-charcoal (<medium>-medium-<theme>.png); it defaults to
brand/ab/charcoal. The real scans are the public domain crops already kept in brand/ab/charcoal/ref/.
Writes <outDir>/compare-<brush>-<theme>.png (vector marks, vector ball, the pixel version, the real scan), and overview-<theme>.png.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

vec, out = sys.argv[1:3]
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
pix = sys.argv[3] if len(sys.argv) > 3 else os.path.join(root, 'brand', 'ab', 'charcoal')
refs = os.path.join(root, 'brand', 'ab', 'charcoal', 'ref')
os.makedirs(out, exist_ok=True)

LABEL = {'vine-charcoal': 'Vine charcoal', 'compressed-charcoal': 'Compressed charcoal', 'chalk': 'Chalk', 'soft-pastel': 'Soft pastel', 'oil-pastel': 'Oil pastel', 'crayon': 'Crayon', 'sketch-pencil': 'Sketch pencil', 'soft-pencil': 'Soft pencil (6B)', 'colour-pencil': 'Colour pencil'}
REAL = {
    'vine-charcoal': 'Degas, jockey, charcoal (public domain)',
    'compressed-charcoal': "Seurat, L'Echo, conte crayon (public domain)",
    'soft-pastel': 'Degas, Ballet Rehearsal, pastel (public domain)',
    'sketch-pencil': 'Munch, pencil sketch (public domain)',
    'soft-pencil': 'Munch, soft pencil (public domain)',
    'colour-pencil': 'Saint-Aubin, graphite and red pencil (public domain)',
}
SIZE = 356


def font(n):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, n)
    return ImageFont.load_default()


def crop(path):
    # The page sits at the same place in every shot of the canvas (the page is 400 pixels square in the middle).
    return Image.open(path).convert('RGB').crop((189, 44, 189 + SIZE, 44 + SIZE)) if os.path.exists(path) else None


for theme in ('light', 'dark'):
    tiles = []
    for brush in LABEL:
        ours = crop(os.path.join(vec, f'{brush}-{theme}.png'))
        if ours is None:
            continue
        ball = crop(os.path.join(vec, f'ball-{brush}-{theme}.png'))
        pixel = crop(os.path.join(pix, f'{brush}-medium-{theme}.png'))
        holes = crop(os.path.join(vec, f'{brush}-holes-{theme}.png'))
        real = Image.open(os.path.join(refs, f'{brush}.jpg')).convert('RGB') if brush in REAL and os.path.exists(os.path.join(refs, f'{brush}.jpg')) else None
        panels = [(ours, 'Vector, with paper tooth')]
        if ball:
            panels.append((ball, 'the same, shading a ball'))
        if holes:
            panels.append((holes, 'Vector before: tiny shapes'))
        if pixel:
            panels.append((pixel, 'Pixel layer (approved)'))
        if real:
            panels.append((real, 'Real: ' + REAL[brush]))
        pad = 10
        cap = 54
        dark = theme == 'dark'
        sheet = Image.new('RGB', (SIZE * len(panels) + pad * (len(panels) + 1), SIZE + cap + pad), (24, 24, 30) if dark else (244, 240, 232))
        d = ImageDraw.Draw(sheet)
        ink = (230, 226, 218) if dark else (40, 38, 46)
        for i, (im, cap_text) in enumerate(panels):
            sheet.paste(im, (pad + i * (SIZE + pad), pad))
            d.text((pad + i * (SIZE + pad), SIZE + pad + 6), (LABEL[brush] + ': ' if i == 0 else '') + cap_text, fill=ink, font=font(12 if i == len(panels) - 1 and real else 14))
        sheet.save(os.path.join(out, f'compare-{brush}-{theme}.png'))
        tiles.append((brush, ours))
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    big = Image.new('RGB', (cols * (SIZE + 8) + 8, rows * (SIZE + 30) + 8), (24, 24, 30) if theme == 'dark' else (244, 240, 232))
    d = ImageDraw.Draw(big)
    ink = (230, 226, 218) if theme == 'dark' else (40, 38, 46)
    for i, (brush, t) in enumerate(tiles):
        x = 8 + (i % cols) * (SIZE + 8)
        y = 8 + (i // cols) * (SIZE + 30)
        big.paste(t, (x, y))
        d.text((x, y + SIZE + 6), LABEL[brush], fill=ink, font=font(14))
    big.save(os.path.join(out, f'overview-{theme}.png'))
print('done')
