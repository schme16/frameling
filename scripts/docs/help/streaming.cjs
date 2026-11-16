// Help picture for the Streaming tab: Preferences > Streaming with the streaming tools on, the nine folded under
// "Choose one by one", and the sharing settings below them.
const { template, wait, js } = require('./_lib.cjs');

const F = '__frameling';

module.exports = [
  {
    name: 'streaming',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      wait(400),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      { shot: '@', el: '.ui-prefs', pad: 0 },
    ],
  },
];
