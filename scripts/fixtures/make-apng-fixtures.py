#!/usr/bin/env python3
"""Makes the small real animated PNGs in test/fixtures/apng/ and an animated WebP next to them, and for each what Pillow's own
reader says every frame looks like (`<name>.expected.json`: width, height, and per frame the delay in ms and the RGBA bytes as a
hex string). The tests compare Frameling's readers with that. Run from the project folder:
python3 scripts/fixtures/make-apng-fixtures.py. Needs Pillow (with WebP); ffmpeg makes one of the files."""
import json, os, subprocess
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'test', 'fixtures', 'apng')
os.makedirs(OUT, exist_ok=True)

def expected(name, ext='png', out=None, hidden_first=False):
    im = Image.open(os.path.join(OUT, name + '.' + ext))
    frames = []
    # Pillow lists a picture meant only for viewers that cannot animate as frame 0.
    for i in range(1 if hidden_first else 0, getattr(im, 'n_frames', 1)):
        im.seek(i)
        d = im.info.get('duration', 100)
        frames.append({'delay': 100 if d <= 10 else d, 'rgba': im.convert('RGBA').tobytes().hex()})
    with open(os.path.join(OUT, (out or name) + '.expected.json'), 'w') as f:
        json.dump({'width': im.width, 'height': im.height, 'frames': frames}, f)

def blocks():
    # A moving block with soft edges and a see-through background; every frame small, so the file keeps sub-rectangles.
    W, H = 24, 16
    frames = []
    cols = [(255, 0, 0, 255), (0, 200, 0, 200), (0, 0, 255, 128), (250, 200, 0, 255)]
    for i in range(4):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([2 + i * 4, 2 + (i % 2) * 5, 6 + i * 4, 6 + (i % 2) * 5], fill=cols[i])
        d.point([(0, 0)], fill=(255, 255, 255, 255))
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'blocks.png'), save_all=True, append_images=frames[1:], duration=[20, 50, 100, 300], loop=2)
    expected('blocks')

def dispose():
    # Each frame leaves the canvas a different way (none, background, previous). Pillow's own reader mishandles blend-over
    # together with dispose-previous, so blending by over is checked with a hand-made file in the tests instead.
    W, H = 16, 12
    frames = []
    cols = [(255, 0, 0, 255), (0, 200, 0, 160), (0, 0, 255, 255), (250, 200, 0, 120), (255, 0, 255, 255)]
    for i in range(5):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([1 + i * 2, 1 + i, 6 + i * 2, 5 + i], fill=cols[i])
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'dispose.png'), save_all=True, append_images=frames[1:], duration=[100, 100, 100, 100, 100], loop=0,
                   disposal=[0, 1, 2, 0, 1], blend=[0, 0, 0, 0, 0])
    expected('dispose')

def hidden_default():
    # The picture shown by viewers that cannot animate is not part of the animation.
    W, H = 10, 10
    frames = []
    for i in range(3):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(im).rectangle([i * 3, 0, i * 3 + 2, 9], fill=(40 * i + 30, 90, 200, 255))
        frames.append(im)
    first = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    first.save(os.path.join(OUT, 'hidden.png'), save_all=True, default_image=True, append_images=frames, duration=[30, 60, 90], loop=0)
    expected('hidden', hidden_first=True)

def ffmpeg_apng():
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=24x16:rate=10:duration=0.5', '-plays', '0', '-f', 'apng', os.path.join(OUT, 'ffmpeg.png')])
    expected('ffmpeg')

def webp():
    W, H = 20, 14
    frames = []
    for i in range(4):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([i * 4, 2, i * 4 + 3, 9], fill=(255 - i * 60, 50 + i * 40, 120, 255))
        d.point([(19, 13)], fill=(255, 255, 255, 255))
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'blocks.webp'), save_all=True, append_images=frames[1:], duration=[100, 200, 100, 300], loop=0, lossless=True)
    expected('blocks', 'webp', 'blocks-webp')
    # Pillow's WebP reader reports each frame's duration one frame late, so the delays here are the ones written above.
    path = os.path.join(OUT, 'blocks-webp.expected.json')
    data = json.load(open(path))
    for f, d in zip(data['frames'], [100, 200, 100, 300]):
        f['delay'] = d
    json.dump(data, open(path, 'w'))

blocks(); dispose(); hidden_default(); ffmpeg_apng(); webp()
print('done', sorted(os.listdir(OUT)))
