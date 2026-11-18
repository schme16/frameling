// The brush that follows the layer (piece 6 and 7): pictures and a clip of one brush list on both kinds of layer, a brush that
// only exists on the other kind showing what this layer can't draw, the ask-once question, and an imported brush on a
// vector layer. Each is shot in both themes by the help-media harness, into the folder you give with --out:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only follows-list-vector,follows-list-pixel,follows-clip,follows-kept,follows-kept-pixel,follows-ask,follows-import --renderer <dir> --out brand/ab/brush-parity/follows-layer
const L = require('../help/_lib.cjs');
const { view, at } = require('../help/_shapes.cjs');
const { madeUpSet } = require('../help/_brushset.cjs');
const F = '__frameling';
const b64 = Buffer.from(madeUpSet()).toString('base64');
const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
const away = { move: [720, 28] };

/** Go to the top layer of a kind (a document here has one of each). */
const go = (kind) => L.js(`(() => { const s = ${F}.store().get(); const l = [...s.doc.layers].reverse().find((x) => x.kind === '${kind}'); ${F}.store().setUi({ activeLayerId: l.id }); })()`);
/** A vector layer, then a pixel layer above it, with the vector layer active and the Brush picked. */
const twoLayers = () => [L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.cmd('layers.addPixel'), L.wait(500), L.js("document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())"), go('vector'), L.cmd('tools.brush'), L.wait(600)];
const open = (...groups) => [
  L.js("document.querySelector('.pk-btn').click()"), L.wait(700),
  ...groups.flatMap((g) => [L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(g)}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); })()`), L.wait(250)]),
];
const pickRow = (name) => L.js(`[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith(${JSON.stringify(name)})).click()`);
const pick = (name, group) => [...open(group), L.wait(500), pickRow(name)];
const wave = (y, amp = 50, x0 = 300) => ({ drag: Array.from({ length: 29 }, (_, i) => at(x0 + i * 24, y + amp * Math.sin((i / 28) * Math.PI * 2))), steps: 3, delay: 12 });
const base = { prefs: PREFS, size: [1280, 1000], width: 900 };

const list = (kind) => ({
  ...base,
  name: `follows-list-${kind}`,
  steps: [
    ...twoLayers(), go(kind), L.wait(500), L.js('__brushes.box({ w: 440, h: 520 })'),
    L.js("document.querySelector('.pk-btn').click()"), L.wait(700),
    // The same words in the search box on either kind of layer: Wet wash was made for vectors and Wet smear for pixels, and both are here.
    L.js("(() => { const i = document.querySelector('.pk-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'wet'); i.dispatchEvent(new Event('input', { bubbles: true })); })()"), L.wait(900),
    { move: [20, 990] }, { shot: '@', el: '.pk-pop', pad: 10 },
  ],
});

module.exports = [
  list('vector'),
  list('pixel'),
  {
    ...base,
    name: 'follows-clip',
    steps: [
      ...twoLayers(), view(0.5), away, L.wait(300),
      { rec: '@', every: 80 },
      L.wait(700),
      ...pick('Leaves', 'Stamps and texture'), L.wait(900), wave(220), L.wait(700),
      go('pixel'), L.wait(1400), wave(380), L.wait(1000),
      go('vector'), L.wait(1200), wave(540, 30), L.wait(1200),
      { rec: 'stop' },
    ],
  },
  {
    ...base,
    name: 'follows-kept',
    steps: [...twoLayers(), L.cmd('brush.pick.starter:px-wet-smear'), L.wait(500), L.cmd('brush.kept'), L.wait(800), { move: [720, 790] }, { shot: '@', el: '.cv-options', pad: 10 }],
  },
  {
    ...base,
    name: 'follows-kept-pixel',
    choices: { 'brushes.swap.pixels': 'close' },
    steps: [...twoLayers(), L.cmd('brush.pick.starter:oil'), L.wait(300), go('pixel'), L.wait(700), L.cmd('brush.kept'), L.wait(800), { move: [720, 790] }, { shot: '@', el: '.cv-options', pad: 10 }],
  },
  {
    ...base,
    name: 'follows-ask',
    steps: [...twoLayers(), L.cmd('brush.pick.starter:gouache'), L.wait(500), go('pixel'), L.wait(1200), { move: [20, 790] }, { shot: '@', el: '.ui-choice', pad: 10 }],
  },
  {
    ...base,
    name: 'follows-import',
    steps: [
      ...twoLayers(),
      L.js(`__brushImport.show(${JSON.stringify(b64)}, 'Garden brushes.abr')`), L.wait(1200),
      L.js("document.querySelector('.io-foot .io-primary').click()"), L.wait(900),
      ...open('Garden brushes'), L.wait(500), pickRow('Splatter'), L.wait(900),
      L.cmd('brush.kept'), L.wait(800), { move: [720, 790] },
      { shot: '@', el: '.cv-options', pad: 10 },
    ],
  },
];
