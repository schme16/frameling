// Help picture for Text on a curve: a badge with its name round it and a title along a wave, both made with the real
// Put text on a curve command, in each theme.
const { L, scene } = require('./_text-on-path.cjs');

module.exports = [
  {
    name: 'text-on-path',
    prefs: { showTips: false, firstDrawn: true },
    choices: { 'text.pathSide': 'outside' },
    size: [1280, 800],
    width: 900,
    steps: [L.template('blank-vector'), L.wait(1200), L.cmd('view.fit'), L.wait(400), scene(['circle', 'wave']), L.wait(900), { move: [640, 790] }, { shot: '@' }],
  },
];
