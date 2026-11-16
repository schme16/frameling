// Looks for diamond gradients: the same square in linear, radial, angular and diamond side by side, and a real use, a sheen on a
// flat panel. Run with
//   help-media.cjs --entries scripts/docs/ab-diamond-gradient --out <dir>
const { kinds, sheen } = require('./_scene.cjs');
const prefs = { showTips: false, firstDrawn: true, showQuill: false, reduceMotion: true };
const CANVAS = [143, 92, 730, 300];
const SHEEN_CROP = [130, 92, 750, 300];

module.exports = [
  { name: 'kinds', prefs, steps: [...kinds(), { shot: '@', crop: CANVAS }] },
  { name: 'sheen', prefs, steps: [...sheen(), { shot: '@', crop: SHEEN_CROP }] },
];
