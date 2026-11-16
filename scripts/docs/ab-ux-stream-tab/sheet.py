# Puts the ux-stream-tab shots side by side with a caption each, in both themes.
#   python3 scripts/docs/ab-ux-stream-tab/sheet.py <before raw> <after raw> brand/ab/ux-stream-tab
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)

SHEETS = {
    'tab': [
        (before, 'tab-before', 'A: now. Streaming is a group inside Preferences > Features, with the Stream-safe and OBS rows over on General.'),
        (after, 'tab-after', 'B: a Streaming tab of its own. The switch for the streaming tools, the nine tools folded under it, and the sharing settings below.'),
        (after, 'tab-tucked', 'C: the same tab with the streaming tools tucked away. It says so, the switch is still the way back, and the sharing settings stay.'),
    ],
    'menu-bar': [
        (before, 'menu-before', 'A: now, with the streaming tools tucked away. The Streaming menu is still on the bar, holding seven entries.'),
        (after, 'view-tucked', 'B: the Streaming menu is gone from the bar. Stream-safe, OBS and the capture view are in View > Sharing your screen.'),
    ],
    'bar': [
        (before, 'bar-tucked', 'A: now, tucked away. Streaming is still on the bar.'),
        (after, 'bar-tucked', 'B: tucked away. Streaming is gone from the bar.'),
        (after, 'bar-on', 'For reference: streaming tools on, and Streaming is on the bar.'),
    ],
}


def wrap(d, text, width):
    lines, line = [], ''
    for word in text.split():
        t = (line + ' ' + word).strip()
        if d.textlength(t, font=font) > width and line:
            lines.append(line)
            line = word
        else:
            line = t
    lines.append(line)
    return lines


for theme in ('dark', 'light'):
    for name, items in SHEETS.items():
        stacked = name == 'bar'
        imgs = [(Image.open(f'{d}/{n}-{theme}.png').convert('RGB'), t) for d, n, t in items]
        pad = 24
        probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
        if stacked:
            w = max(i.width for i, _ in imgs) + pad * 2
            blocks = [(i, wrap(probe, t, w - pad * 2)) for i, t in imgs]
            h = sum(i.height + 14 + len(l) * 22 + pad for i, l in blocks) + pad
            sheet = Image.new('RGB', (w, h), BG[theme])
            d = ImageDraw.Draw(sheet)
            y = pad
            for img, lines in blocks:
                for j, l in enumerate(lines):
                    d.text((pad, y + j * 22), l, fill=FG[theme], font=font)
                y += len(lines) * 22 + 6
                sheet.paste(img, (pad, y))
                y += img.height + pad
        else:
            blocks = [(i, wrap(probe, t, i.width)) for i, t in imgs]
            w = sum(i.width for i, _ in blocks) + pad * (len(blocks) + 1)
            h = max(i.height for i, _ in blocks) + max(len(l) for _, l in blocks) * 22 + 20 + pad * 2
            sheet = Image.new('RGB', (w, h), BG[theme])
            d = ImageDraw.Draw(sheet)
            x = pad
            for img, lines in blocks:
                sheet.paste(img, (x, pad))
                for j, l in enumerate(lines):
                    d.text((x, pad + img.height + 12 + j * 22), l, fill=FG[theme], font=font)
                x += img.width + pad
        sheet.save(f'{out}/{name}-{theme}.png')
        print('wrote', f'{out}/{name}-{theme}.png')
