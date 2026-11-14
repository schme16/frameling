// The brush picker before and after: the real tip in each row's thumbnail, the longer built-in list, and a brush
// preview that stands against the panel in every theme. Each entry runs once per mode; the "-odd" twins use two of the
// less obvious built-in themes (Puppy Socks and Ice Camo) so the ink is seen to follow the panel, not the mode.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-tips-list --out brand/ab/brush-tips-list/raw
const L = require('../help/_lib.cjs');

const OPEN_CROP = [870, 40, 470, 860];
const REST_CROP = [1000, 40, 400, 330];
const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const header = (name) => L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}); if (h.getAttribute('aria-expanded') !== 'true') h.click(); })()`);
const open = click('.pk-btn');
const tall = L.js('__brushes.box({ w: 400, h: 860 })');
const onlyOne = (name) => [click('[aria-label="Open every group"]'), L.wait(300), click('[aria-label="Fold every group"]'), L.wait(300), header(name), L.wait(800)];
const size = (n) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: ${n} } }))`);

const entry = (name, steps, crop, prefs = {}) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, ...prefs },
  size: [1400, 900],
  width: 1400,
  steps: [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), ...steps, L.wait(900), { move: [300, 20] }, L.wait(300), { shot: '@', crop }],
});
const ODD = { darkTheme: 'puppy-socks', lightTheme: 'ice-camo' };
const both = (name, steps, crop) => [entry(name, steps, crop), entry(`${name}-odd`, steps, crop, ODD)];

module.exports = [
  ...both('preview-8', [size(8)], REST_CROP),
  ...both('preview-3', [size(3)], REST_CROP),
  ...both('open-default', [open], OPEN_CROP),
  ...['Pencils', 'Pens', 'Markers', 'Paint', 'Chalk and charcoal', 'Watercolour', 'Stamps and texture'].map((g, n) => entry(`g${n}`, [tall, open, L.wait(400), ...onlyOne(g)], OPEN_CROP)),
  entry('g1-odd', [tall, open, L.wait(400), ...onlyOne('Pens')], OPEN_CROP, ODD),
  entry('g4-odd', [tall, open, L.wait(400), ...onlyOne('Chalk and charcoal')], OPEN_CROP, ODD),
  entry('groups', [tall, open, L.wait(400), click('[aria-label="Open every group"]'), L.wait(300), click('[aria-label="Fold every group"]'), L.wait(500)], OPEN_CROP),
];
