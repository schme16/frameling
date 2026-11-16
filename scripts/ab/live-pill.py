#!/usr/bin/env python3
"""Before and after of the Live pill, cropped tight, in both themes: brand/ab/live-pill/<state>-{before,after}-{dark,light}.png
plus one captioned sheet per theme, all-{dark,light}.png.

  npm run build   (in each checkout)
  xvfb-run -a -s "-screen 0 1600x1000x24" python3 scripts/ab/live-pill.py <beforeRoot> <afterRoot> [outDir]

Each root is a built checkout (its own scripts/shoot.cjs and dist/). It drives shoot.cjs with a pretend OBS
(__framelingObs) and the demo audience queue, then crops to the pill by finding where the title bar stops looking like
the title bar."""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFont

here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
before, after = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, 'brand/ab/live-pill')
os.makedirs(out, exist_ok=True)
work = tempfile.mkdtemp(prefix='live-pill-')

# (id, caption, audience waiting or None, obs)
STATES = [
  ('1-audience-on', 'Audience participation on, OBS link off', 0, None),
  ('2-audience-obs-ready', 'Audience participation on, OBS connected and ready', 0, 'ready'),
  ('3-audience-obs-recording', 'Audience participation on, OBS recording', 0, 'rec'),
  ('4-audience-3-obs-streaming', 'Audience participation on, things waiting, OBS streaming', 3, 'live'),
  ('5-audience-obs-password', 'Audience participation on, OBS needs a password', 0, 'password'),
]
STATES = [s for s in STATES if not os.environ.get('ONLY') or s[0] in os.environ['ONLY'].split(',')]

def steps(audience, obs, theme):
  run = [f"__frameling.prefs.set({{theme:'{theme}'}})"]
  if audience is not None: run.append(f"__framelingAudience.demo(); __framelingAudience.on({audience})")
  if obs:
    run.append({'password': '__framelingObs.fake({wrongPassword:true})'}.get(obs, '__framelingObs.fake({})'))
    run.append('__frameling.prefs.set({obsLink:true})')
  s = [{'eval': "__frameling.template('blank-vector'); true"}, {'wait': 600}, {'eval': '; '.join(run + ['true'])}, {'wait': 1200}]
  if obs in ('live', 'rec'):
    s += [{'eval': f"__framelingObs.go('{'stream' if obs == 'live' else 'record'}', true); true"}, {'wait': 900}]
  return s

def shoot(root, tag):
  env = dict(os.environ, SHOT_W='1400', SHOT_SCALE='2', SHOT_SHOW='1')
  for theme in ('dark', 'light'):
    for sid, _c, aud, obs in STATES:
      p = os.path.join(work, f'{tag}-{sid}-{theme}.json')
      json.dump(steps(aud, obs, theme), open(p, 'w'))
      subprocess.run(['npx', 'electron', 'scripts/shoot.cjs', work, f'{tag}-{sid}-{theme}:cosy:{theme}:{p}'], cwd=root, env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def pill_crop(path):
  """Find the pill in the title bar: the widest run of strongly coloured columns, then out to its edges."""
  im = Image.open(path).convert('RGB')
  top, bottom = 4, 68
  px = im.load()
  colourful = lambda x: sum(1 for y in range(top + 6, bottom - 6) if max(px[x, y]) - min(px[x, y]) > 70) > 20
  busy = lambda x: any(sum(abs(a - b) for a, b in zip(px[x, y], px[x, top + 1])) > 10 for y in range(top + 12, bottom - 12))
  runs, x = [], 0
  while x < im.width:
    if not colourful(x): x += 1; continue
    start, gap, last = x, 0, x
    while x < im.width and gap < 60:
      if colourful(x): gap, last = 0, x
      else: gap += 1
      x += 1
    runs.append((start, last))
  l, r = max(runs, key=lambda r: r[1] - r[0])
  while r < im.width - 1 and (busy(r + 1) or busy(r + 2) or busy(r + 3) or busy(r + 4)): r += 1
  pad = 16
  return im.crop((l - pad, top, r + pad, bottom))

def font(n):
  for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f): return ImageFont.truetype(f, n)
  return ImageFont.load_default()

if __name__ == '__main__':
  shoot(before, 'before')
  shoot(after, 'after')
  for theme in ('dark', 'light'):
    bg = (23, 21, 31) if theme == 'dark' else (243, 238, 230)
    fg = (244, 239, 230) if theme == 'dark' else (42, 37, 51)
    rows = []
    for sid, cap, _a, _o in STATES:
      pair = []
      for tag in ('before', 'after'):
        c = pill_crop(os.path.join(work, f'{tag}-{sid}-{theme}.png'))
        c.save(os.path.join(out, f'{sid}-{tag}-{theme}.png'))
        pair.append(c)
      rows.append((cap, pair))
    colw = max(c.width for _c, p in rows for c in p) + 20
    rowh = max(c.height for _c, p in rows for c in p) + 56
    sheet = Image.new('RGB', (colw * 2 + 20, rowh * len(rows) + 40), bg)
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), 'Before', font=font(22), fill=fg)
    d.text((colw + 20, 10), 'After', font=font(22), fill=fg)
    for i, (cap, pair) in enumerate(rows):
      y = 40 + i * rowh
      d.text((10, y + 4), cap, font=font(20), fill=fg)
      for j, c in enumerate(pair): sheet.paste(c, (10 + j * (colw + 10), y + 38))
    sheet.save(os.path.join(out, f'all-{theme}.png'))
    print('wrote', os.path.join(out, f'all-{theme}.png'))
