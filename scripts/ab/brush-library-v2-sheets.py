# Lays the raw shots from scripts/docs/ab-brush-picker side by side, dark above light, with a caption strip over each
# column. The pictures themselves are untouched crops of the real app; only the strips and gaps are drawn here.
#   python3 scripts/ab/brush-library-v2-sheets.py brand/ab/brush-library-v2
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
SHEETS = {
    '1-picker': ('The dropdown picker', [
        ('main-small-open', 'Small: 4 brushes, open'),
        ('main-large-open', '154 brushes: one group open'),
        ('main-large-recent', '154: Recent open'),
        ('main-large-folded', '154: every group folded'),
        ('main-large-typing', '154: typing "pen"'),
    ]),
    '2-rows': ('Three rows to choose between (154 brushes, the Inking group open in each)', [
        ('row-sample', 'R1. Stroke only'),
        ('row-tip', 'R2. Tip, stroke and name'),
        ('row-two', 'R3. Two columns, denser'),
    ]),
    '3-resized': ('Dragged bigger from its bottom-left corner', [
        ('main-large-wide', 'Wider and taller, two columns'),
    ]),
    '4-button-at-rest': ('The button in the Brush options, at rest', [
        ('rest-small', 'Four brushes'),
        ('rest-large', '154 brushes'),
        ('rest-large-changed', '154, size changed (dot, Update, Revert)'),
    ]),
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
    W = max(sum(cw) + GAP * (len(cols) + 1), 760)
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
