from lib import *
def make():
    c = Px()
    dy = 1
    # far legs
    for x in (10, 20):
        c.blit(['pp','pp'], x, 20 + dy)
    c.blit(['..pp', 'pppp', 'pp..'], 0, 15 + dy)
    shell = ['....gggggggggggg....', '..gggggggggggggggg..', '.gggggggggggggggggg.', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', 'gggggggggggggggggggg', '.gggggggggggggggggg.']
    c.blit(shell, 3, 10 + dy)
    # windows
    wins = [(5, 13, 'low'), (9, 12, 'mid'), (13, 12, 'mid'), (17, 13, 'low')]
    suns = [16, 14, 13, 15]
    for (x, top, _), sy in zip(wins, suns):
        for y in range(top, 18):
            c.px(x, y + dy, 'w'); c.px(x + 1, y + dy, 'w')
        c.px(x, sy + dy, 's'); c.px(x + 1, sy + dy, 's'); c.px(x, sy - 1 + dy, 's'); c.px(x + 1, sy - 1 + dy, 's')
    # near legs
    for x, w in ((7, 3), (13, 3), (19, 3), (24, 3)):
        c.blit(['pp.', 'pp.', 'ppp'], x, 20 + dy)
    c.blit(['pp', 'pr', 'pr'], 27, 13 + dy)
    c.blit(['.gggggp..', 'ggggpppp.', 'ppppkpppp', 'pppppppp.', '.ppppppwk', '..pppp...'], 22, 15 + dy)
    # dust
    for x, y in [(2,27),(1,25),(4,28)]: c.px(x, y + dy - 3, 'w')
    return c.rows()
if __name__ == '__main__':
    save('r3-1-pixel.svg', pixel_svg(make(), PIXPAL))
    png('r3-1-pixel.svg', 512, '/tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-apps-interactives/a0b3fe65-bb60-49dd-b0e6-8283b919974a/scratchpad/r3/tp.png')
