// Help pictures for Connect Twitch: the code waiting to be approved (a made-up code from the harness), and the links screen
// with a few links and the picker for your own rewards. The harness has no real Twitch: the debug hook sets what the screen
// shows and the stubbed desktop side hands over a made-up code and two made-up rewards.
const { template, wait, js } = require('./_lib.cjs');

const F = '__frameling';
const shoot = (box, pad) => [
  js(`(() => { const el = document.querySelector('${box}'); if (!el) throw new Error('no Twitch block'); el.scrollIntoView({ block: 'start' }); document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); el.setAttribute('data-shot', '1'); return true; })()`),
  { shot: 'kick', crop: [0, 0, 8, 8] },
  wait(500),
  { shot: '@', el: '[data-shot]', pad },
];

const links = `[
  { id: 'a', event: 'redemption', action: 'quill.cheer', rewardId: 'r1', rewardTitle: 'Hydrate!', on: true },
  { id: 'b', event: 'raid', action: 'quill.wave', min: 10, on: true },
  { id: 'c', event: 'cheer', action: 'quill.snack', min: 100, on: true },
]`;

module.exports = [
  {
    name: 'twitch',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(700),
      js('__framelingTwitch.waiting()'),
      wait(700),
      ...shoot('.tw-connect', 4),
    ],
  },
  {
    name: 'twitch-links',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(700),
      js(`__framelingTwitch.connected('quillfan'); __framelingTwitch.rules(${links})`),
      wait(900),
      ...shoot('.tw-linkbox', 4),
    ],
  },
];
