# Lays each look's strokes out as tiles, every one beside the name and settings of its brush, one picture per theme.
#   python3 compose.py <shots dir> <captions.json> <out dir>
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

shots, caps, out = sys.argv[1:4]
caps = json.load(open(caps))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAPER = {'light': (0xf2, 0xe9, 0xd6), 'dark': (0x26, 0x25, 0x2d)}
COLS, TILE, CAP, PAD = 3, 400, 92, 18


def paper_box(im, rgb):
    # The sprite is the block of paper colour: take the box round every pixel of it.
    px = im.load()
    w, h = im.size
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if all(abs(px[x, y][k] - rgb[k]) <= 2 for k in range(3))]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts) + 2, max(p[1] for p in pts) + 2)


def wrap(d, text, font, width):
    words, line, lines = text.split(' '), '', []
    for wd in words:
        if d.textlength((line + ' ' + wd).strip(), font=font) > width:
            lines.append(line)
            line = wd
        else:
            line = (line + ' ' + wd).strip()
    lines.append(line)
    return lines


for name, rows in caps.items():
    for theme in ('dark', 'light'):
        dark = theme == 'dark'
        bg = (30, 29, 36) if dark else (250, 246, 238)
        fg = (239, 233, 218) if dark else (29, 28, 33)
        mute = (170, 165, 155) if dark else (95, 90, 80)
        n = len(rows)
        nrows = (n + COLS - 1) // COLS
        canvas = Image.new('RGB', (COLS * (TILE + PAD) + PAD, nrows * (TILE + CAP + PAD) + PAD), bg)
        d = ImageDraw.Draw(canvas)
        f, fb = ImageFont.truetype(FONT, 13), ImageFont.truetype(BOLD, 14)
        for i, r in enumerate(rows):
            p = os.path.join(shots, f'{name}-{i}-{theme}.png')
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGB')
            box = paper_box(im, PAPER[theme])
            tile = im.crop(box).resize((TILE, TILE), Image.NEAREST)
            x = PAD + (i % COLS) * (TILE + PAD)
            y = PAD + (i // COLS) * (TILE + CAP + PAD)
            canvas.paste(tile, (x, y))
            d.text((x, y + TILE + 8), r['label'], font=fb, fill=fg)
            if 'error' in r:
                d.text((x, y + TILE + 28), r['error'][:60], font=f, fill=mute)
                continue
            lines = wrap(d, r['settings'], f, TILE)[:2]
            for k, ln in enumerate(lines):
                d.text((x, y + TILE + 28 + k * 16), ln, font=f, fill=mute)
            note = 'came in whole' if not r['left'] and not r['changed'] else f"{r['left']} left out, {r['changed']} changed"
            d.text((x, y + TILE + 28 + len(lines) * 16), note, font=f, fill=mute)
        os.makedirs(out, exist_ok=True)
        canvas.save(os.path.join(out, f'{name}-{theme}.png'))
