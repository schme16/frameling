import math, sys
OUT = '/mnt/109313D2109313D2/projects/frameling/brand/round3/'
PICKS = set(int(a) for a in sys.argv[1:])

def hedgehog_quills():
    s = ''
    cx, cy, rx, ry = 54, 62, 34, 28
    for i in range(15):
        a = math.radians(-172 + i * 11.5)
        px, py = cx + rx * math.cos(a), cy + ry * math.sin(a)
        L = 14 + (i % 3) * 3
        tx, ty = cx + (rx + L) * math.cos(a), cy + (ry + L) * math.sin(a)
        nx, ny = -math.sin(a) * 4.2, math.cos(a) * 4.2
        s += f'<path d="M{px-nx:.1f} {py-ny:.1f} L{tx:.1f} {ty:.1f} L{px+nx:.1f} {py+ny:.1f}Z"/>'
    return s

def frog(tx, ty, rot, sx=1, sy=1):
    return (f'<g transform="translate({tx} {ty}) rotate({rot}) scale({sx} {sy})">'
            '<path d="M0 22 C-2 8 8 0 20 0 C32 0 40 8 38 22 C34 26 6 26 0 22Z"/>'
            '<circle cx="10" cy="0" r="5"/><circle cx="28" cy="-1" r="5"/>'
            '<path d="M0 22 C-8 22 -10 28 -6 30 L8 28Z"/></g>')

def holes(x0, x1, ys, size=3, gap=6):
    s = ''
    x = x0
    while x + size <= x1:
        for y in ys:
            s += f'<rect x="{x}" y="{y}" width="{size}" height="{size}" fill="#fff"/>'
        x += gap
    return s

S = []
def add(name, idea, svg):
    S.append((name, idea, svg))

add('Hatchling', 'bursts out of a sprite-sheet cell',
 '<rect x="14" y="36" width="72" height="54" rx="5" fill="none" stroke="#000" stroke-width="7"/>'
 '<path d="M30 92 C24 66 34 46 50 42 C66 46 76 66 70 92Z"/><circle cx="48" cy="34" r="16"/>'
 '<path d="M62 28 L78 34 L62 40Z"/><path d="M40 22 C36 10 46 8 48 18 C50 8 58 10 56 22Z"/>'
 '<path d="M30 62 C18 58 16 70 28 76Z"/><path d="M70 62 C82 58 84 70 72 76Z"/>')

add('Banded roller', 'armadillo, bands are frames',
 '<path d="M16 64 C12 40 34 22 58 22 C82 22 96 44 90 66 C88 74 82 78 74 78 L28 78 C20 78 16 72 16 64Z"/>'
 '<path d="M18 62 C10 54 4 58 2 66 C4 74 12 76 22 72Z"/><path d="M22 52 L26 36 L34 50Z"/>'
 '<path d="M88 64 C96 62 100 72 96 82 C92 78 90 74 86 72Z"/>'
 '<rect x="26" y="76" width="10" height="12" rx="4"/><rect x="42" y="76" width="10" height="12" rx="4"/><rect x="62" y="76" width="10" height="12" rx="4"/><rect x="76" y="74" width="10" height="12" rx="4"/>'
 '<g stroke="#fff" stroke-width="3" fill="none"><path d="M42 24 C38 44 38 60 42 78"/><path d="M58 22 C56 44 56 60 58 78"/><path d="M74 26 C76 44 76 60 74 78"/></g>')

add('Trailing firefly', 'leaves a trail of frames',
 '<path d="M66 46 C58 18 82 8 88 26 C84 36 78 42 70 48Z"/><ellipse cx="68" cy="58" rx="16" ry="9"/>'
 '<circle cx="86" cy="52" r="7"/><path d="M90 46 C94 38 98 36 100 36" stroke="#000" stroke-width="2.5" fill="none"/>'
 '<g transform="rotate(-8 44 50)"><rect x="34" y="40" width="20" height="20" rx="2"/></g><rect x="12" y="44" width="14" height="14" rx="2"/><rect x="0" y="48" width="7" height="7" rx="1"/>')

add('Film-tail fox', 'fox with a film-strip tail',
 '<path d="M24 94 C16 72 24 54 40 50 C56 54 60 72 54 94Z"/>'
 '<path d="M22 46 L20 22 L34 32 C38 30 44 30 48 32 L60 22 L58 46 C58 56 50 62 40 62 C30 62 22 56 22 46Z"/>'
 '<g transform="translate(54 88) rotate(-62)"><rect x="0" y="-10" width="56" height="20" rx="2"/>' + holes(4, 54, [-8, 5], 3, 7) + '</g>')

add('Reel owl', 'owl with film-reel eyes',
 '<path d="M22 92 C12 60 18 32 50 30 C82 32 88 60 78 92Z"/><path d="M24 40 L20 14 L40 32Z"/><path d="M76 40 L80 14 L60 32Z"/>'
 '<circle cx="36" cy="50" r="14" fill="#fff"/><circle cx="64" cy="50" r="14" fill="#fff"/>'
 '<circle cx="36" cy="50" r="6"/><circle cx="64" cy="50" r="6"/><path d="M46 62 L50 72 L54 62Z" fill="#fff"/>')

add('Tiny animator', 'little animator with a giant pencil',
 '<circle cx="44" cy="40" r="17"/><path d="M24 34 C26 16 58 12 68 28 C58 24 38 24 24 34Z"/><circle cx="46" cy="14" r="4"/>'
 '<path d="M34 58 C28 72 30 82 36 86 L56 86 C62 80 60 68 54 58Z"/><rect x="36" y="86" width="7" height="10" rx="3"/><rect x="50" y="86" width="7" height="10" rx="3"/>'
 '<path d="M54 64 C66 66 70 62 74 56" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>'
 '<path d="M66 70 L88 10 L96 14 L76 74Z"/><path d="M66 70 L76 74 L68 84Z"/>')

add('Half-pixel cat', 'cat that goes from smooth to pixel',
 '<path d="M20 92 C14 72 18 58 30 52 L50 52 L50 92Z"/>'
 '<path d="M12 40 L12 16 L24 24 C28 22 34 22 38 24 L50 16 L50 40 C50 50 42 56 32 56 C20 56 12 50 12 40Z"/>'
 '<g><rect x="50" y="48" width="8" height="44"/><rect x="58" y="56" width="16" height="36"/><rect x="74" y="64" width="8" height="28"/>'
 '<rect x="82" y="40" width="8" height="40"/><rect x="90" y="32" width="8" height="16"/></g>')

add('Walking pencil', 'a pencil on legs, mid-stride',
 '<g transform="rotate(12 50 50)"><rect x="36" y="16" width="28" height="48" rx="2"/><rect x="36" y="4" width="28" height="9" rx="4"/><path d="M36 64 L64 64 L50 86Z"/></g>'
 '<path d="M42 60 L30 78 L34 92" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
 '<path d="M60 62 L72 76 L84 78" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
 '<path d="M36 36 L20 26" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M66 38 L84 50" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>')

add('Inkwell critter', 'ink pot with a quill tail and feet',
 '<path d="M22 86 C12 70 18 52 34 46 L34 40 L68 40 L68 46 C84 52 90 70 78 86Z"/><rect x="30" y="32" width="42" height="9" rx="3"/>'
 '<path d="M54 34 C58 14 72 6 92 4 C86 16 76 30 58 36Z"/><ellipse cx="36" cy="90" rx="9" ry="5"/><ellipse cx="66" cy="90" rx="9" ry="5"/>'
 '<circle cx="42" cy="64" r="6" fill="#fff"/><circle cx="62" cy="62" r="5" fill="#fff"/>')

add('Zoetrope', 'spinning drum with slits',
 '<path d="M12 40 C12 30 88 30 88 40 L82 74 C80 82 20 82 18 74Z"/><rect x="43" y="78" width="14" height="10"/><ellipse cx="50" cy="90" rx="22" ry="5"/>'
 '<g fill="#fff"><rect x="24" y="46" width="5" height="22" rx="2"/><rect x="38" y="46" width="5" height="24" rx="2"/><rect x="52" y="46" width="5" height="24" rx="2"/><rect x="66" y="46" width="5" height="22" rx="2"/></g>'
 '<path d="M34 34 C34 26 40 22 46 26 M66 34 C66 26 60 22 54 26" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>')

add('Between-frame imp', 'gremlin living between frames',
 '<path d="M6 6 H36 V15 H15 V36 H6Z"/><path d="M94 94 H64 V85 H85 V64 H94Z"/>'
 '<circle cx="50" cy="52" r="13"/><path d="M39 48 L12 34 L34 60Z"/><path d="M61 48 L90 38 L66 60Z"/>'
 '<path d="M42 64 C40 76 44 84 50 84 C56 84 60 76 58 64Z"/><path d="M50 40 C50 34 52 30 56 28" stroke="#000" stroke-width="3" fill="none"/><circle cx="57" cy="27" r="4"/>')

add('Hopper frog', 'frog mid-hop across three frames',
 frog(4, 62, -8, 0.8, 0.8) + frog(34, 14, -35, 0.9, 0.7) + frog(60, 58, 6, 0.9, 0.9)
 + '<g fill="none" stroke="#000" stroke-width="2.5" stroke-dasharray="3 4"><path d="M18 56 C26 28 36 12 40 10"/><path d="M56 22 C70 24 76 36 78 54"/></g>')

add('Frame-shell crab', 'hermit crab carrying a picture frame',
 '<g transform="rotate(-8 66 40)"><rect x="42" y="10" width="48" height="54" rx="5"/><rect x="49" y="17" width="34" height="40" fill="#fff"/>'
 '<path d="M49 57 L60 38 L68 50 L74 42 L83 57Z"/><circle cx="73" cy="27" r="5"/></g>'
 '<ellipse cx="34" cy="72" rx="20" ry="13"/><path d="M26 62 L24 48 M40 60 L42 46" stroke="#000" stroke-width="3" fill="none"/><circle cx="24" cy="46" r="4"/><circle cx="42" cy="44" r="4"/>'
 '<path d="M18 68 C6 66 2 54 8 46 C14 46 20 52 20 58 L24 62Z"/>'
 '<g stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M22 80 L16 92"/><path d="M32 84 L30 96"/><path d="M44 82 L50 94"/></g>')

add('Pencil hedgehog', 'quills are coloured pencils',
 hedgehog_quills() + '<path d="M18 82 C12 58 30 36 54 36 C80 36 92 58 86 82Z"/>'
 '<path d="M20 78 C12 76 4 72 2 70 C6 62 16 58 24 62Z"/><rect x="30" y="80" width="10" height="10" rx="4"/><rect x="62" y="80" width="10" height="10" rx="4"/>')

add('Pixel-edge moth', 'far wing dissolves to pixels',
 '<ellipse cx="50" cy="56" rx="5" ry="18"/><circle cx="50" cy="34" r="6"/>'
 '<path d="M48 32 C42 20 38 14 32 10 M52 32 C58 22 62 18 68 14" stroke="#000" stroke-width="2.5" fill="none"/>'
 '<path d="M46 44 C30 20 6 26 4 46 C4 60 22 70 44 66Z"/><path d="M46 62 C30 66 18 82 26 92 C38 94 46 80 48 66Z"/>'
 '<g><rect x="55" y="34" width="14" height="8"/><rect x="55" y="42" width="26" height="8"/><rect x="55" y="50" width="34" height="8"/><rect x="55" y="58" width="38" height="8"/><rect x="55" y="66" width="28" height="8"/><rect x="55" y="74" width="16" height="8"/><rect x="55" y="82" width="8" height="8"/>'
 '<rect x="90" y="42" width="5" height="5"/><rect x="96" y="54" width="4" height="4"/><rect x="86" y="74" width="5" height="5"/></g>')

add('Triple-wing bird', 'wings as three ghost frames',
 '<path d="M44 52 C36 44 38 34 50 32 C62 32 68 44 64 54 C60 66 46 66 44 52Z"/><circle cx="38" cy="40" r="9"/>'
 '<path d="M30 38 L2 34 L30 44Z"/><path d="M60 62 L84 86 L72 88 L54 68Z"/>'
 '<path d="M52 38 C54 22 66 12 82 8 C78 20 70 30 60 42Z"/>'
 '<path d="M56 42 C70 32 86 32 96 36 C86 46 72 50 60 50Z" opacity="1"/>'
 '<path d="M56 48 C70 52 86 58 92 68 C80 70 66 62 58 54Z"/>')

CW, CH = 250, 290
W = CW * 4 + 20
H = CH * 4 + 90
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
     '<rect width="100%" height="100%" fill="#fffaf0"/>',
     '<text x="20" y="42" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="26" fill="#1d1b26">Frameling round 3: silhouette exploration (16 directions)</text>']
for i, (name, idea, svg) in enumerate(S):
    col, row = i % 4, i // 4
    x = 10 + col * CW
    y = 70 + row * CH
    pick = (i + 1) in PICKS
    o.append(f'<rect x="{x+4}" y="{y}" width="{CW-8}" height="{CH-10}" rx="14" fill="{"#ffe9a8" if pick else "#f3eee6"}" stroke="{"#ffc94a" if pick else "none"}" stroke-width="4"/>')
    o.append(f'<g transform="translate({x+15} {y+10}) scale(2.2)" fill="#000">{svg}</g>')
    o.append(f'<text x="{x+16}" y="{y+CH-44}" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="17" fill="#1d1b26">{i+1}. {name}</text>')
    o.append(f'<text x="{x+16}" y="{y+CH-24}" font-family="DejaVu Sans, sans-serif" font-size="12.5" fill="#1d1b26" opacity=".75">{idea}</text>')
o.append('</svg>')
open(OUT + 'thumbnails.svg', 'w').write('\n'.join(o))
