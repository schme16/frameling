# Puts the menu-bar look side by side with a caption each, in both themes.
#   python3 scripts/docs/ab-menu-bar/sheet.py <before raw> <after raw> brand/ab/menu-bar
# The raw shots come from scripts/docs/ab/menus.cjs, run once against the old build (MENU_TITLES of the four old menus that
# changed: Tools and layers, Pixel tools, Frames and motion, Skeleton, effects and more) and once against the new one
# (Tools, Layers and artboards, Animation, Rigging, Effects).
import sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
BG = {'dark': (20, 18, 28), 'light': (255, 250, 242)}
FG = {'dark': (235, 232, 245), 'light': (40, 34, 30)}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)

SHEETS = {
    'bar': [
        (before, 'bar1280', 'A: the whole bar at 1280 px wide, as it was. Nine menus.'),
        (after, 'bar1280', 'B: the same bar now. Ten menus, with more of them and fewer things in each. It still fits at 1280 px.'),
    ],
    'tools': [
        (before, 'menu-1', 'A: Tools and layers, where the tools and the layers were together.'),
        (before, 'menu-2', 'A: Pixel tools, the menu that is gone. Its things are now in Tools, Layers and artboards, Animation and View.'),
        (after, 'menu-1', 'B: Tools. The pixel tools, palette, soft paint and settings are inside it; the layers left.'),
    ],
    'layers': [
        (before, 'menu-1', 'A: Tools and layers, with the layer commands at the bottom.'),
        (after, 'menu-2', 'B: Layers and artboards, a menu of its own. Artboards and the sprite boards and shared layers came in.'),
    ],
    'animation': [
        (before, 'menu-3', 'A: Frames and motion.'),
        (after, 'menu-3', 'B: Animation. The same list under a new name; Make it move, from the old Pixel tools, is in More frame tools.'),
    ],
    'rigging-effects': [
        (before, 'menu-4', 'A: Skeleton, effects and more, four submenus.'),
        (after, 'menu-4', 'B: Rigging. The skeleton is listed straight in it, with Tiles as its one submenu for now.'),
        (after, 'menu-5', 'B: Effects, a menu of its own.'),
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
            blocks = [(i, wrap(probe, t + f' ({i.height} px tall.)', cw)) for (i, t), cw in zip(imgs, widths)]
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
