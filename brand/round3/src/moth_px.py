from lib import *
def make():
    c = Px()
    # left (smooth) wings
    c.blit(['...rrrrrrrrr', '.rrsssssssss', 'rrsssssssssss'[:12], 'rsgggsssssss'[:12], 'rsgbgsssssss'[:12], 'rrsgsssssss s'.replace(' ','')[:12], '.rrsssssssss', '..rrrrsssss.'][:8], 2, 8)
    c.blit(['.rrpppppp', 'rrppppppp', 'rpppgggpp', 'rpppgbgpp', 'rrpppgppp', '.rrrpppp.', '...rrrr..'], 5, 16)
    # right (pixel) wings, dissolving
    c.blit(['rrrrrrrrr...', 'sssssssrrr..', 'sssssssssrr.', 'ssssssssss.r', 'sssssssss.r.', 'sssssssrr...', 'ssssrr.r....'], 18, 8)
    c.blit(['pppppppp.', 'ppppppprr', 'pppppp.r.', 'ppppp.r..', 'pppprr...', 'prrr.....'], 18, 16)
    for x, y, col in [(30,9,'r'),(31,12,'w'),(28,17,'r'),(29,20,'w'),(26,23,'r'),(30,15,'r')]:
        c.px(x, y, col)
    # body
    c.blit(['pppp','pppp','pppp','pppp','pppp','.pp.','.pp.','.pp.'], 14, 12)
    c.blit(['.wwww.', 'wkkwkw', 'wkkwww', '.wwww.'], 13, 7)
    for x, y in [(12,5),(11,4),(10,3),(9,2),(8,2),(18,5),(19,4),(20,3),(21,2),(22,2)]:
        c.px(x, y, 'k')
    # trail frames
    c.blit(['bbbb','bbbb'], 15, 22)
    c.blit(['bbb','bbb'], 16, 26)
    c.blit(['bb'], 16, 30)
    return c.rows()
if __name__ == '__main__':
    save('r3-4-pixel.svg', pixel_svg(make(), PIXPAL))
    png('r3-4-pixel.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/tp.png')
