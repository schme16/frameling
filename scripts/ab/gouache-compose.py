#!/usr/bin/env python3
"""Lays Gouache's real canvas strokes out for the board look. Usage: gouache-compose.py <before dir> <after dir> <out dir>
Reads strokes-<theme>.png and cover-<theme>.png from scripts/docs/ab-gouache (run on the old build and the new one); writes
strokes-<theme>.png (before beside after, labelled) and cover-<theme>.png (Marker over scribbles beside Gouache over the same)."""
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1], sys.argv[2], sys.argv[3]
BG = {'dark': (14, 14, 20), 'light': (250, 248, 243)}
FG = {'dark': (235, 232, 225), 'light': (30, 30, 36)}


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


def sheet(theme, panels, title, lines, path):
    pad, head, foot = 24, 64, 30 * len(lines)
    h = max(p.height for _, p in panels)
    W = sum(p.width for _, p in panels) + pad * (len(panels) + 1)
    im = Image.new('RGB', (W, h + head + foot + pad * 2), BG[theme])
    d = ImageDraw.Draw(im)
    d.text((pad, 16), title, font=font(18, True), fill=FG[theme])
    x = pad
    for label, p in panels:
        d.text((x, head - 22), label, font=font(14, True), fill=FG[theme])
        im.paste(p, (x, head))
        x += p.width + pad
    for i, text in enumerate(lines):
        d.text((pad, head + h + pad // 2 + i * 22), text, font=font(13), fill=FG[theme])
    im.save(path)
    print('wrote', path, im.size)


for theme in ('dark', 'light'):
    b = paper(Image.open(f'{before}/strokes-{theme}.png').convert('RGB'))
    a = paper(Image.open(f'{after}/strokes-{theme}.png').convert('RGB'))
    sheet(theme, [('Before', b), ('After', a)], 'Gouache beside Marker and Block marker',
          ['Top to bottom in each: Marker, Block marker, Gouache. Before, all three were the same flat stroke.',
           'After, Gouache is matte and chalky with a faint velvety grain, a little paler than it went on.'], f'{out}/strokes-{theme}.png')
    c = paper(Image.open(f'{after}/cover-{theme}.png').convert('RGB'))
    sheet(theme, [('Marker, then Gouache, over the same scribbles', c)], 'Gouache covers what is underneath',
          ['Top row Marker, bottom row Gouache, over the same fine lines.', 'Both hide them completely; Gouache does it flat and matte.'], f'{out}/cover-{theme}.png')
