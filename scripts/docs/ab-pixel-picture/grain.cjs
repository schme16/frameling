// Grain from a picture: the same light stroke over four catches, from the top: the rough paper, a woven cloth picture (the
// paint catches on the dark threads), the same cloth turned round (it catches on the light gaps), and a plain stroke for
// comparison. Each picture goes in through the reader a file does.
const P = require('./_pics.cjs');
const { L, start, draw, whole, wave, away, shot } = P;
const base = { size: 12, spacing: 0.12, flow: 0.5, tip: 'round', aliased: true };
const row = (y, grain) => [whole({ ...base, grain }), draw(wave(y, 4, 10, 150, 30))];
module.exports = [
  {
    name: 'grain',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      ...start(160),
      ...row(20, null),
      ...row(52, { paper: 'rough', depth: 1, scale: 1, moving: false }),
      whole(base), P.run(`await __framelingDab.grainFromBytes(await ${P.WEAVE}); __framelingDab.set({ grain: { ...__framelingDab.settings().grain, depth: 1, scale: 1 } })`), draw(wave(84, 4, 10, 150, 30)),
      P.run(`const g = __framelingDab.settings().grain; __framelingDab.set({ grain: { ...g, invert: true } })`), draw(wave(116, 4, 10, 150, 30)),
      // The same picture, each pixel of it two pixels big.
      P.run(`const g = __framelingDab.settings().grain; __framelingDab.set({ grain: { ...g, invert: false, scale: 2 } })`), draw(wave(146, 3, 10, 150, 30)),
      away, L.wait(500), shot,
    ],
  },
];
