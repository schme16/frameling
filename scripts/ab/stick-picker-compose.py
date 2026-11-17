#!/usr/bin/env python3
"""Lays the stick picker shots side by side with a caption over each. Usage: stick-picker-compose.py <before dir> <after dir> <out dir>
Reads the panel, panel-off, panel-narrow and panel-open shots (scripts/docs/ab-stick-picker); writes panel-, off-, narrow-
(before | after) and open- (the list dropped) for each theme."""
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


def sheet(parts, theme, path, gap=24, head=34):
    """parts: [(caption, image)] side by side on the theme's background."""
    w = sum(i.width for _, i in parts) + gap * (len(parts) + 1)
    h = max(i.height for _, i in parts) + head + gap
    im = Image.new('RGB', (w, h), BG[theme])
    d = ImageDraw.Draw(im)
    x = gap
    for cap, i in parts:
        d.text((x, 8), cap, font=font(14, True), fill=FG[theme])
        im.paste(i, (x, head))
        x += i.width + gap
    im.save(path)


for theme in ('dark', 'light'):
    def get(d, n, box=None):
        im = Image.open(f'{d}/{n}-{theme}.png').convert('RGB')
        return im.crop(box) if box else im

    top = (0, 0, 304, 760)
    sheet([('Before: word chips', get(before, 'panel', top)), ('After: Stick picker', get(after, 'panel', top))], theme, f'{out}/panel-{theme}.png')
    sheet([('Before: paper off', get(before, 'panel-off', top)), ('After: greyed, says why', get(after, 'panel-off', top))], theme, f'{out}/off-{theme}.png')
    sheet([('Before, a window of its own', get(before, 'panel-narrow')), ('After', get(after, 'panel-narrow'))], theme, f'{out}/narrow-{theme}.png')
    sheet([('After: the list dropped open', get(after, 'panel-open'))], theme, f'{out}/open-{theme}.png')
