#!/usr/bin/env python3
"""Makes the small real GIFs in test/fixtures/gif/ and, next to each, what Pillow's own reader says every frame looks like
(`<name>.expected.json`: width, height, and per frame the delay in ms and the RGBA bytes as a hex string). The tests
compare Frameling's GIF reader with that. Run from the project folder: python3 scripts/fixtures/make-gif-fixtures.py
Needs Pillow; ImageMagick (`convert`) and ffmpeg make two of the files."""
import json, os, subprocess
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'test', 'fixtures', 'gif')
os.makedirs(OUT, exist_ok=True)

def expected(name):
    im = Image.open(os.path.join(OUT, name + '.gif'))
    frames = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        # Pillow's own delay is in ms; browsers show 0 and 10 ms as 100 ms.
        d = im.info.get('duration', 100)
        frames.append({'delay': 100 if d <= 10 else d, 'rgba': im.convert('RGBA').tobytes().hex()})
    with open(os.path.join(OUT, name + '.expected.json'), 'w') as f:
        json.dump({'width': im.width, 'height': im.height, 'frames': frames}, f)

def disposal():
    # A bouncing 4x4 block with transparency, each frame leaving the screen a different way.
    W, H = 16, 12
    frames = []
    cols = [(255, 0, 0, 255), (0, 200, 0, 255), (0, 0, 255, 255), (250, 200, 0, 255)]
    for i in range(4):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([2 + i * 3, 2 + (i % 2) * 4, 5 + i * 3, 5 + (i % 2) * 4], fill=cols[i])
        d.point([(0, 0)], fill=(255, 255, 255, 255))
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'disposal.gif'), save_all=True, append_images=frames[1:], duration=[20, 50, 100, 30], loop=3,
                   disposal=[1, 2, 3, 0], transparency=0, optimize=False)
    expected('disposal')

def solid_frames():
    # Frames that each fill the picture with an opaque pattern: tests palette handling and the default delay.
    W, H = 20, 10
    frames = []
    for i in range(3):
        im = Image.new('RGB', (W, H), (i * 80, 40, 200 - i * 60))
        d = ImageDraw.Draw(im)
        d.line([(0, i), (W - 1, H - 1 - i)], fill=(255, 255, 255))
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'solid.gif'), save_all=True, append_images=frames[1:], duration=[0, 10, 200], loop=0)
    expected('solid')

def interlaced():
    # A busy picture so the LZW codes grow to the full 12 bits, written interlaced by ImageMagick.
    W, H = 64, 48
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = ((x * 37 + y * 11) % 256, (x * y) % 256, (x ^ y) * 5 % 256)
    png = os.path.join(OUT, '_tmp.png')
    im.save(png)
    subprocess.check_call(['convert', png, '-interlace', 'GIF', '-colors', '200', os.path.join(OUT, 'interlaced.gif')])
    os.remove(png)
    expected('interlaced')

def ffmpeg_gif():
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=24x16:rate=10:duration=0.5', os.path.join(OUT, 'ffmpeg.gif')])
    expected('ffmpeg')

disposal(); solid_frames(); interlaced(); ffmpeg_gif()
print('done', sorted(os.listdir(OUT)))
