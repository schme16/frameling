from lib import *
from quill import build
SQ = 'translate(236 380) scale(1.04 .84) translate(-236 -380)'
poses = [
 dict(all='translate(10 30)', quills=dict(lenscale=1.14, spread=.1), body=SQ, face='translate(-34 26) rotate(12 350 300)', eye='closed',
      hf='M214 380 C216 392 222 398 228 402', hn='M164 372 C160 388 156 396 150 402', ff='M326 372 C328 386 332 394 338 400', fn='M366 366 C372 380 380 390 392 396', shadow='translate(0 -30)'),
 dict(all='translate(18 -14) rotate(-5 236 300)', quills=dict(lenscale=.92, spread=-.06, lean=16), face='translate(14 -8) rotate(-8 350 300)',
      hf='M214 380 C230 394 252 398 270 394', hn='M164 372 C140 386 116 388 94 378', ff='M326 372 C348 382 372 380 392 368', fn='M366 366 C392 372 414 364 432 350', shadow='translate(30 14) scale(.8)', sop=.08),
 dict(all='translate(18 8)', quills=dict(lenscale=.9, spread=-.08), face='translate(0 -6) rotate(-14 350 320)', eye='closed'),
]
save('r3-3-poses.svg', poses_svg(build, poses, ['1  bristle up (anticipation)', '2  scamper (action)', '3  sniff, content (settle)'], tfs=['translate(14 -4) scale(.78)','translate(0 -4) scale(.78)','translate(0 -4) scale(.78)']))
tf = 'translate(256 252) scale(.92) translate(-250 -250)'
save('r3-3-icon.svg', icon_svg(SUN, build(dict(sop=0, all='translate(18 8)')), tf))

import math
def art16():
    o = ''
    for a, L, col in [(200,150,ROSE),(232,196,SKY),(262,214,SUN),(292,190,MINT),(322,140,ROSE)]:
        ar = math.radians(a)
        bx, by = 236 + 120*math.cos(ar), 300 + 96*math.sin(ar)
        w = 20
        d = f'M-20 {-w} L{L-44} {-w} L{L} 0 L{L-44} {w} L-20 {w}Z'
        o += f'<g transform="translate({bx:.0f} {by:.0f}) rotate({a-263+270-270+ (a-263)*0.0:.0f})"></g>'
        rot = a
        o += f'<g transform="translate({bx:.0f} {by:.0f}) rotate({rot})">' + P(d, col, 20) + P(f'M{L-44} {-w} L{L} 0 L{L-44} {w}Z', PAPER, 12) + '</g>'
    o += P('M96 372 C80 270 140 190 236 184 C318 180 366 226 372 290 C366 340 340 372 300 378 C240 388 150 388 96 372Z', GRAPE, 22)
    o += P('M340 262 C366 244 396 262 430 318 C440 332 434 344 420 348 C396 358 364 358 344 346 C330 326 326 290 340 262Z', PEACH, 22)
    o += f'<circle cx="388" cy="302" r="16" fill="{INK}"/><ellipse cx="438" cy="326" rx="16" ry="13" fill="{INK}"/>'
    o += P('M170 380 L160 420 M300 380 L310 420', 'none', 40, INK)
    return o
save('r3-3-icon16.svg', icon_svg(SUN, art16(), 'translate(256 262) scale(.8) translate(-250 -272)'))
