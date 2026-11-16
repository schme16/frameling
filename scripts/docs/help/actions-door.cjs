// Help picture for the actions door: the Actions door block in Preferences > Features, with the key hidden. Audience
// features are switched on from the debug hook so the door reads as open (the harness has no real server, so the address
// is the usual one and the key is a made-up stand-in).
const { cmd, template, wait, js } = require('./_lib.cjs');

const F = '__frameling';

module.exports = [
  {
    name: 'actions-door',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(400),
      js(`${F}.overlays.openPrefs('streaming')`),
      wait(700),
      js(`(() => { const el = document.querySelector('.sd-prefs'); if (!el) throw new Error('no actions door block'); el.scrollIntoView({ block: 'start' }); document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); el.setAttribute('data-shot', '1'); return true; })()`),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(500),
      { shot: '@', el: '[data-shot]', pad: 4 },
    ],
  },
  // The reference topic's picture: the palette finding the door's commands, with the door open.
  {
    name: 'actions-door-reference',
    size: [1280, 800],
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js('__framelingAudience.on(0)'),
      wait(400),
      cmd('view.commandPalette'),
      wait(700),
      { type: 'actions door' },
      wait(500),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(500),
      js(`(() => { const el = document.querySelector('.ui-palette'); if (!el) throw new Error('no palette'); document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); el.setAttribute('data-shot', '1'); return true; })()`),
      { shot: '@', el: '[data-shot]', pad: 12 },
    ],
  },
];
