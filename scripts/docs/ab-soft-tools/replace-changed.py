# Compares a fresh run of the help media with public/help and copies over only what changed where the tool rail is: a picture (or a
# clip's poster) with a real difference down the left edge, where the rail is. One that is the same there is left alone, however much
# it differs elsewhere (some other change, and not this one's to re-shoot). Prints what it replaced and what it left.
#   python3 scripts/docs/ab-soft-tools/replace-changed.py <fresh dir> public/help [--dry]
import os
import shutil
import sys
from PIL import Image, ImageChops

fresh, old = sys.argv[1], sys.argv[2]
dry = '--dry' in sys.argv
replaced, same, elsewhere, missing = [], [], [], []
for f in sorted(os.listdir(fresh)):
    if not f.endswith('.png'):
        continue
    clip = f.endswith('-poster.png')
    base = f[:-len('-poster.png')] if clip else f[:-len('.png')]
    new_p, old_p = f'{fresh}/{f}', f'{old}/{f}'
    if not os.path.exists(old_p):
        missing.append(f)
        continue
    a, b = Image.open(old_p).convert('RGB'), Image.open(new_p).convert('RGB')
    if a.size != b.size:
        elsewhere.append((f, f'size {a.size} -> {b.size}'))
        continue
    diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in diff.getdata() if v)
    if n < 12:
        same.append(f)
        continue
    left = diff.crop((0, 0, max(1, int(a.width * 0.2)), a.height))
    nl = sum(1 for v in left.getdata() if v)
    if nl >= 120:
        replaced.append((f, n, nl))
        if not dry:
            shutil.copyfile(new_p, old_p)
            if clip:
                for ext in ('mp4',):
                    src = f'{fresh}/{base}.{ext}'
                    if os.path.exists(src):
                        shutil.copyfile(src, f'{old}/{base}.{ext}')
    else:
        elsewhere.append((f, f'{n} px differ, {nl} on the left'))
print(f'replaced {len(replaced)}, unchanged {len(same)}, differ elsewhere (left alone, rail the same) {len(elsewhere)}, no old file {len(missing)}')
for r in replaced:
    print('  replaced', *r)
for r in elsewhere:
    print('  left', *r)
for r in missing:
    print('  new', r)
