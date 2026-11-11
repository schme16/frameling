from lib import *
def make():
    c = Px()
    dy = 4
    # legs
    for x in (7, 12):
        c.blit(['pp','pp','kk'], x, 22 + dy)
    # pencils
    tops = [(6,'r',9),(9,'b',6),(12,'s',3),(15,'m',5),(18,'r',7),(21,'b',10)]
    for x, col, top in tops:
        rows = ['ww'] + [col * 2] * (15 - top + 1)
        c.blit(rows, x, top + dy - 1)
    dome = ['..gggggggggggggggg..', '.gggggggggggggggggg.', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', '.gggggggggggggggggg.']
    c.blit(['..pppppppppppppp..'], 5, 21 + dy)
    c.blit(dome, 4, 14 + dy)
    c.blit(['pp','pp','kk'], 19, 22 + dy)
    c.blit(['pp','pp','kk'], 24, 22 + dy)
    c.blit(['.pp......', 'prppp....', 'pppppppp.', 'ppkpppppk', 'pppppppp.', '.pppppp..'], 22, 16 + dy)
    return c.rows()
if __name__ == '__main__':
    save('r3-3-pixel.svg', pixel_svg(make(), PIXPAL))
    png('r3-3-pixel.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/tp.png')
