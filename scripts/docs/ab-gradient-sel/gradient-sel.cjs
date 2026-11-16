// Looks for "selecting a gradient shape shows its gradient in the Colours panel".
//   pick: a sky (gradient fill, plain outline) picked with nothing else changed; the panel should show its colours
//   edit: a stop moved and recoloured, with the shape on the canvas changing as it goes
// Run before and after with --renderer, e.g.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-gradient-sel --out <dir> [--renderer <dir>]
const L = require('../help/_lib.cjs');

const sky = {
  id: 'sky1',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 160, y: 90 }, { x: 640, y: 90 }, { x: 640, y: 360 }, { x: 160, y: 360 }] }],
  fill: '#2f6fb0',
  fillGradient: { kind: 'linear', stops: [{ at: 0, color: '#1b2a6b' }, { at: 0.55, color: '#e0679a' }, { at: 1, color: '#ffc94a' }], from: { x: 400, y: 90 }, to: { x: 400, y: 360 } },
  stroke: { color: '#1d1b26', width: 5, join: 'round', cap: 'round' },
  opacity: 1,
};
const put = L.js(`(() => { const S = __frameling.store(); S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(${JSON.stringify(sky)}); }); S.setUi({ tool: 'select', activeWell: 'stroke', selection: [] }); })()`);
const pick = L.js(`__frameling.store().setUi({ selection: ['sky1'] })`);
const fold = (...ids) => L.js(`for (const id of ${JSON.stringify(ids)}) { const b = document.getElementById('rd-sec-h-' + id); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); }`);
const calm = L.js("document.querySelectorAll('[aria-label=\"Dismiss message\"]').forEach((b) => b.click())");
const toColours = L.js("(() => { const sc = document.querySelector('.rd-scroll'); const h = document.querySelector('.cv-wells'); if (sc && h) sc.scrollTop += h.getBoundingClientRect().top - sc.getBoundingClientRect().top - 50; })()");
const away = { move: [720, 28] };
const fit = L.js('__frameling.store().setUi({ zoom: 0.8, panX: 40, panY: 0 })');

module.exports = [
  {
    name: 'gradient-sel-pick',
    width: 1000,
    steps: [L.template('blank-vector'), put, fit, pick, L.wait(800), fold('symbol-props', 'effects', 'convert', 'tool-options'), L.wait(600), calm, toColours, L.wait(500), away, L.wait(300), { shot: '@', crop: [112, 40, 1088, 560] }],
  },
  {
    name: 'gradient-sel-edit',
    width: 1000,
    steps: [
      L.template('blank-vector'), put, fit, pick, L.wait(800), fold('symbol-props', 'effects', 'convert', 'tool-options'), L.wait(600), calm, toColours, L.wait(500), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [112, 40, 1088, 560], every: 70 }, L.wait(900),
      { drag: [[1048, 499], [1030, 499], [1010, 499], [990, 499], [970, 499], [950, 499]], steps: 3, delay: 45 }, L.wait(700),
      { click: [1164, 499] }, L.wait(600),
      { drag: [[920, 324], [960, 324], [1010, 324], [1060, 324], [1110, 324]], steps: 4, delay: 45 }, L.wait(1100),
      { rec: 'stop' },
    ],
  },
];
