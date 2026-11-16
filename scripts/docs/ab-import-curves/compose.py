# Puts the before and after strokes side by side, one picture per theme.
#   python3 compose.py <shots dir> <out dir>
import sys, os
from PIL import Image, ImageDraw, ImageFont

shots, out = sys.argv[1:3]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAPER = {'light': (0xf2, 0xe9, 0xd6), 'dark': (0x26, 0x25, 0x2d)}
TILE, PAD, CAP = 460, 20, 64
LABELS = [('before', 'Before: curves flattened to a line'), ('after', 'After: curves kept')]
SUB = 'Krita Basic-5 Size, pressed at 15%, 30%, 50% and full (top to bottom)'


def paper_box(im, rgb):
    px = im.load()
    w, h = im.size
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if all(abs(px[x, y][k] - rgb[k]) <= 2 for k in range(3))]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts) + 2, max(p[1] for p in pts) + 2)


os.makedirs(out, exist_ok=True)
for theme in ('dark', 'light'):
    dark = theme == 'dark'
    bg = (30, 29, 36) if dark else (250, 246, 238)
    fg = (239, 233, 218) if dark else (29, 28, 33)
    mute = (170, 165, 155) if dark else (95, 90, 80)
    canvas = Image.new('RGB', (2 * TILE + 3 * PAD, TILE + CAP + 2 * PAD + 22), bg)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, PAD - 4), SUB, font=ImageFont.truetype(FONT, 13), fill=mute)
    for i, (name, label) in enumerate(LABELS):
        im = Image.open(os.path.join(shots, f'{name}-{theme}.png')).convert('RGB')
        tile = im.crop(paper_box(im, PAPER[theme])).resize((TILE, TILE), Image.NEAREST)
        x = PAD + i * (TILE + PAD)
        canvas.paste(tile, (x, PAD + 22))
        d.text((x, PAD + 22 + TILE + 10), label, font=ImageFont.truetype(BOLD, 15), fill=fg)
    canvas.save(os.path.join(out, f'basic5-size-{theme}.png'))
