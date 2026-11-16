// The help picture for Curves and Levels: a flat, washed out hillside, the Curves dialog open with an S bent through it, and the
// live copy showing the rescued picture. (The before and after on the canvas are in scripts/docs/ab-clone-curves.)
const S = require('../ab-clone-curves/_scene.cjs');
const { L, paint, start, clickText, curvePoints } = S;

module.exports = [
  {
    name: 'curves-levels',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    width: 1000,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(128),
      paint({ tone: [0.5, 62] }), L.wait(300),
      L.cmd('tone.curves'), L.wait(500),
      curvePoints([[70, 3], [100, 48], [138, 170], [168, 236]]), L.wait(400),
      { move: [1200, 780] }, L.wait(300), { shot: '@' },
    ],
  },
];
