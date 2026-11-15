#!/usr/bin/env python3
"""Joins and captions the raw strips from scripts/ab/chalk.cjs.

  python3 scripts/ab/chalk-sheets.py <rawDir> <outDir> <variant>[=caption] ... [--only id,id] [--name suffix]

Each brush gets one picture per theme, <outDir>/<id>-<name>-{dark,light}.png: a row per variant, the four test marks
(firm, light, pressure ramp, three passes) across. Also <outDir>/all-<variant>-{dark,light}.png, every brush for one variant.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
IDS = ['soft-pencil', 'colour-pencil', 'sketch-pencil', 'oil', 'bristle', 'dry-brush', 'chalk', 'charcoal', 'soft-pastel', 'oil-pastel', 'crayon', 'vine-charcoal', 'compressed-charcoal']
NAMES = {'soft-pencil': 'Soft pencil (6B)', 'colour-pencil': 'Colour pencil', 'sketch-pencil': 'Sketch pencil', 'oil': 'Oil paint', 'bristle': 'Bristle brush', 'dry-brush': 'Dry brush', 'chalk': 'Chalk', 'charcoal': 'Charcoal', 'soft-pastel': 'Soft pastel', 'oil-pastel': 'Oil pastel', 'crayon': 'Crayon', 'vine-charcoal': 'Vine charcoal', 'compressed-charcoal': 'Compressed charcoal'}
COLS = ['Firm', 'Light', 'Pressure ramp', 'Three passes']


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def main():
    args = sys.argv[1:]
    only = None
    name = 'strip'
    overview = '--overview' in args
    if overview:
        args.remove('--overview')
    if '--only' in args:
        i = args.index('--only')
        only = args[i + 1].split(',')
        del args[i:i + 2]
    if '--name' in args:
        i = args.index('--name')
        name = args[i + 1]
        del args[i:i + 2]
    raw, out, *variants = args
    vs = [(v.split('=')[0], v.split('=', 1)[1] if '=' in v else v.split('=')[0]) for v in variants]
    for mode in ['dark', 'light']:
        dark = mode == 'dark'
        bg = (22, 22, 30) if dark else (246, 242, 235)
        fg = (240, 238, 245) if dark else (40, 36, 48)
        sub = (170, 166, 184) if dark else (110, 104, 122)
        pad, lab = 20, 190
        if overview:
            v, cap = vs[0]
            ids = only or IDS
            im0 = Image.open(f'{raw}/raw-{v}-{ids[0]}-{mode}.png')
            w, h = im0.size
            h2 = 150
            canvas = Image.new('RGB', (pad * 2 + lab + w, 50 + pad + len(ids) * (h2 + 6)), bg)
            d = ImageDraw.Draw(canvas)
            d.text((pad, 12), f'Every chalk and charcoal brush: {cap}', font=font(BOLD, 20), fill=fg)
            for k, c in enumerate(COLS):
                d.text((pad + lab + k * w // 4 + 20, 32), c, font=font(FONT, 13), fill=sub)
            y = 50
            for bid in ids:
                im = Image.open(f'{raw}/raw-{v}-{bid}-{mode}.png').convert('RGB').crop((0, 20, w, 20 + h2))
                canvas.paste(im, (pad + lab, y))
                d.text((pad, y + h2 // 2 - 9), NAMES[bid], font=font(BOLD, 15), fill=fg)
                y += h2 + 6
            canvas.save(f'{out}/all-{v}-{mode}.png')
            continue
        for bid in (only or IDS):
            imgs = [Image.open(f'{raw}/raw-{v}-{bid}-{mode}.png').convert('RGB') for v, _ in vs]
            w, h = imgs[0].size
            head = 62
            canvas = Image.new('RGB', (pad * 2 + lab + w, head + pad + len(imgs) * (h + 8)), bg)
            d = ImageDraw.Draw(canvas)
            d.text((pad, 14), NAMES[bid], font=font(BOLD, 22), fill=fg)
            for k, c in enumerate(COLS):
                d.text((pad + lab + k * w // 4 + 20, 40), c, font=font(FONT, 14), fill=sub)
            y = head
            for im, (_, cap) in zip(imgs, vs):
                canvas.paste(im, (pad + lab, y))
                d.text((pad, y + h // 2 - 9), cap, font=font(BOLD, 16), fill=fg)
                y += h + 8
            canvas.save(f'{out}/{bid}-{name}-{mode}.png')


main()
