# Lays the raw shots from scripts/docs/ab-brush-library side by side, dark above light, with a caption strip over each
# column. The pictures themselves are untouched crops of the real app; only the strips and gaps are drawn here.
#   python3 scripts/ab/brush-library-sheets.py brand/ab/brush-library
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
SHEETS = {
    'a-chips-and-drawer': ('A. Chip row with a drawer', [('a-small', 'Small library: 4 brushes'), ('a-large', 'Large library: 154, at rest'), ('a-large-open', 'Large library: drawer open')]),
    'b-brushes-panel': ('B. A Brushes panel', [('b-small', 'Small library: 4 brushes'), ('b-large', 'Large library: 154')]),
    'c-popover': ('C. Pop-over on the brush button', [('c-small', 'Small: 4, at rest'), ('c-small-open', 'Small: 4, open'), ('c-large', 'Large: 154, at rest'), ('c-large-open', 'Large: 154, open')]),
    'd-find-and-recent': ('D. Find box and recent chips', [('d-small', 'Small library: 4 brushes'), ('d-large', 'Large library: 154, at rest'), ('d-large-typing', 'Large library: typing "pen"')]),
}
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
ft = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
GAP, HEAD, CAP = 14, 44, 30
for key, (title, cols) in SHEETS.items():
    rows = []
    for theme in ('dark', 'light'):
        rows.append([Image.open(f'{out}/raw/{n}-{theme}.png').convert('RGB') for n, _ in cols])
    cw = [max(r[i].width for r in rows) for i in range(len(cols))]
    rh = [max(im.height for im in r) for r in rows]
    W = sum(cw) + GAP * (len(cols) + 1)
    H = HEAD + CAP + sum(rh) + GAP * 3
    sheet = Image.new('RGB', (W, H), (46, 44, 56))
    d = ImageDraw.Draw(sheet)
    d.text((GAP, 10), title, font=ft, fill=(255, 255, 255))
    x = GAP
    for i, (_, cap) in enumerate(cols):
        d.text((x, HEAD + 4), cap, font=fb, fill=(240, 220, 150))
        y = HEAD + CAP
        for r in range(2):
            sheet.paste(rows[r][i], (x, y))
            y += rh[r] + GAP
        x += cw[i] + GAP
    sheet.save(f'{out}/{key}.png')
    print(key, sheet.size)
