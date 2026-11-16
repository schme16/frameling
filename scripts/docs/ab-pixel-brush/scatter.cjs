// The look for scatter and jitter: scatter 0, 50%, 100%, 200%, and the last with size jitter too.
const { start, draw, dab, wave, away, shot } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
module.exports = [
  {
    name: 'scatter',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [
      ...start(160),
      dab({ size: 5, spacing: 0.7 }),
      ...[0, 0.5, 1, 2].flatMap((s, i) => [dab({ scatter: s, sizeJitter: i === 3 ? 0.6 : 0 }), draw(wave(24 + i * 38, 6, 14, 146, 40))]),
      away, L.wait(500), shot,
    ],
  },
];
