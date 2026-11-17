# Builds two pictures per theme from the raw shots.
#   basic5-curves-<theme>.png   the headline: one stroke pressed from nothing to full, before and after, with the real response
#                               graphs (flow and size) under each, and where the flattened stroke's edge ran drawn over the new one
#   basic5-size-<theme>.png     the four steady presses, before and after
#   python3 compose.py <shots dir> <out dir>
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

shots, out = sys.argv[1:3]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAPER = {'light': (0xf2, 0xe9, 0xd6), 'dark': (0x26, 0x25, 0x2d)}
ACCENT = (232, 112, 30)
TILE, PAD = 460, 20
f13, f14, f15 = ImageFont.truetype(FONT, 13), ImageFont.truetype(BOLD, 14), ImageFont.truetype(BOLD, 15)


def paper_box(im, rgb):
    px = im.load()
    w, h = im.size
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if all(abs(px[x, y][k] - rgb[k]) <= 2 for k in range(3))]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts) + 2, max(p[1] for p in pts) + 2)


def sprite(name, theme, size=TILE):
    im = Image.open(os.path.join(shots, f'{name}-{theme}.png')).convert('RGB')
    return im.crop(paper_box(im, PAPER[theme])).resize((size, size), Image.NEAREST)


def edge_of(tile, theme):
    # The outline of everything painted on the sprite: painted pixels with an unpainted neighbour.
    a = np.asarray(tile).astype(int)
    paint = (np.abs(a - np.array(PAPER[theme])).sum(axis=2) > 60)
    m = Image.fromarray((paint * 255).astype('uint8')).filter(ImageFilter.MinFilter(5))
    inner = np.asarray(m) > 0
    return paint & ~inner


def theme_colours(dark):
    return ((30, 29, 36) if dark else (250, 246, 238), (239, 233, 218) if dark else (29, 28, 33), (170, 165, 155) if dark else (95, 90, 80))


os.makedirs(out, exist_ok=True)
for theme in ('dark', 'light'):
    dark = theme == 'dark'
    bg, fg, mute = theme_colours(dark)

    # ---- the headline
    GW = 200
    BAND = (0.30, 0.70)
    bh = int(TILE * (BAND[1] - BAND[0]))
    top = 54
    H = top + bh + 14 + 22 + 16 + GW + 8 + 20 + 34 + PAD
    canvas = Image.new('RGB', (2 * TILE + 3 * PAD, H), bg)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, 16), 'Krita Basic-5 Size: one stroke pressed from nothing to full, and the response curves the preset file holds', font=f14, fill=fg)
    d.text((PAD, 34), 'The curves are read from the preset file; they are not measured against Krita.', font=f13, fill=mute)
    before, after = sprite('ramp-before', theme), sprite('ramp-after', theme)
    eb = edge_of(before, theme)
    arr = np.asarray(after).copy()
    arr[eb] = ACCENT
    shown = [before, Image.fromarray(arr)]
    labels = ['Before: curves flattened to a straight line', 'After: curves kept (orange: edge of the flattened one)']
    for i in range(2):
        x = PAD + i * (TILE + PAD)
        canvas.paste(shown[i].crop((0, int(TILE * BAND[0]), TILE, int(TILE * BAND[1]))), (x, top))
        d.text((x, top + bh + 8), labels[i], font=f15, fill=fg)
        gy = top + bh + 14 + 22 + 16
        for j, (to, cap) in enumerate((('flow', 'Flow: light press to firm press'), ('size', 'Size: light press to firm press'))):
            g = Image.open(os.path.join(shots, f'graph-{"before" if i == 0 else "after"}-{to}-{theme}.png')).convert('RGB').resize((GW, GW), Image.LANCZOS)
            gx = x + j * (GW + 40) + 10
            canvas.paste(g, (gx, gy))
            d.text((gx, gy + GW + 6), cap, font=f13, fill=mute)
    canvas.save(os.path.join(out, f'basic5-curves-{theme}.png'))

    # ---- the four steady presses
    CAP = 64
    canvas = Image.new('RGB', (2 * TILE + 3 * PAD, TILE + CAP + 2 * PAD + 22), bg)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD - 4), 'Krita Basic-5 Size, pressed steadily at 15%, 30%, 50% and full (top to bottom)', font=f13, fill=mute)
    for i, (name, label) in enumerate((('presses-before', 'Before: curves flattened to a line'), ('presses-after', 'After: curves kept'))):
        x = PAD + i * (TILE + PAD)
        canvas.paste(sprite(name, theme), (x, PAD + 22))
        d.text((x, PAD + 22 + TILE + 10), label, font=f15, fill=fg)
    canvas.save(os.path.join(out, f'basic5-size-{theme}.png'))
