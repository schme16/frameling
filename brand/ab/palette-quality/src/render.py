"""Draws the before/after pictures from picks.json (made by run.ts) and the source picture.
Usage: python3 render.py <source.png> <picks.json> <out dir>"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src_path, picks_path, out_dir = sys.argv[1:4]
picks = json.load(open(picks_path))
src = Image.open(src_path).convert('RGBA')
bg = Image.new('RGBA', src.size, (255, 255, 255, 255))
src = Image.alpha_composite(bg, src).convert('RGB')
SCALE = 2
W, H = src.width * SCALE, src.height * SCALE
FONT = '/usr/share/fonts/truetype/noto/NotoSans-%s.ttf'
f_title, f_head, f_body, f_small = (ImageFont.truetype(FONT % 'Bold', 30), ImageFont.truetype(FONT % 'SemiBold', 22),
                                    ImageFont.truetype(FONT % 'Regular', 19), ImageFont.truetype(FONT % 'Regular', 16))
THEMES = {
    'dark': dict(bg=(37, 34, 49), panel=(56, 51, 77), text=(240, 237, 248), dim=(176, 170, 196), good=(130, 220, 160), warn=(240, 170, 140)),
    'light': dict(bg=(242, 238, 236), panel=(255, 255, 255), text=(40, 36, 52), dim=(98, 92, 112), good=(20, 120, 60), warn=(170, 70, 40)),
}

def remap(colours):
    pal = np.array([[(k >> 16) & 255, (k >> 8) & 255, k & 255] for k in colours], dtype=np.int32)
    a = np.asarray(src, dtype=np.int32).reshape(-1, 3)
    d = ((a[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    out = pal[d.argmin(axis=1)].astype(np.uint8).reshape(src.height, src.width, 3)
    return Image.fromarray(out).resize((W, H), Image.NEAREST)

def swatches(d, colours, x, y, w, h):
    n = len(colours)
    for i, k in enumerate(colours):
        d.rectangle([x + i * w // n, y, x + (i + 1) * w // n - 1, y + h - 1], fill=((k >> 16) & 255, (k >> 8) & 255, k & 255))

PAD, GAP, STRIP, HEAD = 40, 40, 44, 34
for theme, c in THEMES.items():
    for limit, r in picks.items():
        block = HEAD + STRIP + 10 + H
        total_w = PAD * 2 + W * 2 + GAP
        total_h = PAD + 44 + 20 + HEAD + 2 * block + 28 + PAD
        im = Image.new('RGB', (total_w, total_h), c['bg'])
        d = ImageDraw.Draw(im)
        d.text((PAD, PAD), f'Taking colours from a picture, at most {limit} colours', font=f_title, fill=c['text'])
        top = PAD + 44 + 20
        # source, beside the two strips
        d.text((PAD, top), 'The picture', font=f_head, fill=c['text'])
        im.paste(src.resize((W, H), Image.LANCZOS), (PAD, top + HEAD))
        d.text((PAD, top + HEAD + H + 8), f'{src.width} x {src.height}, {len(set(src.getdata()))} different colours', font=f_small, fill=c['dim'])
        x = PAD + W + GAP
        for i, (label, key, err, tone) in enumerate([('Before: the old picking', 'old', r['oldErr'], 'warn'), ('After: the new picking', 'new', r['newErr'], 'good')]):
            y = top + i * block
            d.text((x, y), label, font=f_head, fill=c['text'])
            err_text = f'average miss {err:.1f}'
            d.text((x + W - d.textlength(err_text, font=f_head), y), err_text, font=f_head, fill=c[tone])
            swatches(d, r[key], x, y + HEAD, W, STRIP)
            im.paste(remap(r[key]), (x, y + HEAD + STRIP + 10))
        d.text((x, top + 2 * block + 2), 'The picture redrawn with only those colours. A smaller miss is closer to the original.', font=f_small, fill=c['dim'])
        im.save(f'{out_dir}/palette-quality-{limit}-{theme}.png', optimize=True)
        print(f'palette-quality-{limit}-{theme}.png', im.size)
