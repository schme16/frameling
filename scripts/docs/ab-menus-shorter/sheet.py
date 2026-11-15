# Puts the menus-shorter shots side by side with a caption each, in both themes.
#   python3 scripts/docs/ab-menus-shorter/sheet.py <before raw> <after raw> brand/ab/menus-shorter
# The raw shots come from scripts/docs/ab/menus.cjs (menu-1 is Tools and layers, menu-2 Frames and motion, menu-3 the new
# Skeleton, effects and more) and a 1280 wide bar shot, run once against the old build and once against the new one.
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)

SHEETS = {
    'draw': [
        (before, 'menu-1', 'A: Draw as it was. 38 entries, 1268 px tall: the bottom is off the screen in a 900 px window.'),
        (after, 'menu-1', 'B: Draw now. 24 entries, 826 px: it fits. Arrange, group and transform, and Shapes and colour, are one entry each.'),
        (after, 'menu-3', 'Where Effects and Tiles went, with Skeleton and Artboards: a menu of their own on the bar.'),
    ],
    'animate': [
        (before, 'menu-2', 'A: Animate as it was. 35 entries, 1146 px tall.'),
        (after, 'menu-2', 'B: Animate now. 23 entries, 786 px. Onion options, more frame tools and ready-made motion are grouped.'),
        (after, 'menu-3', 'Where Skeleton and Artboards went, with Effects and Tiles: a menu of their own on the bar.'),
    ],
    'bar': [
        (before, 'bar1280', 'A: the bar at 1280 px wide, as it was.'),
        (after, 'bar1280', 'B: the same bar with the new menu, Skeleton, effects and more. Everything still fits.'),
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


pad = 24
probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
for theme in ('dark', 'light'):
    for name, items in SHEETS.items():
        imgs = [(Image.open(f'{d}/{n}-{theme}.png').convert('RGB'), t) for d, n, t in items]
        if name == 'bar':
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
            widths = [max(i.width, 330) for i, _ in imgs]
            blocks = [(i, wrap(probe, t, cw)) for (i, t), cw in zip(imgs, widths)]
            head = max(len(l) for _, l in blocks) * 22 + 14
            w = sum(widths) + pad * (len(blocks) + 1)
            h = head + max(i.height for i, _ in blocks) + pad * 2
            sheet = Image.new('RGB', (w, h), BG[theme])
            d = ImageDraw.Draw(sheet)
            x = pad
            for (img, lines), cw in zip(blocks, widths):
                for j, l in enumerate(lines):
                    d.text((x, pad + j * 22), l, fill=FG[theme], font=font)
                sheet.paste(img, (x, pad + head))
                x += cw + pad
        sheet.save(f'{out}/{name}-{theme}.png')
        print('wrote', f'{out}/{name}-{theme}.png', sheet.size)
