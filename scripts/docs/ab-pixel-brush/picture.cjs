// The look for picture tips: stars, hearts, and a diamond chain that turns with the line, each a little picture stamped along a stroke.
const { start, draw, dab, wave, away, shot, STAR, HEART, DIAMOND } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
module.exports = [
  {
    name: 'picture',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [
      ...start(160),
      dab({ tip: 'picture', picture: STAR, size: 5, spacing: 1.6, scatter: 0.5 }), draw(wave(24, 8, 14, 146, 40)),
      dab({ picture: HEART, size: 7, spacing: 1.8, scatter: 0.3 }), draw(wave(64, 8, 14, 146, 40)),
      dab({ picture: DIAMOND, size: 5, spacing: 1, scatter: 0, follow: true }), draw(wave(104, 10, 14, 146, 50)),
      dab({ picture: STAR, size: 15, spacing: 1.1, follow: false, angle: 0 }), draw(wave(140, 4, 20, 140, 20)),
      away, L.wait(500), shot,
    ],
  },
];
