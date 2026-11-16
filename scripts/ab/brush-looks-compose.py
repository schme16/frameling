#!/usr/bin/env python3
"""Puts the paint brushes' Library pictures beside real canvas strokes, before and after. Usage: brush-looks-compose.py <before dir> <after dir> <out dir>
Reads library*, canvas and three shots (from scripts/docs/ab-brush-looks); writes before-<theme>.png, after-<theme>.png and three-<theme>.png."""
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1], sys.argv[2], sys.argv[3]
BG = {'dark': (14, 14, 20), 'light': (250, 248, 243)}
FG = {'dark': (235, 232, 225), 'light': (30, 30, 36)}
NAMES = ['Gouache (not changed)', 'Oil paint', 'Bristle brush', 'Dry brush', 'Hog bristle (not changed)', 'Rake']


def font(size, bold=False):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''), '/usr/share/fonts/TTF/DejaVuSans%s.ttf' % ('-Bold' if bold else '')):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def paper(img):
    """The page inside a canvas shot: the rectangle that differs from the surround."""
    w, h = img.size
    bg = img.getpixel((5, 5))
    xs = [x for x in range(w) if img.getpixel((x, h // 2)) != bg]
    ys = [y for y in range(h) if img.getpixel((w // 2, y)) != bg]
    return img.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


for theme in ('dark', 'light'):
    for label, src in (('before', before), ('after', after)):
        panels = [
            ('Library, Paint folder', Image.open(f'{src}/library-{theme}.png').convert('RGB')),
            ('Library, scrolled', Image.open(f'{src}/library-more-{theme}.png').convert('RGB')),
            ('Library, Bristles folder', Image.open(f'{src}/library-bristles-{theme}.png').convert('RGB')),
            ('Real strokes on the canvas', paper(Image.open(f'{src}/canvas-{theme}.png').convert('RGB'))),
        ]
        h = max(p.height for _, p in panels)
        pad, head = 24, 56
        W = sum(p.width for _, p in panels) + pad * (len(panels) + 1)
        im = Image.new('RGB', (W, h + head + pad * 2), BG[theme])
        d = ImageDraw.Draw(im)
        d.text((pad, 8), label.capitalize(), font=font(18, True), fill=FG[theme])
        x = pad
        for title, p in panels:
            d.text((x, pad + 8), title, font=font(14), fill=FG[theme])
            if title.startswith('Real'):
                d.text((x, pad + 26), 'top to bottom: ' + ', '.join(NAMES[:3]) + ',', font=font(10), fill=FG[theme])
                d.text((x, pad + 38), ', '.join(NAMES[3:]), font=font(10), fill=FG[theme])
            im.paste(p, (x, pad + head))
            x += p.width + pad
        im.save(f'{out}/{label}-{theme}.png')
        print('wrote', f'{out}/{label}-{theme}.png', im.size)

    a = paper(Image.open(f'{before}/three-{theme}.png').convert('RGB'))
    b = paper(Image.open(f'{after}/three-{theme}.png').convert('RGB'))
    pad, head = 24, 60
    im = Image.new('RGB', (a.width + b.width + pad * 3, max(a.height, b.height) + head + pad * 2), BG[theme])
    d = ImageDraw.Draw(im)
    d.text((pad, 12), 'Before, one speckled worm', font=font(16, True), fill=FG[theme])
    d.text((a.width + pad * 2, 12), 'After, three brushes', font=font(16, True), fill=FG[theme])
    d.text((a.width + pad * 2, 34), 'top to bottom: Oil paint, Bristle brush, Dry brush', font=font(11), fill=FG[theme])
    im.paste(a, (pad, head))
    im.paste(b, (a.width + pad * 2, head))
    im.save(f'{out}/three-{theme}.png')
    print('wrote', f'{out}/three-{theme}.png', im.size)
