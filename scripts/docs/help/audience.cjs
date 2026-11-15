// Help picture for audience features: the red On air pill with its Stop button in the title bar, and the card that hangs
// from it with a few things waiting. Pretend actions from the debug hook, so nothing real is touched.
const { template, wait, js, cmd } = require('./_lib.cjs');

module.exports = [
  {
    name: 'audience',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.demo(); __framelingAudience.on(5)'),
      wait(400),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(300),
      cmd('audience.show'),
      wait(900),
      { shot: '@', crop: [680, 0, 600, 470] },
    ],
  },
];
