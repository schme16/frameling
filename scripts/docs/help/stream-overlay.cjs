// Help picture for the stream overlay: its block in Preferences > Features, with the address hidden and the steps for
// OBS under it. Audience features are switched on from the debug hook so the door reads as open.
const { template, wait, js } = require('./_lib.cjs');

const F = '__frameling';

module.exports = [
  {
    name: 'stream-overlay',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(600),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(700),
      js(`(() => { const el = document.querySelector('.so-prefs'); if (!el) throw new Error('no stream overlay block'); el.scrollIntoView({ block: 'center' }); document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); el.setAttribute('data-shot', '1'); return true; })()`),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(500),
      { shot: '@', el: '[data-shot]', pad: 4 },
    ],
  },
];
