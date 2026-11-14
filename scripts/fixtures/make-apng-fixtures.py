#!/usr/bin/env python3
"""Makes the small real animated PNGs in test/fixtures/apng/ and an animated WebP next to them, and for each what Pillow's own
reader says every frame looks like (`<name>.expected.json`: width, height, and per frame the delay in ms and the RGBA bytes as a
hex string). The tests compare Frameling's readers with that. Run from the project folder:
python3 scripts/fixtures/make-apng-fixtures.py. Needs Pillow (with WebP); ffmpeg makes one of the files."""
import json, os, struct, subprocess, zlib
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

def webp_lossy():
    # Lossy frames with alpha (an ALPH chunk next to each VP8 one), and a moving soft-edged block so frames blend over each other.
    W, H = 40, 28
    frames = []
    for i in range(4):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse([2 + i * 7, 4, 14 + i * 7, 18], fill=(255 - i * 60, 90 + i * 40, 140 - i * 20, 160 + i * 30))
        frames.append(im)
    frames[0].save(os.path.join(OUT, 'lossy.webp'), save_all=True, append_images=frames[1:], duration=[80, 120, 80, 200], loop=3, lossless=False, quality=95, method=4, minimize_size=False)
    expected('lossy', 'webp', 'lossy-webp')
    data = json.load(open(os.path.join(OUT, 'lossy-webp.expected.json')))
    for f, d in zip(data['frames'], [80, 120, 80, 200]):
        f['delay'] = d
    json.dump(data, open(os.path.join(OUT, 'lossy-webp.expected.json'), 'w'))

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

ADAM7 = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]

def chunks_of(data):
    at, out = 8, []
    while at < len(data):
        n = struct.unpack('>I', data[at:at + 4])[0]
        out.append((data[at + 4:at + 8].decode(), data[at + 8:at + 8 + n]))
        at += 12 + n
    return out

def png_chunk(t, d):
    return struct.pack('>I', len(d)) + t.encode() + d + struct.pack('>I', zlib.crc32(t.encode() + d) & 0xffffffff)

def unfilter_rgba(raw, w, h):
    # Pillow writes 8-bit RGBA: undo its row filters (Sub, Up, Average, Paeth too).
    s = w * 4
    rows = []
    prev = bytearray(s)
    for y in range(h):
        f = raw[y * (s + 1)]
        cur = bytearray(raw[y * (s + 1) + 1:(y + 1) * (s + 1)])
        for i in range(s):
            a = cur[i - 4] if i >= 4 else 0
            b = prev[i]
            c = prev[i - 4] if i >= 4 else 0
            if f == 1: cur[i] = (cur[i] + a) & 255
            elif f == 2: cur[i] = (cur[i] + b) & 255
            elif f == 3: cur[i] = (cur[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(cur)
        prev = cur
    return rows

def adam7_rgba(rows, w, h):
    # The same picture as seven passes, each row filtered with Sub (odd rows) or Up (even rows) so both are exercised.
    out = bytearray()
    for x0, y0, dx, dy in ADAM7:
        pw, ph = -(-(w - x0) // dx), -(-(h - y0) // dy)
        if pw <= 0 or ph <= 0: continue
        prev = bytearray(pw * 4)
        for j in range(ph):
            row = bytearray()
            for i in range(pw): row += rows[y0 + j * dy][(x0 + i * dx) * 4:(x0 + i * dx) * 4 + 4]
            if j % 2:
                out.append(1); out += bytes((row[k] - (row[k - 4] if k >= 4 else 0)) & 255 for k in range(len(row)))
            else:
                out.append(2); out += bytes((row[k] - prev[k]) & 255 for k in range(len(row)))
            prev = row
    return bytes(out)

def interlaced_apng():
    # blocks.png with every frame stored as Adam7 interlaced (flag set in the header): no encoder writes these, so it is
    # rebuilt here, and Pillow (libpng) is the judge of what it shows.
    src = open(os.path.join(OUT, 'blocks.png'), 'rb').read()
    out = bytearray(src[:8])
    frame = None
    for t, d in chunks_of(src):
        if t == 'IHDR': d = d[:12] + b'\x01'
        if t == 'fcTL': frame = (struct.unpack('>I', d[4:8])[0], struct.unpack('>I', d[8:12])[0])
        if t in ('IDAT', 'fdAT'):
            seq = d[:4] if t == 'fdAT' else b''
            raw = zlib.decompress(d[4:] if t == 'fdAT' else d)
            w, h = frame
            d = seq + zlib.compress(adam7_rgba(unfilter_rgba(raw, w, h), w, h))
        out += png_chunk(t, d)
    open(os.path.join(OUT, 'interlaced.png'), 'wb').write(out)
    # Pillow cannot read interlaced animated PNG, so ffmpeg (libavcodec's png decoder) judges: its frames must be the plain file's.
    b = json.load(open(os.path.join(OUT, 'blocks.expected.json')))
    raw = subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(OUT, 'interlaced.png'), '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
    size = b['width'] * b['height'] * 4
    assert len(raw) == size * len(b['frames']), (len(raw), size, len(b['frames']))
    for i, f in enumerate(b['frames']):
        assert raw[i * size:(i + 1) * size].hex() == f['rgba'], 'frame %d: ffmpeg reads the interlaced copy differently from the plain one' % i
    json.dump(b, open(os.path.join(OUT, 'interlaced.expected.json'), 'w'))

def interlaced_stills():
    # Real encoder (ImageMagick) writing Adam7 pictures of odd sizes, in the kinds PNG has: RGBA, 2- or 4-bit palette, grey 16-bit, 1-bit.
    subprocess.check_call(['convert', '-size', '37x23', 'gradient:red-blue', '-alpha', 'set', '-channel', 'A', '-evaluate', 'multiply', '0.7', '+channel', '-interlace', 'PNG', 'PNG32:' + os.path.join(OUT, 'interlaced-rgba.png')])
    subprocess.check_call(['convert', 'rose:', '-resize', '29x19!', '-colors', '4', '-define', 'png:color-type=3', '-interlace', 'PNG', 'PNG:' + os.path.join(OUT, 'interlaced-pal.png')])
    subprocess.check_call(['convert', 'rose:', '-resize', '21x13!', '-colorspace', 'Gray', '-depth', '16', '-interlace', 'PNG', 'PNG:' + os.path.join(OUT, 'interlaced-gray16.png')])
    # The same grey picture without interlacing: Pillow turns 16-bit grey into RGBA by clipping, so the twin is the judge here.
    subprocess.check_call(['convert', 'rose:', '-resize', '21x13!', '-colorspace', 'Gray', '-depth', '16', 'PNG:' + os.path.join(OUT, 'plain-gray16.png')])
    subprocess.check_call(['convert', 'rose:', '-resize', '19x11!', '-monochrome', '-interlace', 'PNG', 'PNG:' + os.path.join(OUT, 'interlaced-mono.png')])
    for n in ['rgba', 'pal', 'gray16', 'mono']:
        b = open(os.path.join(OUT, 'interlaced-%s.png' % n), 'rb').read()
        ihdr = chunks_of(b)[0][1]
        print('interlaced-%s: %dx%d depth %d type %d interlace %d' % (n, *struct.unpack('>II', ihdr[:8]), ihdr[8], ihdr[9], ihdr[12]))
        assert ihdr[12] == 1
        if n != 'gray16': expected('interlaced-' + n)

blocks(); dispose(); hidden_default(); ffmpeg_apng(); webp(); interlaced_apng(); interlaced_stills(); webp_lossy()
print('done', sorted(os.listdir(OUT)))
