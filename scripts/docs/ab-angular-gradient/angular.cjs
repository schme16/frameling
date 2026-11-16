// Before and after for angular gradients: the same metal coin and pie, with the gradients Frameling had (radial, linear) and with
// angular ones. Run with
//   help-media.cjs --entries scripts/docs/ab-angular-gradient --out <dir>
const { scene } = require('./_scene.cjs');
const prefs = { showTips: false, firstDrawn: true, showQuill: false, reduceMotion: true };
const CANVAS = [213, 107, 400, 220];

module.exports = [
  { name: 'angular-before', prefs, steps: [...scene('old'), { shot: '@', crop: CANVAS }] },
  { name: 'angular-after', prefs, steps: [...scene('angular'), { shot: '@', crop: CANVAS }] },
];
