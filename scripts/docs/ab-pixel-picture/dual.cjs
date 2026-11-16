// A dual tip from a picture: round dots for comparison on top, then dots from a picture of leaves (dark parts count), the
// same picture turned round, and the leaves as holes.
const P = require('./_pics.cjs');
const { L, start, draw, whole, wave, away, shot } = P;
const base = { size: 14, spacing: 0.2, flow: 1, aliased: true };
module.exports = [
  {
    name: 'dual',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      ...start(160),
      whole({ ...base, dual: { tip: 'round', size: 2, density: 0.4, cut: false } }), draw(wave(20, 4, 10, 150, 30)),
      whole(base), P.run(`await __framelingDab.dualFromBytes(await ${P.LEAVES}); __framelingDab.set({ dual: { ...__framelingDab.settings().dual, density: 0.5, cut: false } })`), draw(wave(52, 4, 10, 150, 30)),
      P.run(`const d = __framelingDab.settings().dual; __framelingDab.set({ dual: { ...d, invert: true } })`), draw(wave(84, 4, 10, 150, 30)),
      P.run(`const d = __framelingDab.settings().dual; __framelingDab.set({ dual: { ...d, invert: false, cut: true } })`), draw(wave(116, 4, 10, 150, 30)),
      P.run(`const d = __framelingDab.settings().dual; __framelingDab.set({ dual: { ...d, cut: false, scale: 2 } })`), draw(wave(146, 3, 10, 150, 30)),
      away, L.wait(500), shot,
    ],
  },
];
