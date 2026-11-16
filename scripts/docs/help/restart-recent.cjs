// Help pictures for Restart Frameling (the update card, ready to restart) and Open recent with pictures.
const { cmd, template, wait, js } = require('./_lib.cjs');

const tag = (sel) =>
  js(`(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('tag: nothing at ${sel}'); el.setAttribute('data-shot', ''); return true; })()`);

module.exports = [
  // The one Restart now every restart uses, here on the update card once a new version is in place.
  {
    name: 'restart',
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js("__framelingUpdate.show('appimage', 'ready')"),
      wait(1200),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      tag('.up-offer'),
      { shot: '@', el: '[data-shot]', pad: 18 },
    ],
  },
  // Open recent: a picture for each drawing; the one that has none yet (an older file) keeps the folder icon.
  {
    name: 'recent-drawings',
    prefs: { reduceMotion: true },
    steps: [
      template('blank-vector'),
      js(`__framelingIo.demoRecent([{ template: 'bouncing-ball', name: 'Bouncing ball' }, { template: 'walk-cycle', name: 'Walk cycle' }, { template: 'loading-spinner', name: 'Loading spinner' }, { template: 'title-card', name: 'Title card' }, { template: 'flour-sack-hop', name: 'Old flour sack', none: true }])`),
      wait(1500),
      cmd('file.openRecent'),
      wait(1800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      tag('.io-modal'),
      { shot: '@', el: '[data-shot]', pad: 14 },
    ],
  },
];
