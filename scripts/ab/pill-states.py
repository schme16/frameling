#!/usr/bin/env python3
"""Every mix of the Live pill in one picture, in both themes: brand/ab/ux-one-pill/all-states-{dark,light}.png.

It is the fixture for "does the OBS part look live when it is not". Build first, then run it inside xvfb:

  npm run build
  xvfb-run -a -s "-screen 0 1600x1000x24" python3 scripts/ab/pill-states.py [outDir]

It drives scripts/shoot.cjs with a pretend OBS (__framelingObs) and the demo audience queue, crops the title bar, and
stacks the crops under a caption each. Only the Live and Rec rows may look live."""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'brand/ab/ux-one-pill')
work = tempfile.mkdtemp(prefix='pill-states-')

# (id, caption, audience waiting or None, obs)  obs: None | 'ready' | 'quiet' | 'password' | 'address' | 'live' | 'rec'
STATES = [
  ('00', 'Everything off: no pill at all', None, None),
  ('01', 'Audience on, OBS link off: On air and Stop, exactly as before', 0, None),
  ('02', 'Audience on with things waiting: the count sits on On air', 2, None),
  ('03', 'OBS only, connected: calm green outline, tick', None, 'ready'),
  ('04', 'OBS only, not running: dim and quiet', None, 'quiet'),
  ('05', 'OBS only, needs a password: amber outline and a warning mark', None, 'password'),
  ('06', 'OBS only, bad address: same, and it says address', None, 'address'),
  ('07', 'OBS only, streaming: solid red Live, no Stop', None, 'live'),
  ('08', 'OBS only, recording: red outline and dot, not filled', None, 'rec'),
  ('09', 'On air and OBS connected: OBS ready is NOT red, it sits on the pill\'s own surface', 0, 'ready'),
  ('10', 'On air with a count and OBS live: Live in white on red, Stop still ends audience only', 2, 'live'),
  ('11', 'On air and OBS recording: Rec in white on red', 0, 'rec'),
  ('12', 'On air and OBS not running: a dim No OBS, NOT red', 0, 'quiet'),
  ('13', 'On air and OBS wants a password: amber ring, NOT red', 0, 'password'),
  ('14', 'On air and OBS has a bad address: amber ring, NOT red', 0, 'address'),
]

def steps(audience, obs, theme):
  js = ["__frameling.template('blank-vector')"]
  wait = lambda ms: {'wait': ms}
  s = [{'eval': js[0] + '; true'}, wait(600)]
  run = [f"__frameling.prefs.set({{theme:'{theme}'}})"]
  if audience is not None: run.append(f"__framelingAudience.demo(); __framelingAudience.on({audience})")
  if obs:
    run.append({'quiet': '__framelingObs.fake({up:false})', 'password': '__framelingObs.fake({wrongPassword:true})'}.get(obs, '__framelingObs.fake({})'))
    if obs == 'address': run.append("__frameling.prefs.set({obsAddress:'bad address'})")
    run.append('__frameling.prefs.set({obsLink:true})')
  s.append({'eval': '; '.join(run + ['true'])})
  s.append(wait(1200))
  if obs in ('live', 'rec'):
    s += [{'eval': f"__framelingObs.go('{'stream' if obs == 'live' else 'record'}', true); true"}, wait(900)]
  return s

variants = []
for theme in ('dark', 'light'):
  for sid, _cap, aud, obs in STATES:
    p = os.path.join(work, f'{sid}.json')
    json.dump(steps(aud, obs, theme), open(p, 'w'))
    variants.append(f'{sid}-{theme}:cosy:{theme}:{p}')
env = dict(os.environ, SHOT_W='1400', SHOT_SHOW='1')
# One run per picture: a run shares one profile, so a pretend OBS or a bad address from one state would leak into the next.
for v in variants:
  subprocess.run(['npx', 'electron', 'scripts/shoot.cjs', work, v], cwd=root, env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def font(n):
  for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f): return ImageFont.truetype(f, n)
  return ImageFont.load_default()

for theme in ('dark', 'light'):
  bg = (23, 21, 31) if theme == 'dark' else (243, 238, 230)
  fg = (244, 239, 230) if theme == 'dark' else (42, 37, 51)
  crops = []
  for sid, cap, _a, _o in STATES:
    im = Image.open(os.path.join(work, f'{sid}-{theme}.png')).convert('RGB').crop((480, 0, 1400, 52))
    crops.append((cap, im))
  W, rowH = 920, 82
  sheet = Image.new('RGB', (W, rowH * len(crops)), bg)
  d = ImageDraw.Draw(sheet)
  for i, (cap, im) in enumerate(crops):
    y = i * rowH
    d.text((8, y + 6), cap, font=font(13), fill=fg)
    sheet.paste(im, (0, y + 26))
  sheet.save(os.path.join(out, f'all-states-{theme}.png'))
  print('wrote', os.path.join(out, f'all-states-{theme}.png'))
