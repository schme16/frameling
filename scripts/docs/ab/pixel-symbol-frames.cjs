// Looks for a symbol that holds a whole animation: the first-time question on a layer with several drawings, and the
// in-between offer now showing between two pixel drawings.
// Run: SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --only frames-question,pixel-offer --out brand/ab/pixel-symbol-frames
const L = require('../help/_lib.cjs');
const { SLIME } = require('../help/pixel-symbol-frames.cjs');

const entries = [
  {
    name: 'frames-question',
    steps: [L.js(SLIME), L.wait(600), L.cmd('symbols.make'), L.wait(1200), { move: [20, 780] }, L.wait(300), { shot: '@', crop: [0, 0, 1280, 800] }],
  },
  {
    name: 'pixel-offer',
    steps: [L.js(SLIME), L.wait(600), { click: [416, 661] }, L.wait(900), { move: [20, 780] }, L.wait(300), { shot: '@', crop: [108, 440, 700, 360] }],
  },
];

module.exports = entries.map((e) => ({ ...e, prefs: { firstDrawn: true, showTips: false } }));
