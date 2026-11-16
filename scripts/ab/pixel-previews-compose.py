#!/usr/bin/env python3
"""Puts the pixel Library's soft paint and dry media pictures beside real strokes of the same tools, before and after, and the
Bristles folder before and after. Usage: pixel-previews-compose.py <before dir> <after dir> <out dir>
Reads pixel-library, pixel-real and bristles shots (scripts/docs/ab-pixel-previews); writes before-<theme>.png, after-<theme>.png
and bristles-<theme>.png."""
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1], sys.argv[2], sys.argv[3]
BG = {'dark': (14, 14, 20), 'light': (250, 248, 243)}
FG = {'dark': (235, 232, 225), 'light': (30, 30, 36)}
NAMES = ['Soft pixel brush', 'Pixel airbrush', 'Pixel highlighter', 'Vine charcoal', 'Compressed charcoal', 'Chalk', 'Soft pastel', 'Crayon', 'Soft pencil']


def font(size, bold=False):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''), '/usr/share/fonts/TTF/DejaVuSans%s.ttf' % ('-Bold' if bold else '')):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


PAPER = {'dark': (0x26, 0x25, 0x2d), 'light': (0xf2, 0xe9, 0xd6)}


def paper(img, theme):
    """The page inside a canvas shot: the box round every pixel that is the page's own colour."""
    px = img.load()
    w, h = img.size
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y][:3] == PAPER[theme]:
                xs.append(x)
                ys.append(y)
    return img.crop((min(xs), min(ys), max(xs) + 2, max(ys) + 2))


def library(path):
    """The picker's folder rows: from the first folder's heading down to just above the row size slider."""
    im = Image.open(path).convert('RGB')
    return im.crop((0, 286, im.width, im.height - 40))


def bristles(path):
    im = Image.open(path).convert('RGB')
    return im.crop((0, 152, im.width, im.height - 26))


def real(path, theme):
    p = paper(Image.open(path).convert('RGB'), theme)
    gutter = 130
    im = Image.new('RGB', (p.width + gutter, p.height), BG[theme])
    im.paste(p, (gutter, 0))
    d = ImageDraw.Draw(im)
    for i, n in enumerate(NAMES):
        d.text((gutter - 8, 24 + i * 43 - 6), n, font=font(11), fill=FG[theme], anchor='ra')
    return im


def sheet(panels, heading, theme, path):
    h = max(p.height for _, p in panels)
    pad, head = 24, 64
    W = sum(p.width for _, p in panels) + pad * (len(panels) + 1)
    im = Image.new('RGB', (W, h + head + pad * 2), BG[theme])
    d = ImageDraw.Draw(im)
    d.text((pad, 10), heading, font=font(17, True), fill=FG[theme])
    x = pad
    for title, p in panels:
        d.text((x, 40), title, font=font(13), fill=FG[theme])
        im.paste(p, (x, head + pad))
        x += p.width + pad
    im.save(path)
    print('wrote', path, im.size)


for theme in ('dark', 'light'):
    for label, src, note in (('before', before, 'Before: the highlighter and soft brush are solid worms, dry media are speckle'), ('after', after, 'After: drawn by the real tool, so the highlighter is see-through and dry media catch on the paper')):
        sheet([('Library, Soft paint and Dry media', library(f'{src}/pixel-library-{theme}.png')), ('The real tools on the canvas (top to bottom, the same order)', real(f'{src}/pixel-real-{theme}.png', theme))], note, theme, f'{out}/{label}-{theme}.png')
    sheet([('Before', bristles(f'{before}/bristles-{theme}.png')), ('After', bristles(f'{after}/bristles-{theme}.png'))], 'Bristles folder: the round thumbnails are a short stroke, not a small lined square', theme, f'{out}/bristles-{theme}.png')
