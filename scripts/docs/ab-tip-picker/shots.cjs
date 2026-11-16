// The pen tip chips before and after (brand/ab/tip-picker): the options panel at the same width and the same crop, the
// picker open with a stroke across each tip, and a stamp chosen from it. The panel shots run on both builds (the chips
// are in "before", the picker in "after"); the open and chosen ones only mean anything on the picker build. The "log"
// steps print the height of the Tip row in px, which is the space that comes back.
//   S=...; npx vite build --outDir $S/after   (and the same from a checkout of development for $S/before)
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-tip-picker --renderer $S/after --out <raw>
const L = require('../help/_lib.cjs');

const PANEL = [1000, 90, 320, 640];
const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const openTips = click('[data-testid="brush-tips"] .pk-btn');
const stamp = (shape) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, tip: { kind: 'stamp', shape: ${JSON.stringify(shape)}, spacing: 1.3, jitter: 0.2, angle: 'upright', scatter: 0.2 } } }))`);
const kind = (k) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, tip: ${k ? JSON.stringify({ kind: k, amount: 0.5, grain: 1 }) : 'undefined'} } }))`);
const size = (n) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: ${n} } }))`);
const chooseRow = (name) => L.js(`[...document.querySelectorAll('.pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`);
const rowHeight = { log: `(() => { const r = document.querySelector('[data-testid="brush-tips"]').getBoundingClientRect(); return { tipBlock: Math.round(r.height) }; })()` };

const entry = (name, steps, crop, choices) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  ...(choices ? { choices } : {}),
  size: [1400, 1000],
  width: 1400,
  steps: [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), size(18), ...steps, L.wait(1000), rowHeight, { move: [300, 20] }, L.wait(300), { shot: '@', crop }],
});

module.exports = [
  entry('stamp', [stamp('leaf')], PANEL),
  entry('plain', [kind(null)], PANEL),
  entry('chalk', [kind('chalk')], PANEL),
  entry('open', [kind('chalk'), openTips], [900, 330, 500, 670]),
  entry('open-dense', [kind('chalk'), openTips], [900, 330, 500, 670], { 'brushes.rows': 'two' }),
  entry('chosen', [kind('chalk'), openTips, L.wait(500), chooseRow('Heart')], PANEL),
];
