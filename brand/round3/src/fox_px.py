from lib import *
def make():
    c = Px()
    # legs behind
    for x in (10, 14):
        c.blit(['pp','pp','pp','kk'], x, 25)
    # tail cells
    c.blit(['wwww','wrww','wwww'], 5, 17)
    c.blit(['wwww','wgww','wwww'], 3, 13)
    c.blit(['wwww','wbww','wwww'], 2, 9)
    c.blit(['wwww','wmww','wwww'], 3, 5)
    c.blit(['wwww','wsww','wwww'], 8, 2)
    c.blit(['wwww','wwww','wwww'], 13, 1)
    c.blit(['..ppppppppp..', '.ppppppppppp.', 'ppppppppppppp', 'pppppppppwwpp', 'pppppppppwwwp', '.ppppppppwwp.', '..pppppppp...'], 9, 18)
    for x in (19, 23):
        c.blit(['pp','pp','pp','kk'], x, 25)
    c.blit(['..pp.....pp..', '.pprp...pprp.', '.pprpppppprp.', 'ppppppppppppp', 'pppkpppppkppp', 'pppkpppppkppp', 'wppppppwwwwwk', '.wwpppwwwwwwp', '..wwwwwwwww..'], 18, 10)
    c.px(30, 17, 'r'); c.px(30, 18, 'r')
    return c.rows()
if __name__ == '__main__':
    save('r3-2-pixel.svg', pixel_svg(make(), PIXPAL))
    png('r3-2-pixel.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/tp.png')
