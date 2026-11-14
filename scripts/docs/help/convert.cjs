// Help pictures for Turn into pixels and Turn into shapes: the dialog open on a good case, once per theme (see
// scripts/docs/help-media.cjs). The dialog is cropped to itself.
const L = require('./_lib.cjs');
const { vectorCharacter, pixelMushroom, press } = require('./_convert-art.cjs');
const shot = { shot: '@', el: '.io-modal', pad: 0 };
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'convert-to-pixels',
    size: [1280, 900],
    steps: [L.template('blank-vector'), vectorCharacter, L.wait(300), L.cmd('convert.toPixels'), L.wait(700), press('convert.size.8'), L.wait(900), away, shot],
  },
  {
    name: 'convert-to-shapes',
    size: [1280, 900],
    steps: [L.template('blank-pixel'), pixelMushroom, L.wait(300), L.cmd('convert.toShapes'), L.wait(900), away, shot],
  },
];
