// The board looks for Repeat: a ring of petals round a centre snapped to a guide crossing, a grid of tiles, a wing
// mirrored across a guide, and a clip of changing a ring's count and dragging its centre while every copy follows. Once per theme, in the real app.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/.bin/electron scripts/docs/help-media.cjs --entries scripts/docs/ab-repeat-objects --out <dir>
const { T, UI, away, put, label, dom, REC, STOP, WARM } = require('../help/_shapes.cjs');
const R = require('../help/_repeat.cjs');

// The window is 1600 x 1000. The page sits at 0.7484 zoom with its corner at (191, 99.56), measured from the app's own state.
const Z = 0.7484375;
const win = (x, y) => [Math.round(191 + x * Z), Math.round(99.5625 + y * Z)];
const PAGE = [191, 100, 958, 539];
const SIZE = [1600, 1000];
const CLIP = [191, 60, 1340, 580];
const choices = { 'repeat.ringTurn': 'follow' };

const withTool = (id) => dom(`__frameling.store().setUi({ tool: ${JSON.stringify(id)} })`);
const pick = (n = 0) => dom(`(() => { const S = __frameling.store(); const d = S.get().doc; const l = d.layers.find((x) => x.name === 'Lines'); const dr = d.drawings[l.cels[0].drawingId]; S.setUi({ activeLayerId: l.id, selection: dr.shapes.slice(0, ${n + 1}).map((s) => s.id) }); })()`);
const scene = (...rest) => [T('blank-vector'), { wait: 700 }, ...rest, { wait: 500 }, away, { wait: 300 }];

// A ring of 12 petals: its centre starts off to one side, then is dragged onto the crossing of two guides and snaps there.
const CROSS = { x: 520, y: 340 };
const OFF = { x: 440, y: 290 };
const ringShapes = (centre) => {
  const f = R.at(1.0, CROSS.x, CROSS.y);
  const r = R.ring(f, 1.0, 12, { x: 0, y: 0 });
  return [{ ...r.repeated, repeat: { ...r.repeated.repeat, cx: centre.x, cy: centre.y } }, r.dot];
};
const ringScene = (shot) => scene(R.guides([['x', CROSS.x], ['y', CROSS.y]]), put('Lines', [...ringShapes(OFF), label(CROSS.x, 600, 'A ring of 12, its centre snapped to the guides')], [0]), pick(0), withTool('repeat'), { wait: 400 }, WARM,
  { drag: [win(OFF.x, OFF.y), win(CROSS.x + 6, CROSS.y + 5)], steps: 14, delay: 18, after: 500 }, ...shot);

// A grid of tiles, with the Repeat tool showing the step handle.
const gridScene = scene(put('Lines', [R.grid(R.at(1.0, 640, 340), 1.0, 5, 3), label(640, 600, 'Rows and columns: 5 across, 3 down')], [0]), pick(0), withTool('repeat'), { wait: 400 }, away, { wait: 300 }, { shot: '@', crop: PAGE });

// A wing and its spot, mirrored across a guide.
const mirrorScene = scene(R.guides([['x', 640]]), put('Lines', [...R.wing(R.at(1.0, 640, 340), 1.0), label(640, 600, 'A mirror image across the guide')], [0, 1]), pick(1), withTool('repeat'), { wait: 400 }, away, { wait: 300 }, { shot: '@', crop: PAGE });

// The clip: count 6 up to 12 and down to 8 through the real Repeat section, then the centre dragged onto the guides.
const press = (key, n) => Array.from({ length: n }, () => ({ key, after: 130 }));
const countClip = [
  T('blank-vector'), { wait: 700 }, R.guides([['x', CROSS.x], ['y', CROSS.y]]),
  put('Lines', (() => { const s = ringShapes(CROSS); s[0] = { ...s[0], repeat: { ...s[0].repeat, count: 6 } }; return s; })(), [0]), pick(0),
  { wait: 700 },
  // Bring the Repeat section of Properties to the top of its panel, so the clip shows the box being changed.
  dom(`(() => { const h = [...document.querySelectorAll('h3, h2, button, span')].find((e) => e.textContent.trim() === 'Repeat' && e.children.length < 3); h && h.scrollIntoView({ block: 'start' }); })()`), { wait: 400 },
  away, WARM, REC(CLIP, 60), { wait: 900 },
  dom(`(() => { const el = document.querySelector('[aria-label="How many"]'); el && el.focus(); })()`), { wait: 200 },
  ...press('Right', 6), { wait: 700 }, ...press('Left', 4), { wait: 800 },
  withTool('repeat'), { wait: 500 },
  { drag: [win(CROSS.x, CROSS.y), win(CROSS.x + 90, CROSS.y - 50), win(CROSS.x + 4, CROSS.y + 3)], steps: 10, delay: 22, after: 500 },
  { wait: 1200 }, STOP,
];

module.exports = [
  { name: 'ring-snapped-centre', size: SIZE, width: 1000, choices, steps: ringScene([away, { wait: 300 }, { shot: '@', crop: PAGE }]) },
  { name: 'grid', size: SIZE, width: 1000, choices, steps: gridScene },
  { name: 'mirror-across-guide', size: SIZE, width: 1000, choices, steps: mirrorScene },
  { name: 'count-live', size: SIZE, width: 960, choices, steps: countClip },
];
