// One stroke for each real brush file, imported by the real importer, on a sprite of its own so no brush draws over
// another, in sharp pixels on paper, both themes. compose.py lays them out beside their names and settings.
const { L, start, draw, wave, away, shot } = require('../ab-pixel-brush/_draw.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { GIMP, PHOTOSHOP } = require('./_rows.cjs');

const SIZE = 200;
/** Import a file in the page and make its brush the pixel brush. */
const use = (r) => L.js(`(async () => { const r = await __brushImport.read(${JSON.stringify(fs.readFileSync(r.file).toString('base64'))}, ${JSON.stringify(path.basename(r.file))}); __framelingDab.whole(r.brushes[${r.index ?? 0}].dab); })()`);

const make = (group, r, i) => {
  // The pen leans on the middle of the stroke, so a pressure or tilt route shows.
  const line = wave(SIZE / 2, 14, 36, SIZE - 36, 60).map(([x, y], k, a) => [x, y, 0.15 + 0.85 * Math.sin((k / (a.length - 1)) * Math.PI)]);
  return {
    name: `${group}-${i}`,
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    width: 900,
    steps: [...start(SIZE), use(r), L.wait(150), draw(line, { delay: 8 }), away, L.wait(400), shot],
  };
};

module.exports = [...GIMP.map((r, i) => make('gimp', r, i)), ...PHOTOSHOP.map((r, i) => make('photoshop', r, i))];
