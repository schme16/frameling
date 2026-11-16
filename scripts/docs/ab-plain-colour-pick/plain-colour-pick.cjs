// Looks for "picking a plain colour shape shows that colour in the Colours panel and the boxes".
//   pick:   one red shape picked; the colour box holds a blue. The picker and the fill box should show the red.
//   differ: three shapes, three colours, all picked. The panel should say they differ and offer to match them.
// Run before and after with --renderer, e.g.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-plain-colour-pick --out <dir> [--renderer <dir>]
const L = require('../help/_lib.cjs');

const rect = (id, x, fill) => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y: 120 }, { x: x + 170, y: 120 }, { x: x + 170, y: 320 }, { x, y: 320 }] }],
  fill,
  stroke: { color: '#1d1b26', width: 5, join: 'round', cap: 'round' },
  opacity: 1,
});
const shapes = [rect('r1', 120, '#e0382f'), rect('r2', 330, '#3fae5a'), rect('r3', 540, '#7a4fd1')];
const put = L.js(`(() => { const S = __frameling.store(); S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...${JSON.stringify(shapes)}); }); S.setUi({ tool: 'select', activeWell: 'fill', fillColor: '#2f6fb0', selection: [] }); })()`);
const pickOne = L.js(`__frameling.store().setUi({ selection: ['r1'] })`);
const pickAll = L.js(`__frameling.store().setUi({ selection: ['r1', 'r2', 'r3'] })`);
const fold = (...ids) => L.js(`for (const id of ${JSON.stringify(ids)}) { const b = document.getElementById('rd-sec-h-' + id); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); }`);
const calm = L.js("document.querySelectorAll('[aria-label=\"Dismiss message\"]').forEach((b) => b.click())");
const toColours = L.js("(() => { const sc = document.querySelector('.rd-scroll'); const h = document.querySelector('.cv-wells'); if (sc && h) sc.scrollTop += h.getBoundingClientRect().top - sc.getBoundingClientRect().top - 50; })()");
const away = { move: [720, 28] };
const fit = L.js('__frameling.store().setUi({ zoom: 0.8, panX: 40, panY: 0 })');
const common = [fit, L.wait(800), fold('symbol-props', 'effects', 'convert', 'tool-options'), L.wait(600), calm, toColours, L.wait(500), away, L.wait(300)];

module.exports = [
  { name: 'plain-colour-pick-one', width: 1000, steps: [L.template('blank-vector'), put, pickOne, ...common, { shot: '@', crop: [112, 40, 1088, 560] }] },
  { name: 'plain-colour-pick-differ', width: 1000, steps: [L.template('blank-vector'), put, pickAll, ...common, { shot: '@', crop: [112, 40, 1088, 560] }] },
];
