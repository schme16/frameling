# Cuts the raw screen recording to the restart, crops it to the window and adds the captions (H.264, yuv420p).
import os, subprocess, sys
theme = sys.argv[1]
d = f'/tmp/restart-{theme}'
start = int(open(d + '/start.txt').read()) / 1000
marks = dict(l.split() for l in open(d + '/marks.txt').read().strip().splitlines())
m = {k: int(v) / 1000 - start for k, v in marks.items()}
cut = m['asked'] - 0.9
end = m['back'] + 4.0
rel = {k: v - cut for k, v in m.items()}
if 'clicked-restart' in rel:
    # Unsaved work carried across: no save question.
    c = rel['clicked-restart']
    caps = [
        (0, rel['asked'] + 0.2, 'Restart Frameling, with unsaved changes'),
        (rel['asked'] + 0.2, c - 0.1, 'It says once that Undo starts fresh'),
        (c - 0.1, rel['back'] - 0.05, 'No question about saving, nothing is at risk'),
        (rel['back'] - 0.05, end - cut, 'Back as it was, still marked unsaved'),
    ]
else:
    caps = [
        (0, rel['asked'] + 0.2, 'Restart Frameling, from the command palette'),
        (rel['asked'] + 0.2, rel['clicked-save'] - 0.1, 'It asks the same question closing does'),
        (rel['clicked-save'] - 0.1, rel['back'] - 0.05, 'Save, and the window closes'),
        (rel['back'] - 0.05, end - cut, 'It opens again on the same drawing, frame and place'),
    ]
f = ''
for a, b, t in caps:
    f += f",drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='{t}':fontcolor=white:fontsize=30:box=1:boxcolor=black@0.72:boxborderw=14:x=(w-text_w)/2:y=24:enable='between(t,{a:.2f},{b:.2f})'"
kind = 'carry' if 'clicked-restart' in rel else 'restart'
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'../../brand/ab/restart-recent/{kind}-{theme}.mp4')
subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{cut:.2f}', '-t', f'{end-cut:.2f}', '-i', d + '/raw.mp4', '-vf', 'crop=1200:800:180:60' + f + ',fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
print(out, rel)
