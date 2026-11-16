// A/B looks for Turn into pixels and Turn into shapes: the Now and After pictures for each case, once per theme.
//   npm run help:media -- --entries scripts/docs/ab-convert --out brand/ab/convert
// then scripts/ab/convert-montage.sh builds the captioned side by side pictures.
const L = require('../help/_lib.cjs');
const { vectorCharacter, pixelMushroom, pixelPhoto, press } = require('../help/_convert-art.cjs');
const previews = { shot: '@', el: '.cvt-previews', pad: 6 };
const modal = { shot: '@', el: '.io-modal', pad: 0 };
const away = { move: [720, 28] };
const size = [1280, 900];

const pixelsAt = (name, s, edges) => ({ name, size, steps: [L.template('blank-vector'), vectorCharacter, L.wait(300), L.cmd('convert.toPixels'), L.wait(700), press(`convert.size.${s}`), edges ? press(`convert.edges.${edges}`) : L.wait(10), L.wait(1000), away, previews] });

module.exports = [
  pixelsAt('pixels-4x-hard', 4, 'hard'),
  pixelsAt('pixels-16x-hard', 16, 'hard'),
  pixelsAt('pixels-1x-soft', 1, 'smooth'),
  { name: 'trace-art-steps', size, steps: [L.template('blank-pixel'), pixelMushroom, L.wait(300), L.cmd('convert.toShapes'), L.wait(1000), away, previews] },
  { name: 'trace-art-curves', size, steps: [L.template('blank-pixel'), pixelMushroom, L.wait(300), L.cmd('convert.toShapes'), L.wait(700), press('convert.edges.smooth'), L.wait(1000), away, previews] },
  { name: 'trace-photo', size, steps: [L.template('blank-pixel'), pixelPhoto, L.wait(300), L.cmd('convert.toShapes'), L.wait(3500), away, previews] },
  { name: 'trace-photo-dialog', size, steps: [L.template('blank-pixel'), pixelPhoto, L.wait(300), L.cmd('convert.toShapes'), L.wait(3500), away, modal] },
];
