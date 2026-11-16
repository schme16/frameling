"""Draws the before/after lip sync clip from frames.json and line.wav (see ab_data.mjs) and encodes it as H.264 + AAC.
  python3 scripts/lipsync/ab_clip.py <data_dir> <out.mp4> [--silent] [--truth-label "Said (estimated)"] [--still 42]
Four talking mouths side by side (what was said, the old guess, the new guess, the new guess with the words typed in),
each with a strip of the mouth on every frame around the playhead, so timing can be judged by eye and by ear.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

data_dir, out = sys.argv[1], sys.argv[2]
argv = sys.argv[3:]
silent = '--silent' in argv
flag = lambda n, d: argv[argv.index(n) + 1] if n in argv else d
truth_label = flag('--truth-label', 'Said (the true mouths)')
still = int(flag('--still', 42))
d = json.load(open(os.path.join(data_dir, 'frames.json')))
fps, frames = d['fps'], d['frames']
W, H = 1280, 520
PW = 296
BG, PANEL, INK, MUTED = (24, 26, 33), (36, 39, 50), (236, 238, 244), (150, 156, 172)
SKIN, LIP, DARK, TEETH, TONGUE = (247, 199, 160), (196, 84, 96), (74, 22, 36), (252, 252, 250), (232, 112, 128)
font = lambda s, b=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if b else ''), s)
LABEL = {'rest': 'Rest', 'A': 'A I', 'E': 'E', 'O': 'O', 'U': 'U', 'MBP': 'M B P', 'FV': 'F V', 'L': 'L', 'WQ': 'W Q', 'etc': 'etc'}
MOUTHS = list(LABEL)
hue = lambda i: [(70, 74, 90), (244, 162, 97), (233, 196, 106), (138, 177, 125), (42, 157, 143), (38, 70, 83), (157, 129, 190), (214, 120, 170), (96, 165, 220), (150, 150, 150)][i]

def mouth(dr, cx, cy, m):
    def oval(w, h, fill=DARK, outline=LIP, width=8):
        dr.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=fill, outline=outline, width=width)
    if m == 'rest':
        dr.arc([cx - 60, cy - 26, cx + 60, cy + 22], 20, 160, fill=LIP, width=9)
    elif m == 'MBP':
        dr.rounded_rectangle([cx - 56, cy - 8, cx + 56, cy + 10], 8, fill=LIP)
        dr.line([cx - 52, cy + 1, cx + 52, cy + 1], fill=DARK, width=3)
    elif m == 'A':
        oval(108, 104); dr.ellipse([cx - 34, cy + 8, cx + 34, cy + 44], fill=TONGUE)
    elif m == 'E':
        dr.rounded_rectangle([cx - 78, cy - 24, cx + 78, cy + 24], 22, fill=DARK, outline=LIP, width=8)
        dr.rectangle([cx - 62, cy - 16, cx + 62, cy - 2], fill=TEETH)
    elif m == 'O':
        oval(70, 82)
    elif m == 'U':
        oval(44, 50)
    elif m == 'WQ':
        oval(52, 52, width=12)
    elif m == 'FV':
        dr.rounded_rectangle([cx - 62, cy - 22, cx + 62, cy + 26], 18, fill=DARK, outline=LIP, width=8)
        dr.rectangle([cx - 46, cy - 14, cx + 46, cy + 4], fill=TEETH)
        dr.rounded_rectangle([cx - 52, cy + 4, cx + 52, cy + 22], 8, fill=LIP)
    elif m == 'L':
        oval(96, 58); dr.ellipse([cx - 22, cy - 16, cx + 22, cy + 6], fill=TONGUE)
    else:  # etc
        dr.rounded_rectangle([cx - 66, cy - 22, cx + 66, cy + 24], 18, fill=DARK, outline=LIP, width=8)
        dr.rectangle([cx - 52, cy - 14, cx + 52, cy - 2], fill=TEETH); dr.rectangle([cx - 52, cy + 4, cx + 52, cy + 14], fill=TEETH)

PANELS = [(truth_label, d['truth']), ('Before', d['before']), ('After', d['after']), ('After + words', d['afterText'])]
acc = [sum(1 for a, b in zip(g, d['truth']) if a == b) / frames for _, g in PANELS]
tmp = tempfile.mkdtemp()
for f in range(frames):
    im = Image.new('RGB', (W, H), BG)
    dr = ImageDraw.Draw(im)
    dr.text((24, 14), d['text'], font=font(15), fill=MUTED)
    for p, (title, seq) in enumerate(PANELS):
        x0 = 24 + p * (PW + 12)
        dr.rounded_rectangle([x0, 48, x0 + PW, H - 24], 14, fill=PANEL)
        dr.text((x0 + 14, 60), title, font=font(17, True), fill=INK)
        if p: dr.text((x0 + PW - 14, 62), '%d%% right' % round(acc[p] * 100), font=font(14), fill=MUTED, anchor='ra')
        cx, cy = x0 + PW // 2, 215
        dr.ellipse([cx - 112, cy - 110, cx + 112, cy + 120], fill=SKIN)
        dr.ellipse([cx - 52, cy - 70, cx - 32, cy - 44], fill=DARK); dr.ellipse([cx + 32, cy - 70, cx + 52, cy - 44], fill=DARK)
        mouth(dr, cx, cy + 40, seq[f])
        dr.text((cx, 352), LABEL[seq[f]], font=font(22, True), fill=INK, anchor='ma')
        # Strip: the frames around the playhead.
        n = 13
        cw = (PW - 28) / n
        for k in range(n):
            g = f - 6 + k
            if g < 0 or g >= frames: continue
            m = seq[g]
            x = x0 + 14 + k * cw
            dr.rectangle([x + 1, 400, x + cw - 1, 440], fill=hue(MOUTHS.index(m)))
            dr.text((x + cw / 2, 420), '' if m == 'rest' else LABEL[m].replace(' ', '')[:3], font=font(10, True), fill=(20, 20, 24) if m in ('A', 'E', 'O', 'L', 'etc') else (250, 250, 250), anchor='mm')
        dr.rectangle([x0 + 14 + 6 * cw - 1, 396, x0 + 14 + 7 * cw + 1, 444], outline=INK, width=2)
        # Show where it differs from the truth.
        if p:
            for k in range(n):
                g = f - 6 + k
                if 0 <= g < frames and seq[g] != d['truth'][g]:
                    x = x0 + 14 + k * cw
                    dr.rectangle([x + cw / 2 - 3, 448, x + cw / 2 + 3, 454], fill=(244, 114, 114))
    im.save(os.path.join(tmp, 'f%04d.png' % f))
audio = [] if silent else ['-i', os.path.join(data_dir, 'line.wav')]
sound = ['-an'] if silent else ['-c:a', 'aac', '-b:a', '128k', '-shortest']
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'f%04d.png'), *audio,
                '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', *sound, '-movflags', '+faststart', out], check=True)
subprocess.run(['cp', os.path.join(tmp, 'f%04d.png' % still), out.replace('.mp4', '-still.png')], check=True)
print('wrote', out)
