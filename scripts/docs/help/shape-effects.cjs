// The help picture for effects on one shape: a soft shadow under a character, the shadow shape picked and the Effects panel saying
// "Shape: the one you picked". (The old way against the new, with a glow too, is in scripts/docs/ab-shape-fx.)
const { scene } = require('../ab-shape-fx/_scene.cjs');

module.exports = [
  {
    name: 'shape-effects',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: scene('shadow', 'new', [{ shot: '@', crop: [140, 45, 1065, 700] }]),
  },
];
