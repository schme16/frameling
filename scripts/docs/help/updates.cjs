// Help picture for new versions: the offer card with the release's notes and the three answers (a pretend release, since
// the capture never talks to GitHub).
const { template, wait, js } = require('./_lib.cjs');

const tag = (sel) =>
  js(`(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('tag: nothing at ${sel}'); el.setAttribute('data-shot', ''); return true; })()`);

module.exports = [
  {
    name: 'updates',
    prefs: { reduceMotion: true },
    steps: [
      template('bouncing-ball'),
      js("__framelingUpdate.show('appimage')"),
      wait(1200),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      wait(400),
      tag('.up-offer'),
      { shot: '@', el: '[data-shot]', pad: 18 },
    ],
  },
];
