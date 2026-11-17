# Turns the pictures from scripts/brush-parity-presets.cjs into one sheet a group: a row a brush, the vector stroke on the
# left, the pixel stroke on the right, same path and pressure, on white. Usage: python3 sheets.py <picturesDir> <outDir>
import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
FONT = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
BOLD = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
font, bold, small = ImageFont.truetype(FONT, 15), ImageFont.truetype(BOLD, 18), ImageFont.truetype(FONT, 13)
# group -> (title, [(vector name, pixel name, note)])
G = {
 'pencils': ('Pencils', [('Mechanical pencil', 'Mechanical pencil', ''), ('Colour pencil', 'Colour pencil', ''), ('Sketch pencil', 'Sketch pencil', '')]),
 'pens': ('Pens', [('Gel pen', 'Gel pen', ''), ('Ballpoint pen', 'Ballpoint pen', ''), ('Brush pen', 'Brush pen', ''), ('Dip pen', 'Dip pen', '')]),
 'markers': ('Markers', [('Fine marker', 'Fine marker', ''), ('Block marker', 'Block marker', ''), ('Brush marker', 'Brush marker', '')]),
 'paint': ('Paint', [('Tapered brush', 'Tapered brush', ''), ('Round brush', 'Round brush', ''), ('Dry brush', 'Dry brush', '')]),
 'chalk-and-charcoal': ('Chalk and charcoal', [('Charcoal', 'Charcoal', ''), ('Oil pastel', 'Oil pastel', '')]),
 'stamps-and-texture': ('Stamps and texture', [('Leaves', 'Leaves', ''), ('Falling leaves', 'Falling leaves', ''), ('Paw prints', 'Paw prints', ''), ('Dashed line', 'Dashed line', '')]),
 'calligraphy': ('Calligraphy', [('Broad nib', 'Broad nib', ''), ('Round nib', 'Round nib', '')]),
 'pen-and-speed': ('Pen and speed', [('Pressure pencil', 'Pressure pencil', ''), ('Pressure spray', 'Pressure spray', '')]),
 'scatter-and-spray': ('Scatter and spray', [('Speckle', 'Speckle', ''), ('Sprinkle', 'Sprinkle', '')]),
 'shapes': ('Shapes', [('Slash', 'Slash', '')]),
}
NOTES = dict(line.split('|', 1) for line in open(__file__.replace('sheets.py', 'notes.txt')).read().splitlines() if '|' in line) if True else {}

def doc(path):
    im = Image.open(path).convert('RGB')
    white = im.point(lambda v: 255 if v == 255 else 0).convert('L').point(lambda v: 255 if v == 255 else 0)
    # a pixel is pure white only when all three channels are; the page round it is beige, so the box of pure white is the document
    r, g, b = [im.getchannel(c).point(lambda v: 255 if v == 255 else 0) for c in range(3)]
    from PIL import ImageChops
    box = ImageChops.multiply(ImageChops.multiply(r, g), b).getbbox()
    assert box and abs((box[2] - box[0]) - 512) <= 2 and abs((box[3] - box[1]) - 512) <= 2, (path, box)
    return im.crop((box[0], box[1], box[0] + 512, box[1] + 512))

LANE = 128
for key, (title, rows) in G.items():
    v, p = doc(f'{src}/{key}-v.png'), doc(f'{src}/{key}-p.png')
    pad, lab = 20, 54
    W = pad * 3 + 2 * 512
    H = 76 + len(rows) * (LANE + lab) + pad
    sh = Image.new('RGB', (W, H), (236, 230, 218)); d = ImageDraw.Draw(sh)
    d.text((pad, 14), f'{title}: each vector brush (left, on a vector layer) beside its pixel brush (right, on a pixel layer)', font=bold, fill=(40, 36, 30))
    d.text((pad, 42), 'Same path, same pen pressure (light, hard, light), same colour, on white, both at 100%.', font=small, fill=(90, 84, 76))
    for i, (vn, pn, _) in enumerate(rows):
        y = 76 + i * (LANE + lab)
        note = NOTES.get(vn, '')
        d.text((pad, y + 2), f'{vn}' + (f'  ({pn} on the pixel side)' if pn != vn else ''), font=bold, fill=(40, 36, 30))
        d.text((pad, y + 26), note, font=small, fill=(90, 84, 76))
        for k, im in enumerate((v, p)):
            lane = im.crop((0, i * LANE, 512, (i + 1) * LANE))
            sh.paste(lane, (pad + k * (512 + pad), y + lab))
    sh.save(f'{out}/{key}.png'); print(key, sh.size)
