from lib import *
from tuck import build
import tuck_px
SQ = 'translate(0 442) scale(1.05 .94) translate(0 -442)'
AN = 'translate(0 442) scale(1.06 .82) translate(0 -442)'
poses = [
 dict(frame='translate(334 252) rotate(-20)', body=AN, eyeL='translate(4 30)'+' '+AN, eyeR='translate(-4 30) '+AN, legs=AN, clawL='translate(0 20) rotate(40 130 388)', clawR='rotate(-24 290 400)', lid=1),
 dict(frame='translate(344 170) rotate(5)', body='translate(10 -40) rotate(6 200 380)', eyeL='translate(10 -40) rotate(6 200 380)', eyeR='translate(10 -40) rotate(6 200 380)', legs='translate(12 -34) rotate(12 200 440)', clawL='translate(10 -40) rotate(-28 130 388)', clawR='translate(10 -40) rotate(-34 290 400)', shadow='translate(212 480) scale(.78) translate(-212 -480)', sop=.09),
 dict(frame='translate(318 226) rotate(-4)', body=SQ, eyeL=SQ, eyeR=SQ, legs=SQ, clawL='rotate(16 130 388)', clawR='', lid=0),
]
save('r3-5-poses.svg', poses_svg(build, poses, tfs=[None,'translate(22 0) scale(.72)',None], labels=['1  tuck in (anticipation)', '2  scuttle hop (action)', '3  ta-da (settle)']))
# icon (full)
tf = 'translate(256 262) scale(.9) translate(-216 -278)'
save('r3-5-icon.svg', icon_svg(MINT, build(), tf))
# icon16: chunky
def art16():
    s = G(P('M0 0 H0'), '')
    fr = G(P('M-110 -135 L110 -135 L110 135 L-110 135Z', SUN, 30) + P('M-62 -88 L62 -88 L62 88 L-62 88Z', SKY, 24) + f'<circle cx="22" cy="-44" r="26" fill="{SUN}"/>' + P('M-62 88 L-62 30 C-30 6 6 30 24 60 L62 50 L62 88Z', MINT, 0), 'translate(300 232) scale(.9) rotate(-8)')
    body = P('M60 392 C56 330 110 300 190 304 C270 308 330 340 322 396 C318 440 250 456 190 456 C120 456 64 440 60 392Z', ROSE, 30)
    eyes = ''
    for cx, cy, r in [(130, 292, 44), (236, 280, 40)]:
        eyes += P(f'M{cx} {cy+r} L{cx-8} 330', 'none', 26, INK)
    eyes += f'<circle cx="130" cy="280" r="44" fill="{PAPER}" stroke="{INK}" stroke-width="24"/><circle cx="118" cy="270" r="17" fill="{INK}"/>'
    eyes += f'<circle cx="238" cy="268" r="40" fill="{PAPER}" stroke="{INK}" stroke-width="24"/><circle cx="250" cy="278" r="16" fill="{INK}"/>'
    claw = P('M110 390 C60 380 44 330 56 290', 'none', 34, INK) + P('M110 390 C60 380 44 330 56 290', 'none', 14, ROSE)
    mouth = P('M150 392 C170 410 214 406 232 380', 'none', 18, INK)
    return fr + claw + body + mouth + eyes
save('r3-5-icon16.svg', icon_svg(MINT, art16(), 'translate(256 262) scale(.98) translate(-216 -290)'))
