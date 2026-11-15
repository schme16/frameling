// Help picture for Going live with OBS: Preferences with the link switched on and connected, and Stream-safe already up
// because a (pretend) OBS has started streaming. The runner has no desktop side, so ?debug's __framelingObs stands in for OBS.
const { template, wait, js } = require('./_lib.cjs');

const F = '__frameling';
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, wait(500)];

module.exports = [
  {
    name: 'obs-golive',
    prefs: { reduceMotion: true },
    size: [1280, 800],
    steps: [
      template('blank-vector'),
      js(`__framelingObs.fake({ password: true })`),
      js(`${F}.prefs.set({ obsLink: true })`),
      wait(900),
      js(`${F}.overlays.openPrefs('general')`),
      wait(1600),
      js(`(() => { const el = document.querySelector('[data-obs-section]'); el.scrollIntoView({ block: 'center' }); el.setAttribute('data-shot', '1'); return true; })()`),
      ...settle,
      { shot: '@', el: '[data-obs-section]', pad: 14 },
    ],
  },
];
