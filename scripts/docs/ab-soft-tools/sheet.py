# Names the shots into brand/ab/soft-tools/ and joins them into one labelled sheet per theme.
#   python3 scripts/docs/ab-soft-tools/sheet.py <dir of before shots> <dir of after shots> brand/ab/soft-tools
import os
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f = lambda n, b=False: ImageFont.truetype(BOLD if b else FONT, n)
BG = {'dark': (22, 20, 31), 'light': (251, 246, 234)}
FG = {'dark': (240, 236, 250), 'light': (40, 34, 52)}
DIM = {'dark': (170, 164, 190), 'light': (110, 100, 130)}

def wrap(d, text, font, width):
    lines, cur = [], ''
    for w in text.split():
        t = f'{cur} {w}'.strip()
        if d.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]

for theme in ('dark', 'light'):
    L = lambda d, n: Image.open(f'{d}/{n}-{theme}.png').convert('RGB')
    shots = {
        'before-rail-pixel': L(before, 'before-rail-pixel'), 'before-rail-vector': L(before, 'before-rail-vector'), 'before-menu': L(before, 'before-menu'),
        'after-rail-pixel': L(after, 'after-rail-pixel'), 'after-rail-vector': L(after, 'after-rail-vector'), 'after-menu': L(after, 'after-menu'),
        'after-pullout-pixel': L(after, 'after-pullout-pixel'), 'after-pullout-vector': L(after, 'after-pullout-vector'),
        'after-retouch-vector': L(after, 'after-retouch-vector'), 'after-pullout-narrow': L(after, 'after-pullout-narrow'),
    }
    for k, im in shots.items():
        im.save(f'{out}/{k}-{theme}.png')
    bg, fg, dim = BG[theme], FG[theme], DIM[theme]
    # The sheet: before on the left, after on the right, the pull-outs under the after.
    rows = [
        ('Pixel layer: the rail', 'Before: the soft tools sit in Colour, 7 buttons from Brush. After: they are behind the Brush, Eraser and Retouch buttons.', [('Before', shots['before-rail-pixel']), ('After', shots['after-rail-pixel'])]),
        ('Vector layer: the rail', 'Before: Colour shows 2 tools and the rest are hidden. After: the same buttons, and the pixel tools stay in their pull-outs, greyed.', [('Before', shots['before-rail-vector']), ('After', shots['after-rail-vector'])]),
        ('Pull-out, pixel layer', 'Press and hold the Brush button: each tool with its key.', [('After: Brush button held', shots['after-pullout-pixel'])]),
        ('Pull-out, vector layer', 'The Brush works here; the soft brushes are greyed with the reason. Retouch is all greyed.', [('After: Brush button held', shots['after-pullout-vector']), ('After: Retouch button held', shots['after-retouch-vector'])]),
        ('The menu', 'Before: a Soft paint menu on the bar. After: Tools > Soft paint, with the settings beside it.', [('Before: the Soft paint menu', shots['before-menu'].crop((150, 0, 1300, 520))), ('After: Tools > Soft paint', shots['after-menu'].crop((150, 0, 1300, 520)))]),
        ('Folded rail', 'One per group, a narrow window: the Draw button holds the same tools.', [('After: One per group, narrow window', shots['after-pullout-narrow'])]),
    ]
    W = 2600
    LABEL = 230
    heights = [max(im.height for _, im in r[2]) + 26 for r in rows]
    H = 90 + sum(h + 30 for h in heights)
    sheet = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(sheet)
    d.text((16, 16), f'Soft paint as tools, before and after ({theme} theme)', font=f(30, True), fill=fg)
    y = 80
    for (title, sub, ims), h in zip(rows, heights):
        d.line((16, y - 8, W - 16, y - 8), fill=dim, width=1)
        t = wrap(d, title, f(19, True), LABEL - 24)
        for k, ln in enumerate(t):
            d.text((16, y + k * 25), ln, font=f(19, True), fill=fg)
        for k, ln in enumerate(wrap(d, sub, f(13), LABEL - 24)):
            d.text((16, y + len(t) * 25 + 8 + k * 18), ln, font=f(13), fill=dim)
        x = LABEL
        for cap, im in ims:
            d.text((x, y), cap, font=f(15, True), fill=(255, 207, 74) if theme == 'dark' else (150, 90, 0))
            sheet.paste(im, (x, y + 24))
            x += max(im.width, 150) + 20
        y += h + 30
    sheet.save(f'{out}/compare-{theme}.png')
    print(sheet.size)
