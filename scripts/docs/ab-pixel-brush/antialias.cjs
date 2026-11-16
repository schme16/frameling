// The same brush with anti-aliasing off (sharp pixels, the pixel art way) and on (a smooth see-through edge), on a small
// sprite so the pixels show. Top two strokes: off. Bottom two: on.
const { start, draw, dab, wave, line, away, shot } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
module.exports = [
  {
    name: 'antialias',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [
      ...start(48),
      dab({ size: 5, hardness: 1, spacing: 0.15, aliased: true }), draw(line(4, 6, 44, 14, 20)), draw(wave(21, 3, 4, 44, 30)),
      dab({ aliased: false }), draw(line(4, 29, 44, 37, 20)), draw(wave(43, 3, 4, 44, 30)),
      away, L.wait(500), shot,
    ],
  },
];
