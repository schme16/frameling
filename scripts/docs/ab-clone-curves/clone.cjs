// A cloned-out blemish: the hillside with dust and a hair in the sky, before and after the clone stamp, and a clip of the source
// following the hand. `--entries scripts/docs/ab-clone-curves --out <dir>`, then crop with crop.py.
const { L, paint, start, draw, hover, retouch, pick, away, line } = require('./_scene.cjs');

const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
const CHOICES = { 'clone.align': 'aligned' };
const brush = () => retouch('clone', { sample: 'layer', brush: { size: 11, hardness: 0.8, spacing: 0.15 } });
const shot = { shot: '@', el: '.cv-root', pad: 0 };
const scene = () => [...start(128), paint({ dirt: true }), L.wait(300), brush(), pick('clone-stamp'), L.wait(200)];
// Each stroke is slow, so a clip shows the ring following the pen.
const cloneAll = (delay) => [
  draw([[80, 14, 0.5]], { alt: true }),
  draw(line(41, 15, 34, 12, 12), { delay }),
  draw(line(30, 10, 52, 40, 50), { delay }),
  draw(line(49, 29, 52, 32, 6), { delay }),
  draw(line(18, 36, 26, 36, 14), { delay }),
];

module.exports = [
  { name: 'clone-before', prefs: PREFS, choices: CHOICES, width: 640, steps: [...scene(), away, L.wait(300), shot] },
  { name: 'clone-after', prefs: PREFS, choices: CHOICES, width: 640, steps: [...scene(), ...cloneAll(8), away, L.wait(3000), shot] },
  {
    name: 'clone-clip',
    prefs: PREFS,
    choices: CHOICES,
    width: 640,
    steps: [...scene(), { rec: '@', el: '.cv-root', pad: 0, every: 70 }, L.wait(600), hover(60, 40), L.wait(500), ...cloneAll(45), hover(70, 70), L.wait(600), away, L.wait(500), { rec: 'stop' }],
  },
];
