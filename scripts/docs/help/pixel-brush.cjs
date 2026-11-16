// The help picture for the Pixel brush: the Pixel workspace with the brush picked, its options open, and strokes at four
// spacings, a scatter and a picture tip drawn. (The same strokes, one look each, are in scripts/docs/ab-pixel-brush.)
const { start, draw, dab, wave, away, STAR } = require('../ab-pixel-brush/_draw.cjs');
const L = require('./_lib.cjs');

module.exports = [
  {
    name: 'pixel-brush',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      dab({ size: 8 }), draw(wave(22, 6, 14, 146, 30)),
      dab({ spacing: 0.6 }), draw(wave(50, 6, 14, 146, 30)),
      dab({ spacing: 2 }), draw(wave(78, 6, 14, 146, 30)),
      dab({ spacing: 0.7, size: 4, scatter: 1.2, sizeJitter: 0.4 }), draw(wave(106, 6, 14, 146, 40)),
      dab({ tip: 'picture', picture: STAR, size: 5, spacing: 1.6, scatter: 0.4, sizeJitter: 0 }), draw(wave(136, 6, 14, 146, 40)),
      dab({ tip: 'round', size: 6, spacing: 0.25, scatter: 0, sizeJitter: 0, aliased: true }),
      away, L.wait(6800), { shot: '@' },
    ],
  },
];
