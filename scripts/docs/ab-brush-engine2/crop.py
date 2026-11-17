#!/usr/bin/env python3
"""Crops the raw captures of scripts/docs/ab-brush-engine2 tight, puts each before beside its after with a one-line caption, and copies the clips.

  python3 scripts/docs/ab-brush-engine2/crop.py <raw dir> <raw dir for the older build's wet pictures> brand/ab/brush-engine2

The raw dir is what `help-media.cjs --entries scripts/docs/ab-brush-engine2 --out <dir>` wrote.
"""
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

raw, old_raw, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)

# The sprite sits at (110, 101) to (530, 521) in a 640 wide capture. Boxes are in capture pixels.
BOX = (98, 90, 542, 532)
ITEMS = [
    # name, before's raw folder, before's file name, after's file name, what A is, what B is, caption
    ('curves', raw, 'curves-before', 'curves-after', 'Before: every row follows the pen in a straight line', 'After: even, light touch, firm hand, then a shape of my own',
     'The same press, light to hard, on every row. A light touch reaches a full mark sooner, a firm hand holds back, and the last row is a curve dragged by hand.'),
    ('blend', raw, 'blend-before', 'blend-after', 'Before: every stroke paints over what is there', 'After: paint over, multiply, screen, overlay, colour only',
     'The same pink across the same four blocks. Multiply shades, screen lights, overlay adds contrast and colour only tints, where before every stroke just covered what was there.'),
    ('wet', old_raw, 'wet-loop', 'wet-loop', 'Before: a loop over its own line stays red', 'After: it picks up the blue it crosses and carries it on',
     'A stroke that starts blue and runs out into red, then loops back across its own early line. Before, the wet brush only felt the page, so it stayed red. Now it feels its own paint too.'),
]

def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()

def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]

captions = []
for name, before_dir, before_name, after_name, a_label, b_label, caption in ITEMS:
    for theme in ('dark', 'light'):
        crops = []
        for phase, d_, n in (('before', before_dir, before_name), ('after', raw, after_name)):
            im = Image.open(d_ / f'{n}-{theme}.png').convert('RGB').crop(BOX)
            im.save(out / f'{name}-{phase}-{theme}.png')
            crops.append(im)
        bg = (18, 18, 26) if theme == 'dark' else (240, 233, 220)
        fg = (236, 232, 244) if theme == 'dark' else (38, 36, 48)
        w, h = crops[0].size
        gap, pad, strip = 16, 16, 34
        f, fs = font(15), font(13)
        probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        lines = wrap(probe, caption, fs, 2 * w + gap)
        total_h = pad + h + strip + len(lines) * 18 + pad
        sheet = Image.new('RGB', (2 * w + gap + 2 * pad, total_h), bg)
        d = ImageDraw.Draw(sheet)
        for i, (im, label) in enumerate(zip(crops, (a_label, b_label))):
            x = pad + i * (w + gap)
            sheet.paste(im, (x, pad))
            d.text((x, pad + h + 8), label, font=f, fill=fg)
        for k, line in enumerate(lines):
            d.text((pad, pad + h + strip + k * 18), line, font=fs, fill=fg)
        sheet.save(out / f'{name}-{theme}-ab.png')
    captions.append(f'{name}: {caption}')

# The curve clip is the help clip, as it came (H.264, yuv420p, even sizes) with its first frame.
for theme in ('dark', 'light'):
    for ext in ('.mp4', '-poster.png'):
        f = Path('public/help') / f'pixel-brush-curves-{theme}{ext}'
        if f.exists():
            shutil.copy(f, out / f'curves-clip-{theme}{ext}')
captions.append('curves-clip: four strokes with the same press from light to hard: the pen straight, then a light touch, a firm hand, and a shape dragged by hand on the graph.')
(out / 'captions.txt').write_text('\n'.join(captions) + '\n')
print('\n'.join(sorted(p.name for p in out.iterdir())))
