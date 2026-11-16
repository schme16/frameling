// Help picture for angular gradients: the coin picked, the Colours panel saying Angular.
const { scene } = require('../ab-angular-gradient/_scene.cjs');
const { dom } = require('./_shapes.cjs');

module.exports = [
  {
    name: 'gradient-angular',
    prefs: { showTips: false, firstDrawn: true, showQuill: false, reduceMotion: true },
    steps: [...scene('angular', [0]), dom(`__frameling.showPanel('colors')`), { wait: 900 }, { move: [720, 28] }, { shot: '@', crop: [0, 0, 1280, 660] }],
  },
];
