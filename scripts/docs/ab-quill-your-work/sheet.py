# Puts the room shots side by side with a caption each: an empty room, then your work in it, then Stream-safe on.
#   python3 scripts/docs/ab-quill-your-work/sheet.py <raw dir> brand/ab/quill-house-your-work
import sys
from PIL import Image, ImageDraw, ImageFont

raw, out = sys.argv[1], sys.argv[2]
CAPTIONS = [
    ('a-empty', 'A: nothing made yet, so the room is simply his'),
    ('b-yours', 'B: your drawing on his wall, your sprite on his floor'),
    ('c-stream-safe', 'C: Stream-safe on, so names and pictures are hidden'),
]
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
SCALE = 2

for theme in ('dark', 'light'):
    imgs = [(Image.open(f'{raw}/{name}-{theme}.png').convert('RGB'), text) for name, text in CAPTIONS]
    imgs = [(i.resize((i.width * SCALE, i.height * SCALE), Image.NEAREST), t) for i, t in imgs]
    pad, cap = 24, 64
    w = sum(i.width for i, _ in imgs) + pad * (len(imgs) + 1)
    h = max(i.height for i, _ in imgs) + cap + pad * 2
    sheet = Image.new('RGB', (w, h), BG[theme])
    d = ImageDraw.Draw(sheet)
    x = pad
    for img, text in imgs:
        sheet.paste(img, (x, pad))
        words, line, lines = text.split(), '', []
        for word in words:
            t = (line + ' ' + word).strip()
            if d.textlength(t, font=font) > img.width:
                lines.append(line)
                line = word
            else:
                line = t
        lines.append(line)
        for j, l in enumerate(lines):
            d.text((x, pad + img.height + 10 + j * 20), l, fill=FG[theme], font=font)
        x += img.width + pad
    sheet.save(f'{out}/room-{theme}.png')
    print('wrote', f'{out}/room-{theme}.png')
