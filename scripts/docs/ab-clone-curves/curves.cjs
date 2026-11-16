// A picture rescued with Curves: a flat, washed out hillside before and after an S bent through its curve, and a clip of the dialog
// (the points going on, the live copy waking up, Apply). `--entries scripts/docs/ab-clone-curves --out <dir>`, then crop with crop.py.
const { L, paint, start, away, clickText, curvePoints } = require('./_scene.cjs');

const PREFS = { firstDrawn: true, showTips: false, showQuill: false };
const shot = { shot: '@', el: '.cv-root', pad: 0 };
const flat = () => [...start(128), paint({ tone: [0.5, 62] }), L.wait(400)];
const bend = (pause = 0) => [
  L.cmd('tone.curves'), L.wait(500),
  curvePoints([[70, 3]]), L.wait(pause), curvePoints([[100, 48]]), L.wait(pause), curvePoints([[138, 170]]), L.wait(pause), curvePoints([[168, 236]]), L.wait(pause || 300),
];

module.exports = [
  { name: 'curves-before', prefs: PREFS, width: 640, steps: [...flat(), away, L.wait(300), shot] },
  { name: 'curves-after', prefs: PREFS, width: 640, steps: [...flat(), ...bend(), clickText('Apply'), L.wait(500), away, L.wait(300), shot] },
  {
    name: 'curves-clip',
    prefs: PREFS,
    width: 900,
    steps: [...flat(), { rec: '@', every: 80 }, L.wait(500), ...bend(550), L.wait(700), clickText('Apply'), L.wait(900), away, L.wait(500), { rec: 'stop' }],
  },
];
