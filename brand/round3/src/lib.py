import subprocess, os
OUT = '/mnt/109313D2109313D2/projects/frameling/brand/round3/'
SUN, PEACH, ROSE, GRAPE, SKY, MINT, INK, PAPER = '#ffc94a', '#ff9e6d', '#ff6f91', '#9b7bff', '#5ab8ff', '#4fd1a5', '#1d1b26', '#fffaf0'
DARK, LIGHT = '#17151f', '#f3eee6'

def P(d, fill='none', sw=0, stroke=INK, extra=''):
    s = f'<path d="{d}" fill="{fill}"'
    if sw:
        s += f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
    return s + (' ' + extra if extra else '') + '/>'

def OL(d, w, color, o=3.5, extra=''):
    # outlined stroke: ink under, colour over
    return (P(d, 'none', w + 2 * o, INK, extra) + P(d, 'none', w, color, extra))

def G(inner, tf='', extra=''):
    t = f' transform="{tf}"' if tf else ''
    return f'<g{t} {extra}>{inner}</g>'

def doc(body, w=512, h=512, bg=None, vb=None):
    vb = vb or f'0 0 {w} {h}'
    b = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}">{b}{body}</svg>\n'

def save(name, text):
    open(OUT + name, 'w').write(text)

def png(name, w, outname=None):
    outname = outname or name.replace('.svg', '.png')
    subprocess.run(['rsvg-convert', '-w', str(w), OUT + name, '-o', outname if outname.startswith('/') else OUT + outname], check=True)

# pixel art -------------------------------------------------------
def pixel_svg(rows, pal, size=512):
    assert len(rows) == 32, len(rows)
    rects = []
    for y, r in enumerate(rows):
        assert len(r) == 32, (y, len(r), r)
        x = 0
        while x < 32:
            c = r[x]
            if c == '.':
                x += 1
                continue
            x2 = x
            while x2 < 32 and r[x2] == c:
                x2 += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{x2-x}" height="1" fill="{pal[c]}"/>')
            x = x2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 32 32" shape-rendering="crispEdges">'
            + ''.join(rects) + '</svg>\n')

# icons -----------------------------------------------------------
def icon_svg(bg, art, tf, extra_bg=''):
    # 512 rounded square, art placed with transform tf
    return doc(f'<rect x="16" y="16" width="480" height="480" rx="110" fill="{bg}"/>{extra_bg}'
               f'<clipPath id="ic"><rect x="16" y="16" width="480" height="480" rx="110"/></clipPath>'
               f'<g clip-path="url(#ic)"><g transform="{tf}">{art}</g></g>')

class Px:
    def __init__(self):
        self.g = [['.'] * 32 for _ in range(32)]
    def px(self, x, y, c):
        if 0 <= x < 32 and 0 <= y < 32:
            self.g[y][x] = c
    def blit(self, rows, ox, oy, outline=True, oc='k'):
        cells = {}
        for j, r in enumerate(rows):
            for i, c in enumerate(r):
                if c != '.':
                    cells[(ox + i, oy + j)] = c
        if outline:
            for (x, y) in list(cells):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n not in cells:
                        self.px(n[0], n[1], oc)
        for (x, y), c in cells.items():
            self.px(x, y, c)
        return self
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)
        return self
    def rows(self):
        return [''.join(r) for r in self.g]

PIXPAL = {'k': INK, 'r': ROSE, 's': SUN, 'p': PEACH, 'g': GRAPE, 'b': SKY, 'm': MINT, 'w': PAPER}

def poses_svg(builder, poses, labels, tfs=None, bg=PAPER):
    # three panels 400 wide
    o = ''
    for i, (pz, lab) in enumerate(zip(poses, labels)):
        x = 12 + i * 396
        o += f'<rect x="{x}" y="12" width="384" height="440" rx="22" fill="{LIGHT}"/>'
        tf = (tfs[i] if tfs else None) or 'scale(.72)'
        o += f'<g transform="translate({x+8} 40) {tf}">{builder(pz)}</g>'
        o += f'<text x="{x+22}" y="440" font-family="DejaVu Sans, sans-serif" font-size="17" font-weight="bold" fill="{INK}">{lab}</text>'
    return doc(o, 1200, 464, bg)
