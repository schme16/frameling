from lib import *
from rollo import build
poses = [
 dict(all='translate(10 8)', shell='translate(0 6) translate(244 340) scale(1.04 .86) translate(-244 -340)', head='translate(-30 30) rotate(10 400 340)', tail='translate(0 18)', dust=0,
      hfl='M236 312 C246 336 252 352 256 366', ffl='M318 316 C318 336 318 352 320 366', hl='M200 316 C196 340 192 356 188 370', fl='M348 322 C356 340 362 356 366 370'),
 dict(all='translate(6 -6) rotate(5 250 330)', shell='translate(0 -34)', tail='translate(0 -6) rotate(8 100 320)', dust=1,
      hfl='M236 312 C262 336 288 346 312 346', ffl='M318 316 C340 336 366 340 392 336', hl='M200 316 C176 340 148 352 120 350', fl='M348 322 C376 336 398 350 416 372'),
 dict(all='translate(4 6)', shell='translate(0 -16)', head='translate(4 -6) rotate(-6 400 340)', dust=0,
      hfl='M236 312 C240 340 242 360 244 380', ffl='M318 316 C318 340 318 360 318 380', hl='M200 316 C196 344 194 362 194 380', fl='M348 322 C354 346 358 364 360 380'),
]
save('r3-1-poses.svg', poses_svg(build, poses, ['1  squat, shell down (anticipation)', '2  dash (action)', '3  proud stance (settle)'], tfs=['translate(-6 -6) scale(.76)']*3))
tf = 'translate(256 262) scale(.9) translate(-250 -272)'
save('r3-1-icon.svg', icon_svg(ROSE, build(dict(sop=0, dust=0)), tf))

import math
def art16():
    dome = 'M70 360 C50 230 150 120 250 118 C350 116 430 210 416 360Z'
    o = P(dome, GRAPE, 24)
    for k, (x, top, ang) in enumerate([(130, 250, -12), (200, 190, -5), (270, 175, 3), (340, 215, 10)]):
        o += f'<g transform="rotate({ang} {x} 360)"><rect x="{x-24}" y="{top}" width="48" height="{352-top}" rx="12" fill="{PAPER}" stroke="{INK}" stroke-width="14"/><circle cx="{x}" cy="{top+ (352-top)*(.7-.1*k)}" r="15" fill="{SUN}"/></g>'
    o += P(dome, 'none', 24, INK)
    o += P('M398 270 C420 258 450 276 478 322 C486 336 480 350 466 352 C440 356 410 362 392 388 C372 380 372 300 398 270Z', PEACH, 20)
    o += f'<circle cx="440" cy="322" r="15" fill="{INK}"/>'
    o += P('M360 262 C370 240 384 230 396 226', 'none', 22, INK)
    o += P('M170 368 L160 420 M330 372 L340 420', 'none', 44, INK)
    return o
save('r3-1-icon16.svg', icon_svg(ROSE, art16(), 'translate(256 266) scale(.82) translate(-250 -270)'))
