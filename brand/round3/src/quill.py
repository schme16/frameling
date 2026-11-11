import math
from lib import *

C = (236, 296); RX, RY = 138, 108

def pencil(L, col, w=13, tip=1.0):
    t = 34 * tip
    s = P(f'M-34 {-w} L{L-t} {-w} L{L-t} {w} L-34 {w}Z', col, 6)
    s += P(f'M{L-t} {-w} L{L} 0 L{L-t} {w}Z', PAPER, 5.5)
    s += P(f'M{L-t*.4} {-w*.34} L{L} 0 L{L-t*.4} {w*.34}Z', INK, 3)
    s += P(f'M{L-t-14} {-w+1} L{L-t-14} {w-1}', 'none', 4.5, INK, extra='opacity=".55"')
    s += P(f'M-6 {-w*.35} L{L-t-22} {-w*.38}', 'none', 3.5, INK, extra='opacity=".22"')
    return s

DEFQ = [(190,100,ROSE),(207,132,SKY),(224,96,SUN),(240,146,MINT),(256,110,PAPER),(272,152,ROSE),(288,106,SKY),(304,138,SUN),(321,92,MINT),(336,70,PAPER)]

def quills(lenscale=1.0, spread=0, lean=0, extra=None):
    o = ''
    for i, (a, L, col) in enumerate(DEFQ):
        aa = a + (a - 263) * spread + lean
        L = L * lenscale
        ar = math.radians(a)
        bx = C[0] + RX * math.cos(ar) * .9
        by = C[1] + RY * math.sin(ar) * .9
        rot = aa + [3, -4, 5, -2, 4, -5, 2, -3, 4, -2][i]
        o += f'<g transform="translate({bx:.1f} {by:.1f}) rotate({rot:.1f})">{pencil(L, col, 13 if i % 3 else 12)}</g>'
    return o

def leg(d, w=30):
    return OL(d, w, PEACH, 3.5)

DEF = dict(
    quills=dict(), body='', face='', all='', shadow='', sop=.13, eye='open',
    hf='M214 380 C214 392 218 402 222 410', hn='M164 372 C156 390 146 402 134 410',
    ff='M326 372 C326 388 330 400 334 410', fn='M366 366 C376 384 388 396 402 404',
    fly=True,
)

def face(p):
    f = P('M346 252 C366 236 396 252 434 312 C444 326 440 338 428 342 C402 352 372 352 350 342 C336 322 334 278 346 252Z', PEACH, 7)
    f += P('M334 238 C326 220 346 206 360 214 C368 224 362 238 354 246Z', PEACH, 7)
    f += P('M340 234 C338 226 346 220 352 224 C354 230 350 236 348 240Z', ROSE)
    f += '<ellipse cx="438" cy="326" rx="12" ry="10" transform="rotate(-26 438 326)" fill="%s"/>' % INK
    if p['eye'] == 'open':
        f += '<circle cx="388" cy="298" r="10.5" fill="%s"/><circle cx="385" cy="294" r="3.2" fill="%s"/>' % (INK, PAPER)
        f += P('M372 280 C382 272 396 272 404 280', 'none', 5, INK)
    else:
        f += P('M376 300 C384 292 396 292 402 300', 'none', 5.5, INK)
        f += P('M372 284 C382 280 394 282 402 288', 'none', 4, INK)
    f += P('M396 330 C410 338 418 336 424 330', 'none', 4, INK)
    f += P('M420 312 L450 302 M422 318 L452 316', 'none', 3.5, INK)
    f += P('M372 322 L378 314 M382 326 L390 318', 'none', 3.5, INK, extra='opacity=".4"')
    return f

def build(pose=None):
    p = dict(DEF)
    if pose: p.update(pose)
    sh = G(P('M70 440 C130 424 340 422 440 440 C380 462 130 466 70 440Z', INK, 0, extra='opacity="%s"' % p['sop']), p['shadow'])
    o = G(quills(**p['quills']), p['body'])
    o += leg(p['hf'], 28) + leg(p['ff'], 28)
    base = P('M108 356 C94 270 146 196 236 188 C314 182 360 228 366 284 C362 330 340 350 300 356 C240 366 160 366 108 356Z', GRAPE, 8)
    base += P('M104 342 C118 332 122 346 138 338 C150 332 156 348 172 342', 'none', 4, INK, extra='opacity=".35"')
    base += P('M250 214 C282 210 312 226 326 252', 'none', 6, INK, extra='opacity=".18"')
    base += P('M170 250 C180 236 196 228 212 224', 'none', 4, INK, extra='opacity=".18"')
    belly = P('M132 346 C190 376 300 380 354 340 C362 366 346 388 318 394 C250 406 170 402 140 384 C126 372 124 356 132 346Z', PEACH, 7)
    o += G(belly + base, p['body'])
    o += leg(p['hn'], 32) + leg(p['fn'], 30)
    o += G(G(face(p), p['face']), 'translate(350 300) scale(1.1) translate(-350 -300)')
    return sh + G(o, p['all'])

if __name__ == '__main__':
    save('r3-3.svg', doc(build(dict(all='translate(18 8)'))))
    png('r3-3.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/t.png')
