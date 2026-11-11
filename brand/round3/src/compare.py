import subprocess, os
from PIL import Image, ImageDraw, ImageFont
OUT = '/mnt/109313D2109313D2/projects/frameling/brand/round3/'
TMP = '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/cmp/'
os.makedirs(TMP, exist_ok=True)
def rs(svg, w, name):
    p = TMP + name + '.png'
    subprocess.run(['rsvg-convert', '-w', str(w), OUT + svg, '-o', p], check=True)
    return Image.open(p).convert('RGBA')
C = [('r3-1', 'Rollo', 'armadillo whose shell bands are frames: a sun rises across the windows, last cell still empty'),
     ('r3-2', 'Foxtrot', 'fox mid-leap, tail is a film strip with a ball bouncing across its frames'),
     ('r3-3', 'Quill', 'hedgehog whose quills are coloured pencils, one pencil short of a full set'),
     ('r3-4', 'Flit', 'moth: one wing smooth vector, the other dissolving into pixels, frames trailing'),
     ('r3-5', 'Tuck', 'hermit crab carrying a picture frame as its shell, pencil in claw')]
PAPER, INK, DARK, LIGHT = (255,250,240), (29,27,38), (23,21,31), (243,238,230)
CW, GAP = 380, 14
W = CW * 5 + GAP * 6
H = 100 + 380 + 150 + 280 + 150 + 150 + 20
im = Image.new('RGB', (W, H), PAPER)
d = ImageDraw.Draw(im)
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
fl = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
def wrap(t, f, w):
    words, lines, cur = t.split(), [], ''
    for wd in words:
        if d.textlength((cur + ' ' + wd).strip(), font=f) > w: lines.append(cur); cur = wd
        else: cur = (cur + ' ' + wd).strip()
    return lines + [cur]
rowlab = {}
for i, (k, name, idea) in enumerate(C):
    x = GAP + i * (CW + GAP)
    d.text((x, 12), f'{i+1}. {name}', font=fb, fill=INK)
    for j, ln in enumerate(wrap(idea, fs, CW)[:3]):
        d.text((x, 44 + j * 16), ln, font=fs, fill=INK)
    y = 100
    d.rounded_rectangle((x, y, x + CW, y + 380), 16, fill=LIGHT)
    m = rs(k + '.svg', 360, k + 'm')
    im.paste(m, (x + 10, y + 10), m)
    y += 392
    d.rounded_rectangle((x, y, x + CW, y + 140), 12, fill=LIGHT)
    p = rs(k + '-poses.svg', CW - 8, k + 'p')
    im.paste(p, (x + 4, y + (140 - p.height) // 2), p)
    y += 152
    d.rounded_rectangle((x, y, x + CW, y + 276), 12, fill=LIGHT)
    px = rs(k + '-pixel.svg', 256, k + 'px')
    im.paste(px, (x + 62, y + 10), px)
    y += 288
    for bg, lab in ((DARK, 'dark'), (LIGHT, 'light')):
        d.rounded_rectangle((x, y, x + CW, y + 140), 12, fill=bg)
        xx = x + 14
        for s, src in ((128, 'icon'), (64, 'icon'), (32, 'icon16'), (16, 'icon16')):
            ic = rs(f'{k}-{src}.svg', s, f'{k}-{src}-{s}')
            im.paste(ic, (xx, y + (140 - s) // 2), ic)
            d.text((xx, y + 126), str(s), font=fl, fill=(150,150,160) if bg == DARK else (90,90,100))
            xx += s + 22 + (8 if s == 128 else 0)
        y += 152
im.save(OUT + 'compare.png')
print(im.size)
