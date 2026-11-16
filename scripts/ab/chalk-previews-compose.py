#!/usr/bin/env python3
"""Puts the brush Library's chalk previews beside real canvas strokes. Usage: chalk-previews-compose.py <shots dir> <out dir> <prefix>
Reads library-<theme>.png, library-more-<theme>.png and canvas-<theme>.png (from scripts/docs/ab-chalk-previews)."""
import sys
from PIL import Image, ImageDraw, ImageFont

src, out, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
BG = {'dark': (14, 14, 20), 'light': (250, 248, 243)}
FG = {'dark': (235, 232, 225), 'light': (30, 30, 36)}
NAMES = ['Chalk', 'Charcoal', 'Soft pastel', 'Oil pastel', 'Crayon', 'Vine charcoal', 'Compressed charcoal']


def paper_crop(img, theme):
    """The 400 x 400 page inside the shot, at the size the shot is always made at (fit zoom in a 734 x 444 element)."""
    return img.crop((189, 44, 545, 400))


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


for theme in ('dark', 'light'):
    a = Image.open(f'{src}/library-{theme}.png').convert('RGB')
    b = Image.open(f'{src}/library-more-{theme}.png').convert('RGB')
    c = paper_crop(Image.open(f'{src}/canvas-{theme}.png').convert('RGB'), theme)
    panels = [('Library, top of the folder', a), ('Library, scrolled down', b), ('Real strokes on the canvas, in the same order: ' + ', '.join(NAMES), c)]
    h = max(p.height for _, p in panels)
    pad, head = 24, 56
    W = sum(p.width for _, p in panels) + pad * (len(panels) + 1)
    im = Image.new('RGB', (W, h + head + pad * 2), BG[theme])
    d = ImageDraw.Draw(im)
    x = pad
    for title, p in panels:
        if title.startswith('Real'):
            d.text((x, pad), 'Real strokes on the canvas', font=font(15), fill=FG[theme])
            d.text((x, pad + 20), 'top to bottom: ' + ', '.join(NAMES[:4]) + ',', font=font(11), fill=FG[theme])
            d.text((x, pad + 34), ', '.join(NAMES[4:]), font=font(11), fill=FG[theme])
        else:
            d.text((x, pad), title, font=font(15), fill=FG[theme])
        im.paste(p, (x, pad + head))
        x += p.width + pad
    im.save(f'{out}/{prefix}-{theme}.png')
    print('wrote', f'{out}/{prefix}-{theme}.png', im.size)
