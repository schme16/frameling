// Before and after for angular gradients: the same metal coin and pie, with the gradients Frameling had (radial, linear) and with
// angular ones. Run with
//   help-media.cjs --entries scripts/docs/ab-angular-gradient --out <dir>
const { scene } = require('./_scene.cjs');
const { STAGE } = require('../help/_shapes.cjs');
const prefs = { showTips: false, firstDrawn: true, showQuill: false, reduceMotion: true };
// The whole stage, so the coin and the pie are both there in full (the old box was a 400 x 220 window that cut them both).
const CANVAS = STAGE;

module.exports = [
  { name: 'angular-before', prefs, steps: [...scene('old'), { shot: '@', crop: CANVAS }] },
  { name: 'angular-after', prefs, steps: [...scene('angular'), { shot: '@', crop: CANVAS }] },
];
