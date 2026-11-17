// The pixel brush picker with only Wet smear and Pressure spray showing, so the two pictures can be judged up close.
const { start, draw, dab, wave, away } = require('./_draw.cjs');
const L = require('../help/_lib.cjs');
const header = (name) => L.js(`[...document.querySelectorAll('.pk-group')].find((h) => h.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)})?.click()`);
// Hide every row and heading but the two brushes, once they have drawn.
const only = L.js(`(() => {
  const keep = ['Wet smear', 'Pressure spray'];
  document.querySelectorAll('.pk-pop .pk-row').forEach((r) => { if (!keep.includes(r.querySelector('.pk-name-text')?.textContent)) r.style.display = 'none'; });
  document.querySelectorAll('.pk-pop .pk-label, .pk-pop .pk-group').forEach((e) => { e.style.display = 'none'; });
  document.querySelectorAll('.pk-pop .pk-rows').forEach((e) => { e.scrollIntoView(); });
})()`);
module.exports = [
  {
    name: 'wetspray',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      dab({ size: 6 }), draw(wave(60, 10, 14, 146, 30)),
      L.js("document.querySelector('.pk-btn').click()"), L.wait(1200), header('Pen and speed'), L.wait(900), header('Colour'), L.wait(1500),
      // Rows scrolled into view draw a moment later (they draw when seen), so give them time or the shot catches empty rows.
      only, L.wait(2500),
      { shot: '@', el: '.pk-pop', pad: 6 },
    ],
  },
];
