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

module.exports = [make('before', true), make('after', false)];
