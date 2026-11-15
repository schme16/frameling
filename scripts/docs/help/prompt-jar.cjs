// Help clip for the prompt jar: prompts arrive and the title bar only gains a number (nothing shows), then the jar is
// opened, one is pulled out (the shake and the slip), passed on, and another pulled. The first prompt goes through the
// real gate, the rest straight in. Motion is left on: the shake and the slip are the point.
const { template, wait, js } = require('./_lib.cjs');

// The top right of the window: the chip, and the card that hangs from it.
const TOP_RIGHT = [640, 0, 640, 470];
const add = (t) => js(`__framelingJar.add(${JSON.stringify(t)})`);

module.exports = [
  {
    name: 'prompt-jar',
    size: [1280, 800],
    prefs: { showQuill: false, showTips: false },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      { rec: '@', crop: TOP_RIGHT, every: 80 },
      wait(500),
      js(`__framelingJar.submit('a frog in a teacup')`),
      wait(900),
      add('a very sleepy dragon'),
      wait(700),
      add('a castle on a cloud'),
      wait(700),
      add('two snails racing'),
      wait(1200),
      { clickOn: '.jar-btn', after: 1400 },
      { clickOn: '[data-testid="promptjar.pull"]', after: 2400 },
      { clickOn: '[data-testid="promptjar.pass"]', after: 900 },
      { clickOn: '[data-testid="promptjar.pull"]', after: 2600 },
      { rec: 'stop' },
    ],
  },
];
