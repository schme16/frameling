import math
from lib import *

def sq2disc(u, v):
    return u * math.sqrt(max(0, 1 - v * v / 2)), v * math.sqrt(max(0, 1 - u * u / 2))

ACC = {(0,2):SUN,(1,4):PAPER,(2,1):SKY,(3,3):ROSE,(4,0):PAPER,(2,5):MINT,(1,0):SUN,(3,1):PAPER,(0,4):PAPER}
def cell_fill(c, r):
    return ACC.get((c, r), GRAPE)

def shell(cx, cy, R, roll=-22, rows=6, cols=5, bulge=1.0):
    o = f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{GRAPE}"/>'
    glyphs = ''
    rr = math.radians(roll)
    def pt(u, v):
        x, y = sq2disc(u, v)
        xr = x * math.cos(rr) - y * math.sin(rr)
        yr = x * math.sin(rr) + y * math.cos(rr)
        return cx + R * xr, cy + R * yr
    for r in range(rows):
        v0, v1 = -1 + 2 * r / rows, -1 + 2 * (r + 1) / rows
        off = (r % 2) * .5
        for c in range(-1, cols + 1):
            u0 = -1 + 2 * (c + off) / cols
            u1 = -1 + 2 * (c + 1 + off) / cols
            if u1 <= -1 or u0 >= 1: continue
            u0, u1 = max(u0, -1), min(u1, 1)
            n = 6
            edge = [(u0 + (u1 - u0) * t / n, v0) for t in range(n + 1)] + [(u1, v0 + (v1 - v0) * t / n) for t in range(1, n + 1)] + [(u1 - (u1 - u0) * t / n, v1) for t in range(1, n + 1)] + [(u0, v1 - (v1 - v0) * t / n) for t in range(1, n)]
            pp = [pt(u, v) for u, v in edge]
            d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pp) + 'Z'
            f = cell_fill(c % cols, r)
            o += f'<path d="{d}" fill="{f}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
            mx = sum(x for x, y in pp) / len(pp); my = sum(y for x, y in pp) / len(pp)
            if f == PAPER:
                glyphs += P(f'M{mx-13:.1f} {my+7:.1f} C{mx-6:.1f} {my-12:.1f} {mx+4:.1f} {my+14:.1f} {mx+13:.1f} {my-8:.1f}', 'none', 4.5, GRAPE)
            if f == SKY:
                glyphs += f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="9" fill="{SUN}" stroke="{INK}" stroke-width="3"/>'
            if f == SUN:
                glyphs += ''.join(f'<rect x="{mx+dx*8-6:.1f}" y="{my+dy*8-6:.1f}" width="12" height="12" fill="{PAPER}"/>' for dx, dy in [(-0.6, -0.6), (0.6, 0.6)])
    o += glyphs
    o += f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{INK}" stroke-width="9"/>'
    return o

import math
DOME = 'M82 340 C68 232 150 134 244 132 C342 130 414 214 404 340 C300 354 180 354 82 340Z'
FRAC = [.12, .3, .55, .8, .55, .3, .12]

def shell_side(unfilled=True):
    o = '<clipPath id="dome"><path d="%s"/></clipPath>' % DOME
    o += P(DOME, GRAPE, 0)
    g = ''
    xs = [120, 162, 204, 246, 288, 330, 372]
    for k, xc in enumerate(xs):
        top = 340 - 208 * math.sqrt(max(0.01, 1 - ((xc - 244) / 166) ** 2))
        y0, y1 = top + 28, 322
        h = y1 - y0
        last = (k == len(xs) - 1) and unfilled
        ang = (xc - 244) / 166 * 16
        tfw = f'transform="rotate({ang:.1f} {xc} 340)"'
        if last:
            g += f'<rect {tfw} x="{xc-15}" y="{y0:.1f}" width="30" height="{h:.1f}" rx="7" fill="none" stroke="{PAPER}" stroke-width="4" stroke-dasharray="7 7"/>'
        else:
            sy = y1 - 18 - (h - 36) * FRAC[k]
            g += f'<g {tfw}><rect x="{xc-15}" y="{y0:.1f}" width="30" height="{h:.1f}" rx="7" fill="{PAPER}" stroke="{INK}" stroke-width="4.5"/><circle cx="{xc}" cy="{sy:.1f}" r="{9+k%2}" fill="{SUN}" stroke="{INK}" stroke-width="3.5"/></g>'
        if k:
            bx = xc - 21
            g += f'<g transform="rotate({(bx-244)/166*16:.1f} {bx} 340)">' + P(f'M{bx} 110 L{bx} 366', 'none', 5.5, INK) + '</g>'
    o += f'<g clip-path="url(#dome)">{g}'
    o += P('M82 328 C180 346 300 346 404 328', 'none', 12, INK, extra='opacity=".18"')
    o += '</g>'
    o += P(DOME, 'none', 9, INK)
    return o

DEF = dict(shell_tf='', head='', all='', shadow='', sop=.14, dust=1, tail='', shell='translate(0 -22)', fl='', hl='', ffl='', hfl='', eyes='')

def build(pose=None):
    p = dict(DEF)
    if pose: p.update(pose)
    o = G(P('M60 440 C130 424 360 420 470 438 C400 462 120 466 60 440Z', INK, 0, extra='opacity="%s"' % p['sop']), p['shadow'])
    tail = P('M96 300 C60 292 24 312 10 356 C8 370 20 374 28 364 C48 336 74 330 100 334Z', PEACH, 7)
    tail += P('M72 312 L68 336 M52 324 L48 346 M32 338 L30 358', 'none', 3.5, INK, extra='opacity=".5"')
    o += G(tail, p['tail'])
    def lg(d, fx, fy, rot=0, w=32):
        import re
        nums = re.findall(r'-?\d+', d)
        fx, fy = int(nums[-2]) + 6, int(nums[-1]) + 6
        return OL(d, w, PEACH, 3.5) + f'<ellipse cx="{fx}" cy="{fy}" rx="25" ry="13" transform="rotate({rot} {fx} {fy})" fill="{PEACH}" stroke="{INK}" stroke-width="7"/>' + P(f'M{fx+14} {fy-4} L{fx+22} {fy-2} M{fx+14} {fy+3} L{fx+23} {fy+6}', 'none', 3.5, INK)
    o += lg(p['hfl'] or 'M236 312 C250 344 262 368 282 382', 296, 390, 10, 28)
    o += lg(p['ffl'] or 'M318 316 C316 346 312 370 312 388', 326, 398, 0, 28)
    o += G(shell_side(), p['shell'])
    o += lg(p['hl'] or 'M200 316 C182 346 158 366 134 372', 136, 382, -24)
    o += lg(p['fl'] or 'M348 322 C358 350 366 372 372 390', 388, 398, 0)
    head = P('M360 300 C382 284 414 290 440 316 C462 334 480 350 486 362 C488 374 480 382 468 382 C446 384 430 390 412 398 C388 410 360 400 352 380 C346 358 346 322 360 300Z', PEACH, 8)
    head += P('M388 292 C382 262 392 244 410 234 C420 256 420 280 412 300Z', PEACH, 7)
    head += P('M394 286 C392 266 398 254 406 248 C410 262 410 276 406 290Z', ROSE)
    head += P('M356 306 C370 282 404 280 430 298 C440 306 450 314 458 324 C440 316 420 318 404 326 C388 332 372 328 356 306Z', GRAPE, 7)
    head += P('M382 292 L388 318 M404 290 L408 322 M424 300 L426 320', 'none', 4, INK)
    head += '<ellipse cx="428" cy="344" rx="12" ry="14.5" transform="rotate(-10 428 344)" fill="%s"/><circle cx="424" cy="338" r="4.2" fill="%s"/>' % (INK, PAPER)
    head += P('M410 326 C420 318 436 320 444 330', 'none', 5.5, INK)
    head += '<ellipse cx="484" cy="367" rx="8" ry="7" fill="%s"/>' % INK
    head += P('M446 382 C458 382 466 380 474 374', 'none', 4.5, INK)
    head += P('M462 382 C462 396 470 400 476 394 C480 388 476 380 470 380Z', ROSE, 4)
    head += P('M372 342 L378 334 M382 350 L390 342', 'none', 3.5, INK, extra='opacity=".4"')
    o += G(G(head, p['head']), 'translate(0 -16)')
    if p['dust']:
        o += ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{PAPER}" stroke="{INK}" stroke-width="{w}"/>' for x, y, r, w in [(120, 432, 15, 5), (92, 418, 10, 4.5), (72, 436, 7, 4)])
    return G(o, p['all'])

if __name__ == '__main__':
    save('r3-1.svg', doc(build()))
    png('r3-1.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/t.png')
