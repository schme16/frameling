// The help picture for Soft paint: the Pixel workspace with the airbrush picked, its options open and the four test strokes
// drawn. (The same strokes, tool by tool, are in scripts/docs/ab-soft-paint.)
const { scene } = require('../ab-soft-paint/_draw.cjs');
const L = require('./_lib.cjs');

module.exports = [
  {
    name: 'soft-paint',
    prefs: { firstDrawn: true, showTips: false },
    steps: [L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...scene('airbrush', 'smooth'), { shot: '@' }],
  },
];
