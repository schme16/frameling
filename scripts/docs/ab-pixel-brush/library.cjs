// The pixel side of the brush picker, opened over the pixel brush's options, with the starters in their groups.
const { start, draw, dab, wave, away } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
const header = (name) => L.js(`[...document.querySelectorAll('.pk-group')].find((h) => h.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)})?.click()`);
module.exports = [
  {
    name: 'library',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      dab({ size: 6 }), draw(wave(60, 10, 14, 146, 30)),
      L.js("document.querySelector('.pk-btn').click()"), L.wait(1200), header('Scatter and spray'), L.wait(900), header('Picture tips'), L.wait(1200), away, L.wait(400),
      { shot: '@' },
    ],
  },
];
