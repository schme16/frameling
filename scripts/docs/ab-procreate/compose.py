# Lays Procreate's own thumbnail beside the same stroke drawn with Frameling, one picture per brush and theme, captioned.
#   python3 compose.py <panels dir> <out dir>
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1:3]
layout = json.load(open(os.path.join(src, 'layout.json')))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAD, HEAD, FOOT = 16, 34, 6
TITLES = {
    'Sequins': 'Sequins (CC0, versluis.com)',
    'Plain_Stitch': 'Plain Stitch (CC0, versluis.com)',
    'Seed': 'Seed (MIT, CSP2PC)',
}
PANELS = [
    ('thumb', "Procreate's own picture of the stroke"),
    ('first', 'First guess: spacing and scatter used as the file gives them'),
    ('ours', 'Frameling now: counted in the part of the tip you can see'),
]
NOTES = {
    'Sequins': 'Scatter matches. The thumbnail is half as bright as the tip: nothing in the file explains it, so it is not copied.',
    'Plain_Stitch': 'The stitches turn along the line and sit the right distance apart only with the new spacing. The old one runs them into a line.',
    'Seed': 'The press fades the stroke in and out in both. Frameling thins the paint per dab, so on this close-set brush the fade is shorter.',
}
os.makedirs(out, exist_ok=True)


def wrap(d, text, font, width):
    lines, line = [], ''
    for wd in text.split(' '):
        if d.textlength((line + ' ' + wd).strip(), font=font) > width and line:
            lines.append(line)
            line = wd
        else:
            line = (line + ' ' + wd).strip()
    lines.append(line)
    return lines


def inked(im, bg):
    # The box round everything that is not paper.
    px = im.load()
    w, h = im.size
    pts = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2) if sum(abs(px[x, y][k] - bg[k]) for k in range(3)) > 24]
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))


for name, info in layout.items():
    for theme in ('dark', 'light'):
        dark = theme == 'dark'
        bg = (30, 29, 36) if dark else (250, 246, 238)
        fg = (239, 233, 218) if dark else (29, 28, 33)
        mute = (170, 165, 155) if dark else (95, 90, 80)
        edge = (70, 68, 78) if dark else (210, 204, 190)
        ims = [Image.open(os.path.join(src, f'{name}-{theme}-{p}.png')).convert('RGB') for p, _ in PANELS]
        boxes = [inked(im, bg) for im in ims]
        m = 24
        box = (max(0, min(b[0] for b in boxes) - m), max(0, min(b[1] for b in boxes) - m), min(ims[0].width, max(b[2] for b in boxes) + m), min(ims[0].height, max(b[3] for b in boxes) + m))
        ims = [im.crop(box) for im in ims]
        w, h = ims[0].size
        across = w < 600
        f, fb = ImageFont.truetype(FONT, 14), ImageFont.truetype(BOLD, 16)
        cols = len(ims) if across else 1
        pw = w
        total_w = PAD + cols * (pw + PAD)
        d0 = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        label_lines = max(len(wrap(d0, l, f, pw)) for _, l in PANELS)
        head = 12 + label_lines * 18
        rows = 1 if across else len(ims)
        foot_lines = wrap(d0, f"Size is measured off this same picture: it arrives at {info['measured']} px, where one dab was read off by hand at {info['dab']} px. Spacing {round(info['imported']['spacing'] * 100)}% and scatter {round(info['imported']['scatter'] * 100)}% of the visible tip. " + NOTES[name], f, total_w - 2 * PAD)
        canvas = Image.new('RGB', (total_w, 44 + rows * (head + h + PAD) + 12 + len(foot_lines) * 18 + PAD), bg)
        d = ImageDraw.Draw(canvas)
        d.text((PAD, 12), TITLES[name], font=fb, fill=fg)
        for i, ((p, label), im) in enumerate(zip(PANELS, ims)):
            x = PAD + (i * (pw + PAD) if across else 0)
            y = 44 + (0 if across else i * (head + h + PAD))
            for k, ln in enumerate(wrap(d, label, f, pw)):
                d.text((x, y + 6 + k * 18), ln, font=f, fill=mute)
            canvas.paste(im, (x, y + head))
            d.rectangle((x - 1, y + head - 1, x + w, y + head + h), outline=edge)
        y = 44 + rows * (head + h + PAD) + 4
        for k, ln in enumerate(foot_lines):
            d.text((PAD, y + k * 18), ln, font=f, fill=mute)
        canvas.save(os.path.join(out, f'{name}-{theme}.png'))
