// Help picture for "Pixels or Vectors": the Pixel workspace with a vector layer picked, so the switch at the top of the tool
// strip lights Vectors with a gold outline and the groups that lost tools say how many. See help-media.cjs for the entry format.
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
      { move: [640, 700] },
      wait(300),
      { shot: '@', crop: [0, 40, 700, 700] },
    ],
    width: 700,
  },
];
