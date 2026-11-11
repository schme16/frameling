import math
from lib import *

def bez(p, t):
    (x0,y0),(x1,y1),(x2,y2),(x3,y3) = p
    u = 1 - t
    return (u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3, u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3)

def strip(ctrl, ncell=5, w0=26, w1=46, ball=True):
    pts = [bez(ctrl, i / 240) for i in range(241)]
    L = [0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + math.hypot(b[0]-a[0], b[1]-a[1]))
    total = L[-1]
    def at(s):
        s = max(0, min(total, s))
        for i in range(1, len(L)):
            if L[i] >= s:
                f = (s - L[i-1]) / (L[i] - L[i-1] or 1)
                a, b = pts[i-1], pts[i]
                x, y = a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f
                ang = math.atan2(b[1]-a[1], b[0]-a[0])
                return x, y, ang
    def hw(s): return w0 + (w1 - w0) * (s / total) ** 1.2
    # band polygon
    left, right = [], []
    for i in range(0, 241, 4):
        x, y, a = at(L[i])
        w = hw(L[i]) + 8
        left.append((x - math.sin(a) * w, y + math.cos(a) * w))
        right.append((x + math.sin(a) * w, y - math.cos(a) * w))
    poly = left + right[::-1]
    o = f'<path d="M{poly[0][0]:.1f} {poly[0][1]:.1f} ' + ' '.join(f'L{x:.1f} {y:.1f}' for x, y in poly[1:]) + f'Z" fill="{INK}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
    pitch = total / ncell
    gap = 4.5
    for k in range(ncell):
        s0, s1 = pitch * k + gap, pitch * (k + 1) - gap
        pl, pr = [], []
        for j in range(7):
            ss = s0 + (s1 - s0) * j / 6
            x, y, a = at(ss)
            w = hw(ss) - 9
            pl.append((x - math.sin(a) * w, y + math.cos(a) * w))
            pr.append((x + math.sin(a) * w, y - math.cos(a) * w))
        pg = pl + pr[::-1]
        o += f'<path d="M{pg[0][0]:.1f} {pg[0][1]:.1f} ' + ' '.join(f'L{x:.1f} {y:.1f}' for x, y in pg[1:]) + f'Z" fill="{PAPER}" stroke="{PAPER}" stroke-width="7" stroke-linejoin="round"/>'
        sm = (s0 + s1) / 2
        x, y, a = at(sm)
        w = hw(sm)
        if ball and k < ncell - 1:
            off = [w*.42, w*.02, -w*.4, -w*.04, w*.4, 0][k % 6]
            bx, by = x - math.sin(a) * off * -1 + math.cos(a) * (-3 if k % 2 else 3), y + math.cos(a) * off * -1 + math.sin(a) * (-3 if k % 2 else 3)
            o += f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{w*.25:.1f}" fill="{[ROSE, GRAPE, SKY, MINT][k%4]}" stroke="{INK}" stroke-width="3.5"/>'
    for k in range(ncell):
        s = pitch * (k + .5)
        # perforations
        for j in range(3):
            for side in (-1, 1):
                sp = s - pitch*.5 + pitch*(j + .5)/3
                px, py, pa = at(sp)
                ww = hw(sp) + 4.5
                cx, cy = px - math.sin(pa) * ww * side * -1, py + math.cos(pa) * ww * side * -1
                o += f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({math.degrees(pa):.1f})"><rect x="-4.5" y="-3.8" width="9" height="7.6" rx="1.5" fill="{PAPER}"/></g>'
    return o

def limb(up, lo, sock, wu=32, wl=22, col=PEACH):
    # up/lo are path strings, sock is a short path in ink
    o = OL(lo, wl, col, 3.5) + P(sock, 'none', wl + 2, INK) + OL(up, wu, col, 3.5)
    return o

DEF = dict(
    tail=((176,262),(70,300),(34,130),(184,60)),
    body='', head='', n=7, all='', shadow='', sop=.13,
    fn=('M290 292 C304 310 322 322 340 326', 'M340 326 C352 330 364 328 376 322', 'M358 330 C366 330 372 328 380 324'),
    ff=('M272 300 C288 326 306 344 322 352', 'M322 352 C334 360 344 362 356 360', 'M340 360 C346 362 352 362 358 360'),
    hn=('M196 296 C178 318 156 332 134 336', 'M134 336 C120 338 110 330 100 322', 'M112 334 C108 330 104 326 100 322'),
    hf=('M222 314 C220 340 204 358 186 368', 'M186 368 C174 374 166 382 150 380', 'M164 380 C158 382 154 382 150 380'),
)

def build(pose=None):
    p = dict(DEF)
    if pose: p.update(pose)
    sh = G(P('M60 470 C120 458 320 456 430 470 C380 488 120 492 60 470Z', INK, 0, extra='opacity="%s"' % p['sop']), p['shadow']) if p['sop'] else ''
    o = strip(p['tail'], p['n'])
    o += limb(*p['hf'], wu=28, wl=20) + limb(*p['ff'], wu=28, wl=20)
    body = P('M304 252 C296 222 252 210 210 222 C172 232 154 258 158 286 C164 314 198 324 236 322 C274 320 310 298 304 252Z', PEACH, 8)
    body += P('M170 296 C190 322 238 330 272 318 C294 308 306 288 306 262 C298 296 270 312 236 312 C206 312 184 306 170 296Z', INK, 0, extra='opacity=".14"')
    body += P('M298 262 C306 282 298 300 280 312 C272 314 266 314 262 312 C276 296 288 280 298 262Z', PAPER, 0)
    body += P('M222 226 C228 240 228 252 220 262', 'none', 5, INK, extra='opacity=".28"')
    o += G(body, p['body'])
    o += limb(*p['hn'], wu=34, wl=22) + limb(*p['fn'], wu=30, wl=22)
    head = ''
    head += P('M372 158 C384 128 410 106 442 98 C444 126 430 152 410 172Z', PEACH, 7)
    head += P('M394 150 C402 134 416 122 430 116 C430 130 422 144 412 154Z', INK)
    head += P('M290 226 C292 182 322 154 362 154 C396 154 420 192 446 228 C452 238 448 248 438 252 C418 260 404 262 392 272 C372 292 330 290 306 272 C296 260 290 244 290 226Z', PEACH, 8)
    head += P('M300 250 L278 254 L296 264 L282 276 L304 276 L298 292 L322 286 C344 294 374 286 392 270 C380 256 362 260 352 254 C338 264 316 262 300 250Z', PAPER, 6)
    head += P('M382 246 C400 240 424 240 446 250 C446 258 440 262 430 262 C414 264 404 266 394 272 C384 270 378 256 382 246Z', PAPER, 6)
    head += '<ellipse cx="446" cy="244" rx="10" ry="8" transform="rotate(-20 446 244)" fill="%s"/>' % INK
    head += P('M316 176 C304 142 304 112 318 82 C342 98 364 128 370 162Z', PEACH, 8)
    head += P('M324 160 C316 138 316 118 322 102 C336 116 348 134 352 154Z', ROSE)
    head += '<ellipse cx="376" cy="204" rx="9.5" ry="13" transform="rotate(-8 376 204)" fill="%s"/><circle cx="373" cy="198" r="3.6" fill="%s"/>' % (INK, PAPER)
    head += '<ellipse cx="414" cy="206" rx="6.5" ry="9.5" transform="rotate(-10 414 206)" fill="%s"/><circle cx="412" cy="202" r="2.4" fill="%s"/>' % (INK, PAPER)
    head += P('M360 178 C372 168 388 168 398 178', 'none', 5.5, INK)
    head += P('M406 188 C412 184 418 184 424 188', 'none', 4, INK)
    head += P('M426 258 C416 270 404 272 396 266', 'none', 4.5, INK)
    head += P('M404 270 C404 284 414 290 420 282 C424 276 420 268 414 268Z', ROSE, 4)
    o += G(head, p['head'])
    return sh + G(o, p['all'])

if __name__ == '__main__':
    save('r3-2.svg', doc(G(build(), 'translate(20 14) scale(.94)')))
    png('r3-2.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/t.png')
