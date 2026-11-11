from lib import *

def claw(extra_inside='', hold=''):
    # pincer pointing up (-y), local coords
    palm = P('M-27 2 C-30 -20 -16 -34 0 -34 C16 -34 30 -20 27 2 C24 20 -24 22 -27 2Z', ROSE, 6)
    fl = P('M-24 -20 C-34 -46 -26 -68 -12 -80 C-8 -62 -4 -46 2 -32Z', ROSE, 6)
    fr = P('M24 -18 C38 -38 34 -60 20 -72 C14 -56 10 -44 4 -32Z', ROSE, 6)
    shade = P('M-26 4 C-24 18 22 20 26 4 C20 10 -18 12 -26 4Z', INK, 0, extra='opacity=".18"')
    return hold + fl + fr + palm + shade

def pencil(squig=True):
    s = P('M-10 14 L-10 -98 L10 -98 L10 14Z', SKY, 6)
    s += P('M-10 -98 L0 -132 L10 -98Z', PAPER, 6)
    s += P('M-3.8 -120 L0 -132 L3.8 -120Z', INK, 3)
    s += P('M-10 -84 L10 -86', INK, 5)
    s += P('M-3 6 L-4 -76', INK, 3.5, extra='opacity=".28"')
    return s

def frame_art(tilt_scene=0):
    # local coords, centre 0,0, ~210x250
    back = P('M-99 -102 C-99 -114 -92 -119 -82 -119 L96 -119 C107 -119 112 -113 112 -102 L112 116 C112 127 106 131 96 131 L-84 131 C-94 131 -99 125 -99 115Z', INK, 0, extra='opacity=".16"')
    outer = P('M-105 -110 C-105 -120 -98 -125 -88 -125 L88 -125 C99 -125 105 -119 105 -108 L105 110 C105 121 99 125 88 125 L-90 125 C-100 125 -105 119 -105 109Z', SUN, 8)
    inner = P('M-74 -95 L76 -97 L77 96 L-76 98Z', SKY, 7)
    # scene
    sun = P('M20 -62 C20 -78 34 -88 48 -84 C60 -80 66 -66 60 -54 C54 -42 36 -40 26 -46 C22 -50 20 -56 20 -62Z', SUN, 5)
    hill = P('M-74 98 L-74 30 C-44 -6 4 4 30 40 C44 22 62 22 77 34 L76 96Z', MINT, 6)
    pix = ''.join(f'<rect x="{x}" y="{y}" width="14" height="14" fill="{PAPER}"/>' for x, y in [(-60, -62), (-46, -62), (-46, -76), (-32, -62), (-18, -62), (-60, -48)])
    pix += '<rect x="-60" y="-62" width="42" height="14" fill="none"/>'
    scrib = P('M-50 70 C-36 58 -26 76 -12 62 C-4 54 6 64 14 56', 'none', 5, GRAPE, extra='stroke-dasharray="1 0"')
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GRAPE}"/>' for x, y, r in [(26, 52, 3.4), (36, 47, 2.6), (44, 44, 1.8)])
    bevel = P('M-92 -108 L-90 112', 'none', 3, INK, extra='opacity=".22"')
    bevel += P('M-82 114 L84 112', 'none', 3, INK, extra='opacity=".22"')
    return back + outer + bevel + inner + sun + P('M-74 98 L-74 30 C-44 -6 4 4 30 40 C44 22 62 22 77 34 L76 96Z', MINT, 6) + pix + scrib + dots + P('M-74 -95 L76 -97 L77 96 L-76 98Z', 'none', 7)

def build(pose=None, full=True):
    p = dict(frame='translate(318 222) rotate(-9)', body='', eyeL='', eyeR='', clawL='', clawR='', lid=1, legs='', shadow='', sop=.14)
    if pose: p.update(pose)
    o = ''
    # ground shadow
    o += G(P('M62 480 C120 466 300 462 352 476 C320 494 110 496 62 480Z', INK, 0, extra='opacity="%s"' % p['sop']), p['shadow'])
    o += G(frame_art(), p['frame'])
    legsets = [
        'M140 420 C112 430 100 448 88 464', 'M170 434 C152 450 150 462 142 474',
        'M236 438 C246 452 258 462 266 474', 'M272 424 C298 434 312 448 324 460']
    lg = ''.join(OL(d, 10, ROSE, 3) for d in legsets)
    body = P('M108 392 C100 352 140 322 200 326 C262 330 302 356 296 398 C292 428 248 442 198 442 C148 442 112 428 108 392Z', ROSE, 7)
    body += P('M112 402 C140 428 250 434 294 404 C290 430 248 442 198 442 C150 442 116 430 112 402Z', INK, 0, extra='opacity=".16"')
    body += ''.join(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{PAPER}" transform="rotate({r} {x} {y})"/>' for x, y, s, r in [(134, 352, 11, -8), (146, 346, 7, 12)])
    body += P('M236 350 C246 346 256 352 256 362 C256 370 246 374 240 370', 'none', 4, INK, extra='opacity=".3"')
    face = P('M176 394 C190 406 212 404 222 386', 'none', 6, INK) + P('M222 386 L229 382', 'none', 5, INK)
    face += P('M246 398 L252 388 M254 402 L262 394', 'none', 4, INK)
    # eyes
    eL = OL('M166 336 C158 316 168 300 158 282', 9, ROSE, 3)
    eL += '<circle cx="156" cy="266" r="19" fill="%s" stroke="%s" stroke-width="6"/>' % (PAPER, INK)
    eL += '<circle cx="148" cy="260" r="9.5" fill="%s"/><circle cx="144" cy="255" r="3" fill="%s"/>' % (INK, PAPER)
    eR = OL('M224 332 C230 312 240 300 252 292', 8, ROSE, 3)
    eR += '<circle cx="256" cy="278" r="18" fill="%s" stroke="%s" stroke-width="6"/>' % (PAPER, INK)
    eR += '<circle cx="264" cy="286" r="8" fill="%s"/>' % INK
    if p['lid']:
        eR += P('M238.5 283 A18 18 0 0 1 273.5 273 Z', ROSE, 5)
    # claws
    arm = OL('M132 390 C98 386 74 358 80 322', 20, ROSE, 3.5)
    cl = G(pencil(), 'rotate(8 0 0) translate(0 -6)') if True else ''
    L = arm + G(claw(hold=cl), 'translate(80 308) rotate(-12)')
    squig = P('M62 178 C40 160 72 142 50 122 C36 108 52 94 72 100', 'none', 6, GRAPE)
    squig += ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GRAPE}"/>' for x, y, r in [(84, 108, 3.6), (92, 119, 2.6), (96, 131, 1.8)])
    L += squig
    armR = OL('M290 402 C316 410 338 396 342 374', 15, ROSE, 3)
    R = armR + G(claw(), 'translate(342 362) rotate(24) scale(.62)')
    o += G(lg, p['legs'])
    o += G(body + face, p['body'])
    o += G(eL, p['eyeL']) + G(eR, p['eyeR'])
    o += G(L, p['clawL']) + G(R, p['clawR'])
    return o

if __name__ == '__main__':
    save('r3-5.svg', doc(build()))
    import tuck_rest
    png('r3-5.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/t.png')
