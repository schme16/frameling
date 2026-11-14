# Puts before/after pairs from scripts/ab/reports.cjs side by side with a caption each: A on the left, B on the right.
#   python3 scripts/ab/side-by-side.py brand/ab/reports
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
CAPTIONS = {
    'panel': ('Before: the contact box looks like any other field', 'After: the contact is a saved detail, with Change and Forget it'),
    'preview': ('Before: the report to read, nothing about the computer', 'After: the processor, memory and graphics card shown plainly first, Send waits until read'),
    'sent': ('Before: just after a send, nothing says it went and the email is still there', 'After: just after a send, it says so, the note is cleared and the saved contact is labelled'),
}
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except OSError:
    font = ImageFont.load_default()

for theme in ('dark', 'light'):
    for state, (a, b) in CAPTIONS.items():
        ia = Image.open(f'{out}/before-{theme}-{state}.png').convert('RGB')
        ib = Image.open(f'{out}/after-{theme}-{state}.png').convert('RGB')
        pad, cap = 24, 56
        w = ia.width + ib.width + pad * 3
        h = max(ia.height, ib.height) + cap + pad * 2
        sheet = Image.new('RGB', (w, h), BG[theme])
        d = ImageDraw.Draw(sheet)
        for i, (img, text) in enumerate(((ia, a), (ib, b))):
            x = pad + i * (ia.width + pad)
            # wrap the caption to the picture's width
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
                d.text((x, pad + j * 20), l, fill=FG[theme], font=font)
            sheet.paste(img, (x, pad + cap))
        sheet.save(f'{out}/ab-{state}-{theme}.png')
        print('wrote', f'{out}/ab-{state}-{theme}.png')
