// The look for spacing (brand/ab/pixel-brush): the same round brush at 10%, 25%, 50%, 100% and 200% spacing. Run:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-pixel-brush --out <dir> --only spacing
const { start, draw, dab, wave, away, shot } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
const rows = [0.1, 0.25, 0.5, 1, 2];
module.exports = [
  {
    name: 'spacing',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [...start(160), dab({ size: 9 }), ...rows.flatMap((s, i) => [dab({ spacing: s }), draw(wave(20 + i * 30, 7, 14, 146, 30))]), away, L.wait(500), shot],
  },
];
