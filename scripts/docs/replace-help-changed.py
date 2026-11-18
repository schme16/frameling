# Compares a fresh run of the help media with public/help and copies over only the files that really changed. A tolerant
# comparison, because a run has some noise (scrollbar edges, stamp jitter, clip timing): both pictures are blurred before they are
# compared, so a one pixel shift is nothing and a real difference is a lot, looked at region by region for a full window picture:
# the tool rail (left), the right hand panels, the menu bar, and the middle. The middle alone is only a "maybe": it is left
# unless --middle is given, and listed so it can be looked at. A clip is judged by its poster and by frames sampled from the
# video. Prints what it replaced and what it left, and writes the same as JSON to --report.
# --decisions file.json is a map { file: { v: 'leave' | 'replace', why } } of what was settled by eye: a 'leave' is left, with its reason.
#   python3 scripts/docs/replace-help-changed.py <fresh dir> public/help [--dry] [--middle] [--report file.json] [--decisions file.json]
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageFilter

args = [a for a in sys.argv[1:] if not a.startswith('--')]
fresh, old = args[0], args[1]
dry = '--dry' in sys.argv
middle_too = '--middle' in sys.argv
report = None
if '--report' in sys.argv:
    report = sys.argv[sys.argv.index('--report') + 1]
    args = [a for a in args if a != report]
decisions = {}
if '--decisions' in sys.argv:
    dfile = sys.argv[sys.argv.index('--decisions') + 1]
    args = [a for a in args if a != dfile]
    decisions = json.load(open(dfile))

LEVEL = 25        # how far apart two blurred pixels must be (0 to 255, as grey) to count as different
BLUR = 3          # the blur that takes out edge jitter and a one pixel shift, so only real differences are left
MIN_BLOB = 250    # differing pixels in a region for it to count as changed (noise comes to under 250, real changes to 1000 or more)
BORDER = 3000     # a change under this is called borderline in the report, to be looked at by eye
FULL = {(800, 500), (800, 478), (800, 469)}  # a whole window, scaled to 800 wide


def blobs(a, b, box=None):
    """Pixels that differ for real in the box: both blurred, then the difference thresholded."""
    if box:
        a, b = a.crop(box), b.crop(box)
    a, b = a.filter(ImageFilter.GaussianBlur(BLUR)), b.filter(ImageFilter.GaussianBlur(BLUR))
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > LEVEL else 0)
    return sum(1 for v in d.getdata() if v)


def regions(a):
    w, h = a.size
    if (w, h) in FULL:
        s = w / 1280
        return {
            'rail': (0, int(45 * s), int(140 * s), h),
            'right': (int(885 * s), int(45 * s), w, h - int(28 * s)),
            'menubar': (int(140 * s), 0, int(885 * s), int(45 * s)),
            'middle': (int(140 * s), int(45 * s), int(885 * s), h - int(28 * s)),
        }
    return {'all': (0, 0, w, h)}


def compare(a, b):
    """{region: pixels} for the regions that differ, or the string 'size' when the pictures aren't the same size."""
    if a.size != b.size:
        return 'size'
    return {k: n for k, box in regions(a).items() if (n := blobs(a, b, box)) >= MIN_BLOB}


def frames(mp4, n=3):
    """n frames sampled evenly from a clip, as images."""
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).strip() or 0)
    out = []
    with tempfile.TemporaryDirectory() as t:
        for i in range(n):
            p = f'{t}/f{i}.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{dur * (i + 1) / (n + 1):.3f}', '-i', mp4, '-frames:v', '1', '-vf', 'scale=800:-2', p], check=True)
            out.append(Image.open(p).convert('RGB').copy())
    return out


replaced, left, new = [], [], []
for f in sorted(os.listdir(fresh)):
    if not f.endswith('.png'):
        continue
    clip = f.endswith('-poster.png')
    base = f[: -len('-poster.png')] if clip else f[: -len('.png')]
    new_p, old_p = f'{fresh}/{f}', f'{old}/{f}'
    if not os.path.exists(old_p):
        new.append(f)
        continue
    a, b = Image.open(old_p).convert('RGB'), Image.open(new_p).convert('RGB')
    diff = compare(a, b)
    why = f'{diff}'
    if clip and not diff:
        # The poster matches; sample the video as well (a clip can change in its middle).
        try:
            for i, (fa, fb) in enumerate(zip(frames(f'{old}/{base}.mp4'), frames(f'{fresh}/{base}.mp4'))):
                d = compare(fa, fb)
                if d:
                    diff, why = d, f'frame {i + 1} of 3: {d}'
                    break
        except Exception as e:  # a missing or unreadable clip is looked at by hand
            left.append({'file': f, 'why': f'could not sample the clip: {e}'})
            continue
    if diff == 'size':
        change = True
        why = f'size {a.size} -> {b.size}'
    elif not diff:
        left.append({'file': f, 'why': 'same'})
        continue
    else:
        change = any(k != 'middle' for k in diff) or middle_too
    if change and decisions.get(f, {}).get('v') == 'leave':
        left.append({'file': f, 'why': f"looked at, left: {decisions[f]['why']}"})
    elif change:
        replaced.append({'file': f, 'why': why, 'borderline': diff != 'size' and max(diff.values()) < BORDER})
        if not dry:
            shutil.copyfile(new_p, old_p)
            if clip and os.path.exists(f'{fresh}/{base}.mp4'):
                shutil.copyfile(f'{fresh}/{base}.mp4', f'{old}/{base}.mp4')
    else:
        left.append({'file': f, 'why': f'only the middle differs ({why}): looked at, left'})

same = [x for x in left if x['why'] == 'same']
print(f'replaced {len(replaced)}, same {len(same)}, left with a difference {len(left) - len(same)}, no old file {len(new)}')
for r in replaced:
    print('  replaced', r['file'], r['why'], '(borderline)' if r.get('borderline') else '')
for r in left:
    if r['why'] != 'same':
        print('  left', r['file'], r['why'])
for r in new:
    print('  new', r)
if report:
    json.dump({'replaced': replaced, 'left': left, 'new': new}, open(report, 'w'), indent=1)
