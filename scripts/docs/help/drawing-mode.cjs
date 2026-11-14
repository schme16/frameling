// Help picture for "Which layer you're drawing on": the Pixel workspace with a vector layer picked, so the tool strip's
// gold line says "5 tools off", and pressing it shows the way back. See help-media.cjs for the entry format.
const { js, wait } = require('./_lib.cjs');
const F = '__frameling';

module.exports = [
  {
    name: 'drawing-mode',
    prefs: { showTips: false, reduceMotion: true },
    steps: [
      js(`${F}.dock.applyWorkspace('pixel')`),
      wait(500),
      js(`${F}.template('blank-pixel')`),
      wait(400),
      js(`${F}.run('layers.addVector')`),
      wait(400),
      js(`document.querySelector('.ui-tool-layer')?.click()`),
      wait(500),
      { move: [640, 700] },
      wait(300),
      { shot: '@', crop: [0, 40, 700, 700] },
    ],
    width: 700,
  },
];
