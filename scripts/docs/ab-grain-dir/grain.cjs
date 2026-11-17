// Grain peaks or pits (board card grain-peaks-or-pits): the dab engine's grain on three papers at three strengths of paint,
// each stroke straight so the grain is the only thing to look at. The same entry is run against two renderer builds (as it is,
// and with grainCut's comparison flipped) and the two pictures are laid side by side by scripts/docs/ab-grain-dir/
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-grain-dir --renderer <dir> --out <dir>
const P = require('../ab-pixel-picture/_pics.cjs');
const { L, start, draw, whole, wave, away, shot } = P;
const base = { size: 9, spacing: 0.1, flow: 0.5, tip: 'round', aliased: false };
const row = (y, paper, flow, scale = 2) => [
  whole({ ...base, flow, grain: { paper, depth: 1, scale, moving: false } }),
  draw(wave(y, 0, 8, 120, 30)),
];
const STRIPES = P.bytes(64, 64, `g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#222'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 64)`);
const DOTS = P.bytes(64, 64, `g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#222'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc(4 + i * 8, 4 + j * 8, 2.4, 0, 7); g.fill(); }`);
const pic = (bytes, y, invert) => [
  whole({ ...base, size: 12, flow: 0.5, grain: null }),
  P.run(`await __framelingDab.grainFromBytes(await ${bytes}); const g = __framelingDab.settings().grain; __framelingDab.set({ grain: { ...g, depth: 1, scale: 2, invert: ${invert} } })`),
  draw(wave(y, 0, 8, 120, 30)),
];
// A bigger sheet at the finest grain, strokes the way chalk is drawn (three passes, light and firm), for a look at the character.
const fine = (paper) => [
  ...start(256),
  whole({ ...base, size: 16, flow: 0.4, grain: { paper, depth: 1, scale: 1, moving: false } }),
  draw(wave(40, 10, 20, 236, 40)), draw(wave(56, 10, 20, 236, 40)),
  whole({ ...base, size: 16, flow: 0.7, grain: { paper, depth: 1, scale: 1, moving: false } }),
  draw(wave(110, 10, 20, 236, 40)),
  whole({ ...base, size: 12, flow: 0.3, grain: { paper, depth: 1, scale: 1, moving: false } }),
  draw([[30, 170, 0.5], [226, 226, 0.5]].flatMap(([x, y], i, a) => (i ? [] : Array.from({ length: 30 }, (_, k) => [Math.round(30 + 196 * k / 29), Math.round(170 + 56 * k / 29), 0.5])))),
  draw(Array.from({ length: 30 }, (_, k) => [Math.round(30 + 196 * k / 29), Math.round(226 - 56 * k / 29), 0.5])),
  draw(Array.from({ length: 30 }, (_, k) => [Math.round(30 + 196 * k / 29), 198, 0.5])),
  away, L.wait(500), shot,
];
module.exports = [
  { name: 'fine-medium', prefs: { firstDrawn: true, showTips: false }, width: 900, steps: fine('medium') },
  { name: 'fine-rough', prefs: { firstDrawn: true, showTips: false }, width: 900, steps: fine('rough') },
  {
    name: 'papers',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      ...start(128),
      // rough: light, middle, firm. medium: light, middle. laid: light, middle.
      ...row(10, 'rough', 0.3), ...row(24, 'rough', 0.55), ...row(38, 'rough', 0.85),
      ...row(54, 'medium', 0.3), ...row(68, 'medium', 0.55),
      ...row(84, 'laid', 0.3), ...row(98, 'laid', 0.55),
      ...row(114, 'rough', 0.55, 1),
      away, L.wait(500), shot,
    ],
  },
  {
    name: 'pictures',
    prefs: { firstDrawn: true, showTips: false },
    width: 900,
    steps: [
      ...start(128),
      ...pic(STRIPES, 12, false), ...pic(STRIPES, 30, true),
      ...pic(DOTS, 52, false), ...pic(DOTS, 70, true),
      ...pic(P.WEAVE, 92, false), ...pic(P.WEAVE, 112, true),
      away, L.wait(500), shot,
    ],
  },
];
