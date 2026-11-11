from lib import *
from moth import build
def sk(x, y, d, sx=1):
    return f'translate({x} {y}) skewY({d}) scale({sx} 1) translate({-x} {-y})'
poses = [
 dict(LF=sk(244,212,40,.82), LH=sk(242,254,30,.82), RF=sk(296,212,-40,.82), RH=sk(298,254,-30,.82), tilt='rotate(-3 270 250) translate(0 14)', ntrail=0),
 dict(LF=sk(244,212,-22), LH=sk(242,254,-16), RF=sk(296,212,22), RH=sk(298,254,16), tilt='translate(10 -28) rotate(-20 270 250)', ntrail=3, sleepy=0),
 dict(LF=sk(244,212,8,.72), LH=sk(242,254,6,.72), RF=sk(296,212,-8,.72), RH=sk(298,254,-6,.72), tilt='translate(0 6) rotate(5 270 250)', ntrail=1),
]
save('r3-4-poses.svg', poses_svg(build, poses, ['1  wings up (anticipation)', '2  downstroke, trailing frames (action)', '3  hover, wings soft (settle)'], tfs=['translate(4 0) scale(.78)','translate(-22 0) scale(.78)','translate(4 0) scale(.78)']))
tf = 'translate(256 252) scale(.92) translate(-262 -262)'
save('r3-4-icon.svg', icon_svg(SKY, build(dict(ntrail=2)), tf))
