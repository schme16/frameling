# Lays the Tool options pictures from panel-shots.cjs side by side: before and after, vector and pixel, both themes.
# Usage: python3 sheets-panel.py <beforeDir> <afterDir> <outDir>
import sys
from PIL import Image, ImageDraw, ImageFont
before, after, out = sys.argv[1:4]
F = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
FB = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
font, bold = ImageFont.truetype(F, 15), ImageFont.truetype(FB, 18)

def trim(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    bg = im.getpixel((6, h - 60)); last = 0
    for y in range(h - 30, -1, -1):
        if any(im.getpixel((x, y)) != bg for x in range(4, w - 4, 2)): last = y; break
    return im.crop((0, 0, w, last + 24)), bg

def sheet(theme, cols, title, name):
    ims = [(trim(p)[0], cap) for p, cap in cols]
    bg = trim(cols[0][0])[1]
    dark = sum(bg) / 3 < 128
    fg = (235, 230, 220) if dark else (40, 36, 30)
    bgs = (18, 17, 26) if dark else (238, 232, 220)
    pad, head, capH = 24, 70, 50
    W = sum(i.size[0] for i, _ in ims) + pad * (len(ims) + 1)
    H = head + capH + max(i.size[1] for i, _ in ims) + pad
    sh = Image.new('RGB', (W, H), bgs); d = ImageDraw.Draw(sh)
    d.text((pad, 16), title, font=bold, fill=fg)
    x = pad
    for im, cap in ims:
        for k, l in enumerate(cap.split('\n')): d.text((x, head - 6 + k * 20), l, font=bold if k == 0 else font, fill=fg)
        sh.paste(im, (x, head + capH)); x += im.size[0] + pad
    sh.save(f'{out}/{name}-{theme}.png'); print(name, theme, sh.size)

for th in ('dark', 'light'):
    sheet(th, [(f'{before}/ps-vector-{th}.png', 'Before: Vector Brush\non a vector layer'), (f'{before}/ps-pixel-{th}.png', 'Before: Pixel brush\non a pixel layer'),
               (f'{after}/ps-vector-{th}.png', 'After: Vector Brush\non a vector layer'), (f'{after}/ps-pixel-{th}.png', 'After: Pixel brush\non a pixel layer')],
          f'The Brush options, before and after the shared panel, every fold open ({th} theme). Same app, same moment: only the layer changes.', 'panels')
    sheet(th, [(f'{before}/ps-soft-{th}.png', 'Before: Soft paint'), (f'{before}/ps-dry-{th}.png', 'Before: Chalk and charcoal'),
               (f'{after}/ps-soft-{th}.png', 'After: Soft paint'), (f'{after}/ps-dry-{th}.png', 'After: Chalk and charcoal')],
          f'Soft paint and Chalk and charcoal, before and after the shared panel, every fold open ({th} theme).', 'soft-and-chalk')
