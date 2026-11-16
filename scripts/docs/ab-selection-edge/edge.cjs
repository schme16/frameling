// Before and after for the selection edge: the same sun, the same round selection, copied and pasted on to the dark field.
// Hard edge (before) against feathered (after); then the selection itself, as it was and grown. Run with
//   help-media.cjs --entries scripts/docs/ab-selection-edge --out <dir>
const { S, js, wait, start, copyAcross } = require('./_scene.cjs');

// The canvas area to crop to: the window is 1280 x 800 and the picture sits in the middle, so this is tuned by eye.
const CROP = [478, 272, 412, 262];

module.exports = [
  { name: 'feather-before', prefs: { showTips: false, firstDrawn: true, showQuill: false }, steps: [...start(), js(`${S}.disc(16, 18, 12)`), ...copyAcross(), { shot: '@', crop: CROP }] },
  { name: 'feather-after', prefs: { showTips: false, firstDrawn: true, showQuill: false }, steps: [...start(), js(`${S}.disc(16, 18, 12)`), js(`${S}.edge('feather', 5)`), wait(300), ...copyAcross(), { shot: '@', crop: CROP }] },
  { name: 'grow-before', prefs: { showTips: false, firstDrawn: true, showQuill: false }, steps: [...start(), js(`${S}.disc(16, 18, 8)`), wait(600), { shot: '@', crop: CROP }] },
  { name: 'grow-after', prefs: { showTips: false, firstDrawn: true, showQuill: false }, steps: [...start(), js(`${S}.disc(16, 18, 8)`), js(`${S}.edge('grow', 4)`), wait(600), { shot: '@', crop: CROP }] },
];
