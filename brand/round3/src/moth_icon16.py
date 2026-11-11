from lib import *
from moth import *
def art16():
    o = ''
    # right pixel wing: big squares
    cells = [(300,150),(340,150),(380,150),(320,190),(360,190),(400,190),(300,230),(340,230),(380,230),(320,270),(360,270),(310,310),(350,310),(330,350)]
    for i, (x, y) in enumerate(cells):
        o += f'<rect x="{x}" y="{y}" width="40" height="40" fill="{[SUN, SUN, ROSE, SUN, ROSE, ROSE, PEACH, PEACH, ROSE, PEACH, ROSE, ROSE, ROSE, ROSE][i]}" stroke="{INK}" stroke-width="11"/>'
    o += P('M236 214 C196 120 96 100 56 150 C34 190 80 270 160 270 C200 270 228 246 236 214Z', SUN, 20)
    o += P('M240 262 C190 256 126 296 124 356 C124 410 190 418 224 366 C242 336 248 296 240 262Z', PEACH, 20)
    o += P('M236 190 C250 150 300 150 306 200 C312 260 296 320 280 350 C268 360 254 350 248 336 C232 300 226 240 236 190Z', PEACH, 18)
    o += f'<ellipse cx="264" cy="172" rx="38" ry="40" fill="{PAPER}" stroke="{INK}" stroke-width="18"/>'
    o += f'<circle cx="252" cy="172" r="15" fill="{INK}"/><circle cx="288" cy="170" r="11" fill="{INK}"/>'
    o += P('M250 130 C230 90 200 70 180 66 M280 130 C300 96 330 72 350 66', 'none', 14, INK)
    return o
save('r3-4-icon16.svg', icon_svg(SKY, art16(), 'translate(256 256) scale(.92) rotate(-10) translate(-252 -250)'))
