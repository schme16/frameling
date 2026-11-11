import math, random
from lib import *

# wing outlines as cubic segments: start, [(c1,c2,end),...]
LF = ((242,208), [((204,128),(104,104),(58,150)), ((36,190),(82,258),(158,262)), ((196,262),(226,240),(242,208))])
LH = ((242,252), [((192,246),(128,288),(126,350)), ((126,404),(190,414),(222,366)), ((240,336),(248,290),(242,252))])
# right wings: not an exact mirror
RF = ((298,208), [((332,134),(430,98),(468,138)), ((492,170),(448,246),(380,258)), ((344,264),(314,240),(298,208))])
RH = ((298,254), [((346,252),(406,290),(410,346)), ((412,396),(350,404),(322,360)), ((306,330),(296,292),(298,254))])

def dpath(w):
    (x, y), segs = w
    d = f'M{x} {y}'
    for c1, c2, e in segs:
        d += f' C{c1[0]} {c1[1]} {c2[0]} {c2[1]} {e[0]} {e[1]}'
    return d + 'Z'

def poly(w, n=24):
    (x, y), segs = w
    pts = [(x, y)]
    cur = (x, y)
    for c1, c2, e in segs:
        for i in range(1, n + 1):
            t = i / n; u = 1 - t
            pts.append((u**3*cur[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t**3*e[0], u**3*cur[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t**3*e[1]))
        cur = e
    return pts

def inside(pt, pg):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(pg, pg[1:] + pg[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def bdist(pt, pg):
    best = 1e9
    for (x1, y1), (x2, y2) in zip(pg, pg[1:] + pg[:1]):
        dx, dy = x2 - x1, y2 - y1
        L = dx*dx + dy*dy or 1
        t = max(0, min(1, ((pt[0]-x1)*dx + (pt[1]-y1)*dy) / L))
        best = min(best, math.hypot(pt[0] - (x1 + t*dx), pt[1] - (y1 + t*dy)))
    return best

def pixel_wing(w, base, seed, S=19, band=26):
    rnd = random.Random(seed)
    pg = poly(w)
    xs = [p[0] for p in pg]; ys = [p[1] for p in pg]
    o = ''; floats = ''
    for gx in range(int(min(xs) // S) - 1, int(max(xs) // S) + 2):
        for gy in range(int(min(ys) // S) - 1, int(max(ys) // S) + 2):
            c = ((gx + .5) * S, (gy + .5) * S)
            if not (inside(c, pg) or (bdist(c, pg) < 3 and c[0] > 320)): continue
            d = bdist(c, pg)
            r = rnd.random()
            if d < 18 and c[0] > 345 and r < .3:
                # dissolves, drifts outward
                ox, oy = (c[0] - 270) * .06, (c[1] - 250) * .05
                s2 = S * .62
                floats += f'<rect x="{c[0]+ox+12-s2/2:.1f}" y="{c[1]+oy+8-s2/2:.1f}" width="{s2:.1f}" height="{s2:.1f}" fill="{ROSE if r < .09 else PAPER}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
                continue
            col = ROSE if d < band else base
            o += f'<rect x="{c[0]-S/2:.1f}" y="{c[1]-S/2:.1f}" width="{S}" height="{S}" fill="{col}" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>'
    return o + floats

def vec_wing(w, base, band=34, extra=''):
    d = dpath(w)
    cid = 'c' + str(abs(hash(d)) % 99999)
    s = f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'
    s += P(d, base, 0)
    s += f'<g clip-path="url(#{cid})">' + P(d, 'none', band, ROSE) + extra + '</g>'
    s += P(d, 'none', 8, INK)
    return s

def eyespot(cx, cy, r, rot):
    return G(f'<rect x="{-r}" y="{-r}" width="{2*r}" height="{2*r}" rx="{r*.3:.1f}" fill="{GRAPE}" stroke="{INK}" stroke-width="6"/>'
             f'<rect x="{-r*.46:.1f}" y="{-r*.46:.1f}" width="{r*.92:.1f}" height="{r*.92:.1f}" rx="{r*.16:.1f}" fill="{SKY}" stroke="{INK}" stroke-width="4"/>', f'translate({cx} {cy}) rotate({rot})')

def trail(n=3):
    o = ''
    for i, (cx, cy, s, op) in enumerate([(286, 392, 40, .75), (300, 436, 30, .5), (310, 470, 21, .3)][:n]):
        o += f'<rect x="{cx-s/2}" y="{cy-s/2}" width="{s}" height="{s}" rx="{s*.2:.0f}" fill="{SKY}" fill-opacity="{op*.35:.2f}" stroke="{INK}" stroke-opacity="{op}" stroke-width="{4.5 - i}" transform="rotate({8+i*7} {cx} {cy})"/>'
    return o

DEF = dict(LF='', LH='', RF='', RH='', body='', tilt='rotate(-12 270 250)', ntrail=3, sleepy=1, all='')

def build(pose=None):
    p = dict(DEF)
    if pose: p.update(pose)
    o = trail(p['ntrail'])
    # far-side (right, pixel) wings
    o += G(pixel_wing(RH, PEACH, 3), p['RH'])
    o += G(pixel_wing(RF, SUN, 7), p['RF'])
    # near (left, smooth) wings
    veins_h = P('M236 258 C200 280 170 310 150 356', 'none', 4.5, INK, extra='opacity=".55"') + P('M232 268 C214 300 200 330 196 372', 'none', 3.5, INK, extra='opacity=".4"')
    o += G(vec_wing(LH, PEACH, 34, veins_h) + eyespot(168, 340, 22, -14), p['LH'])
    veins_f = P('M236 210 C190 190 130 180 78 186', 'none', 5, INK, extra='opacity=".55"') + P('M234 226 C190 216 140 220 100 232', 'none', 3.5, INK, extra='opacity=".4"')
    o += G(vec_wing(LF, SUN, 34, veins_f) + eyespot(112, 190, 26, 10), p['LF'])
    # body
    body = ''
    body += P('M258 150 C236 120 214 96 190 74', 'none', 5.5, INK) + P('M272 148 C292 114 326 84 356 60', 'none', 5.5, INK)
    for i in range(7):
        t = (i + 1) / 8
        ax, ay = 258 + (190 - 258) * t * 0.9 - 6 * math.sin(t*3), 150 + (74 - 150) * t * 1.0
        body += P(f'M{ax:.0f} {ay:.0f} l-10 6 M{ax:.0f} {ay:.0f} l-4 -10', 'none', 3, INK)
    for i in range(6):
        t = (i + 1) / 7
        ax, ay = 272 + (356 - 272) * t * .9, 148 + (60 - 148) * t
        body += P(f'M{ax:.0f} {ay:.0f} l9 8 M{ax:.0f} {ay:.0f} l7 -9', 'none', 3, INK)
    body += P('M236 214 C228 186 244 164 270 164 C298 164 312 186 304 214 C312 256 300 320 282 346 C272 352 262 348 254 336 C238 306 228 250 236 214Z', PEACH, 8)
    body += P('M240 202 L232 196 L242 190 L236 182 L248 180 L246 170 M300 202 L310 196 L300 190 L308 182 L296 180 L298 170', 'none', 4, INK)
    body += P('M252 276 C264 284 280 284 292 274 M254 300 C266 308 278 308 288 298 M258 322 C268 328 276 328 282 322', 'none', 4, INK, extra='opacity=".4"')
    # head
    body += P('M236 186 L228 196 L242 194 L238 206 L252 198 L258 210 L268 198 L280 208 L288 196 L302 204 L300 190 L312 188 L302 178 Z', PEACH, 5)
    body += P('M238 168 C232 136 258 118 284 126 C310 134 318 160 308 180 C296 200 246 198 238 168Z', PAPER, 7)
    body += '<ellipse cx="258" cy="162" rx="14.5" ry="18" transform="rotate(-8 258 162)" fill="%s"/><circle cx="254" cy="155" r="4.6" fill="%s"/><circle cx="263" cy="169" r="2" fill="%s"/>' % (INK, PAPER, PAPER)
    body += '<ellipse cx="297" cy="160" rx="11" ry="14" transform="rotate(8 297 160)" fill="%s"/><circle cx="295" cy="155" r="3.2" fill="%s"/>' % (INK, PAPER)
    if p['sleepy']:
        body += P('M280 160 C284 144 308 144 312 162 L280 164Z', PEACH, 5)
    body += P('M270 188 C277 195 287 193 290 185', 'none', 4.5, INK)
    body += P('M246 140 C252 130 262 128 270 130', 'none', 4.5, INK)
    o += G(body, p['body'])
    return G(o, p['tilt'] + ' ' + p['all'])

if __name__ == '__main__':
    save('r3-4.svg', doc(build()))
    png('r3-4.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/t.png')
