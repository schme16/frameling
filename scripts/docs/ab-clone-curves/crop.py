#!/usr/bin/env python3
"""Crops the raw captures of scripts/docs/ab-clone-curves tight, puts each before beside its after with a one-line caption, and copies the clips.

  python3 scripts/docs/ab-clone-curves/crop.py <raw dir> <raw dir for the blur pictures, if different> brand/ab/clone-curves

The raw dir is what `help-media.cjs --entries scripts/docs/ab-clone-curves --out <dir>` wrote.
"""
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

raw, blur_raw, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)

# The picture sits at (97, 88) in a 640 wide capture, 128 art pixels across at 3.49 px each. Boxes are in capture pixels.
ITEMS = [
    # name, raw dir, crop box, scale, what A is, what B is, caption
    ('clone', raw, (116, 100, 350, 268), 2, 'Before: dust and a hair', 'After: cloned out with the stamp', 'The clone stamp copies clean sky over the dust and the hair, and the sky and its gradient carry on unbroken.'),
    ('curves', raw, (97, 88, 544, 535), 1, 'Before: flat and washed out', 'After: an S bent through Curves', 'Four points on the curve bring the colour and depth back to a washed out picture, in one undo step.'),
    ('blur', blur_raw, (132, 116, 524, 404), 1, 'Before: every edge hard', 'After: the left half softened with the blur brush', 'The blur brush went down the bars and round the left half of the ring. The first bar\'s left edge and the ring\'s right half were left alone, so a soft edge and a hard one sit side by side.'),
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
for name, src, box, scale, a_label, b_label, caption in ITEMS:
    for theme in ('dark', 'light'):
        crops = []
        for phase in ('before', 'after'):
            im = Image.open(src / f'{name}-{phase}-{theme}.png').convert('RGB').crop(box)
            if scale != 1:
                im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
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

# The clips, as they came (H.264, yuv420p, even sizes) with their first frames.
for clip in ('clone-clip', 'curves-clip', 'blur-clip'):
    src = blur_raw if clip == 'blur-clip' else raw
    for theme in ('dark', 'light'):
        for ext in ('.mp4', '-poster.png'):
            f = src / f'{clip}-{theme}{ext}'
            if f.exists():
                shutil.copy(f, out / f.name)
captions.append('clone-clip: the clone stamp at work: Alt-click chooses the spot (the cross), then the dashed ring shows where the copy is coming from as the brush moves.')
captions.append('curves-clip: the Curves dialog: four points go on the curve, the live copy comes back to life, Apply puts it on the layer.')
captions.append('blur-clip: the blur brush softens the bars and the ring, then the sharpen brush brings the snap back to some of the edges.')
(out / 'captions.txt').write_text('\n'.join(captions) + '\n')
print('\n'.join(sorted(p.name for p in out.iterdir())))
