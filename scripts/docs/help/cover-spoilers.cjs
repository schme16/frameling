// Help picture for covering secrets and unread words: the prompt jar's card with a pulled prompt covered, a plain Read it
// on it, because the viewers might see this window. The prompt is made up here and never read out.
const { template, wait, js } = require('./_lib.cjs');

module.exports = [
  {
    name: 'cover-spoilers',
    size: [1280, 800],
    prefs: { reduceMotion: true, showQuill: false, showTips: false },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(600),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      js(`__framelingJar.add('a frog in a teacup'); __framelingJar.add('a very sleepy dragon')`),
      wait(300),
      { clickOn: '.jar-btn', after: 700 },
      { clickOn: '[data-testid="promptjar.pull"]', after: 1200 },
      { shot: '@', crop: [680, 0, 600, 470] },
    ],
  },
];
