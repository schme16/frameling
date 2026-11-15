// Help picture for "Getting your viewers taking part": the Streaming tab with the Show me how card at the top, audience
// features on, Twitch connected (a made-up name from the debug hook) and the parts of the route in a row beneath it.
const { template, wait, js } = require('./_lib.cjs');

const F = '__frameling';

module.exports = [
  {
    name: 'viewers-take-part',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(400),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(800),
      js(`__framelingTwitch.connected('quillfan')`),
      wait(700),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      { shot: '@', el: '.ui-prefs', pad: 0 },
    ],
  },
];
