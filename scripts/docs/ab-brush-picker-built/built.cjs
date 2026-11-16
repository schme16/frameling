// The finished brush picker shot in the real app, in the same states as the round-two mockups (brand/ab/brush-library-v2),
// so what shipped can be set beside what was picked. Each entry runs once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-picker-built --out brand/ab/brush-picker-built/raw
const L = require('../help/_lib.cjs');
const { libraryText } = require('../help/_library.cjs');

const OPEN_CROP = [885, 40, 450, 780];
const WIDE_CROP = [700, 40, 640, 860];
const REST_CROP = [1000, 40, 400, 300];

const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const header = (name) => L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}); if (h.getAttribute('aria-expanded') !== 'true') h.click(); })()`);
const row = (name) => L.js(`[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`);
const pick = (group, name) => [click('.pk-btn'), L.wait(350), header(group), L.wait(250), row(name), L.wait(350)];
const star = L.js("__frameling.run('brush.favourite')");
const foldAll = [click('[aria-label="Open every group"]'), L.wait(250), click('[aria-label="Fold every group"]'), L.wait(250)];

// A library of 148 brushes, Fine liner in use, three starred and four used lately.
const setup = [
  ...pick('Inking', 'Technical pen'), star, ...pick('Inking', 'Brush pen'), star,
  ...pick('Inking', 'Cel ink'), ...pick('Inking', 'Fine liner'), star,
];
const entry = (name, steps, { lib = true, crop = OPEN_CROP, rows } = {}) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: [1400, 900],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700),
    ...(lib ? [L.js(`__brushes.addFromText(${JSON.stringify(libraryText())})`), L.wait(4300), ...setup] : []),
    ...(rows ? [L.cmd('brush.rows')] : []),
    ...steps, L.wait(700),
    { move: [300, 20] }, L.wait(300),
    { shot: '@', crop },
  ],
});
const open = click('.pk-btn');
const typeIn = (q) => [L.js("document.querySelector('.pk-search input').focus()"), { type: q }];

module.exports = [
  entry('rest-small', [], { lib: false, crop: REST_CROP }),
  entry('rest-large', [], { crop: REST_CROP }),
  entry('rest-large-changed', [L.js('__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 19 } }))')], { crop: REST_CROP }),
  entry('open-small', [open], { lib: false }),
  entry('open-large', [open]),
  entry('open-recent', [open, L.wait(300), ...foldAll, header('Recent')]),
  entry('open-favourites', [open, L.wait(300), ...foldAll, header('Favourites')]),
  entry('open-folded', [open, L.wait(300), ...foldAll]),
  entry('open-typing', [open, L.wait(300), ...typeIn('pen')]),
  entry('open-two-columns-wide', [L.js('__brushes.box({ w: 560, h: 740 })'), open], { crop: WIDE_CROP, rows: true }),
];
