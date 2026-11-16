// Krita's Basic-5 Size, imported by the real importer, drawn with the same four pressures twice: once with its pressure
// curves taken off (how the importer used to bring it in, a plain straight line) and once as it comes in now. Each is on a
// sprite of its own, in sharp pixels on paper, both themes. compose.py puts them side by side.
const { L, start, draw, away, shot } = require('../ab-pixel-brush/_draw.cjs');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '../../../test/fixtures/brushes/krita/Basic-5_Size_default.kpp');
const SIZE = 230;
/** Import the real file; `flat` strips every curve, which is exactly what the importer produced before. */
const use = (flat) =>
  L.js(`(async () => { const r = await __brushImport.read(${JSON.stringify(fs.readFileSync(FILE).toString('base64'))}, 'Basic-5_Size_default.kpp'); const d = r.brushes[0].dab; ${flat ? 'd.dynamics = d.dynamics.map(({ curve, ...x }) => x);' : ''} __framelingDab.whole(d); })()`);

// Four light-to-firm touches, one line each, so the way pressure turns into size and paint shows.
const touches = [0.15, 0.3, 0.5, 1].map((p, i) => Array.from({ length: 30 }, (_, k) => [Math.round(34 + (k / 29) * 160), 28 + i * 58, p]));
const make = (name, flat) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  width: 900,
  steps: [...start(SIZE), use(flat), L.wait(150), ...touches.map((t) => draw(t, { pen: true, delay: 10 })), away, L.wait(400), shot],
});

// One long stroke whose pressure climbs from nothing to full, so the profile shows the curve: 0.02 to 1 over the length.
const ramp = Array.from({ length: 70 }, (_, k) => [Math.round(16 + (k / 69) * 198), SIZE / 2, 0.02 + 0.98 * (k / 69)]);
const makeRamp = (name, flat) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  width: 900,
  steps: [...start(SIZE), use(flat), L.wait(150), draw(ramp, { pen: true, delay: 10 }), away, L.wait(400), shot],
});

// The real response graph from the brush options, with the imported brush picked. `to` is 'flow' or 'size'.
const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
const makeGraph = (name, flat, to) => {
  const graph = `[data-testid="dab-route-${to}"] .dab-curve-graph`;
  return {
  name,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  width: 900,
  steps: [
    L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(SIZE), use(flat), L.wait(300),
    open('pixel-brush-dynamics'), L.wait(500), open(`pixel-brush-curve-${to}`), L.wait(500),
    L.js(`document.querySelector(${JSON.stringify(graph)})?.scrollIntoView({ block: 'center' })`), L.wait(500),
    { shot: '@', el: graph, pad: 4 },
  ],
  };
};

module.exports = [
  make('presses-before', true), make('presses-after', false),
  makeRamp('ramp-before', true), makeRamp('ramp-after', false),
  makeGraph('graph-before-flow', true, 'flow'), makeGraph('graph-after-flow', false, 'flow'),
  makeGraph('graph-before-size', true, 'size'), makeGraph('graph-after-size', false, 'size'),
];
