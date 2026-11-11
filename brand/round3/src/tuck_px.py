from lib import *
def make():
    c = Px()
    # legs
    for x, y in [(6,28),(5,29),(4,30),(9,28),(8,29),(8,30),(14,28),(15,29),(15,30),(17,28),(18,29),(19,30)]:
        c.px(x, y, 'k')
    # frame
    fr = []
    for j in range(19):
        row = ''
        for i in range(14):
            if i in (0, 13) or j in (0, 18): ch = 'k'
            elif i in (1, 12) or j in (1, 17): ch = 's'
            elif i in (2, 11) or j in (2, 16): ch = 'k'
            else: ch = 'b'
            row += ch
        fr.append(row)
    c.blit(fr, 18, 1, outline=False)
    for x, y in [(22,6),(23,6),(24,6),(23,5)]: c.px(x, y, 'w')
    for x, y in [(26,5),(27,5),(26,6),(27,6)]: c.px(x, y, 's')
    for y, x1 in [(12,23),(13,25),(14,28),(15,28),(16,28)]:
        for x in range(21, x1 + 1): c.px(x, y, 'm')
    for x, y in [(22,14),(23,13),(24,14),(25,13)]: c.px(x, y, 'g')
    # pencil
    c.blit(['w','b','b','b','b','b','b','b','b'], 2, 9)
    # claw L + arm
    c.blit(['rrr.rr','rrrrrr','rrrrrr','.rrrr.'], 1, 16)
    c.blit(['rr','rr','rr'], 2, 20)
    # stalks
    c.px(6, 18, 'k'); c.px(6, 19, 'k'); c.px(6, 20, 'k'); c.px(14, 19, 'k'); c.px(14, 20, 'k')
    c.blit(['wwww','wkkw','wkkw','wwww'], 5, 14)
    c.blit(['rrrr','wwkk','wwkk','wwww'], 13, 15)
    # body
    c.blit(['..rrrrrrrrrr..', '.rwrrrrrrrrrr.', 'rrrrrrrrrrrrrr', 'rrrrkrrrrrkrrr', 'rrrrrkkkkkrrrr', '.rrrrrrrrrrrr.', '..rrrrrrrrrr..'], 5, 21)
    # claw R
    c.blit(['r.r', 'rrr', '.r.'], 20, 21)
    c.px(19, 23, 'r'); c.px(19, 24, 'r')
    # squiggle
    for x, y in [(2,6),(1,5),(2,4),(3,3),(4,3),(5,4),(5,6),(7,7),(9,5)]: c.px(x, y, 'g')
    return c.rows()
if __name__ == '__main__':
    save('r3-5-pixel.svg', pixel_svg(make(), PIXPAL))
    png('r3-5-pixel.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/tp.png')
