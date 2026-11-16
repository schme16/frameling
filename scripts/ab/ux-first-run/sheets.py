# Crops and captions the before/after shots of the stream first-run change into brand/ab/ux-first-run/.
#   python3 scripts/ab/ux-first-run/sheets.py <shots dir holding before-<theme>/ and after-<theme>/> brand/ab/ux-first-run
# The shots come from scripts/docs/record.cjs with steps-before.json on a build of development and steps-after.json on this branch
# (SHOT_W=1400 SHOT_H=1700, in xvfb). After is what a person sees once they have answered "no" to "Do you stream?".
import os
import sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(FONT, 17)

PAIRS = {
    # name: (file, crop box, before caption, after caption)
    'features': ('features.png', (0, 0, 922, 1522), 'Now: Features runs the nine streaming tools on as nine switches, and more rows follow below', 'After answering no: one Streaming tools switch, off, with the nine folded under it'),
    'view': ('view.png', (225, 35, 625, 1310), 'Now: View has Audience features (a long submenu) between Look and sound and Features', 'After answering no: no Audience features; Features is still there to bring it back'),
}


def wrap(d, text, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = f'{cur} {w}'.strip()
        if d.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


for theme in ('dark', 'light'):
    for name, (file, box, a, b) in PAIRS.items():
        ia = Image.open(f'{src}/before-{theme}/{file}').convert('RGB').crop(box)
        ib = Image.open(f'{src}/after-{theme}/{file}').convert('RGB').crop(box)
        if name == 'features':
            # After is shorter: trim its empty tail so the pair reads at the same scale without a blank slab.
            ib = ib.crop((0, 0, ib.width, 1150))
        pad = 24
        probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        cap = max(len(wrap(probe, t, ia.width)) for t in (a, b)) * 24 + 16
        w = ia.width + ib.width + pad * 3
        h = max(ia.height, ib.height) + cap + pad * 2
        sheet = Image.new('RGB', (w, h), BG[theme])
        d = ImageDraw.Draw(sheet)
        for i, (img, text) in enumerate(((ia, a), (ib, b))):
            x = pad + i * (ia.width + pad)
            sheet.paste(img, (x, pad + cap))
            for n, line in enumerate(wrap(d, text, img.width)):
                d.text((x, pad + 4 + n * 24), line, fill=FG[theme], font=font)
        sheet.save(f'{out}/{name}-{theme}.png')
        print(f'{out}/{name}-{theme}.png', sheet.size)
