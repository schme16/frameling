// The brush picker with a near black paint colour selected, in both themes (card picker-samples-dark). Samples must stay
// legible whatever the paint colour is. Entries:
//   pixel:  the pixel brush picker, a few rows (Wet smear, Pressure spray and the first two of the list)
//   vector: the vector brush picker with the Pens group open
//   preview: the stroke preview at the top of the vector brush options
// Rows draw when they scroll into view, a moment after they appear, so every shot waits for that.
// Run on whichever build is checked out (--renderer for an older one):
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-picker-dark --out <dir>
const { start, draw, dab, wave } = require('../ab-pixel-brush/_draw.cjs');
const L = require('../help/_lib.cjs');
const F = '__frameling';
const NEAR_BLACK = '#1b1a20';
const header = (name) => L.js(`[...document.querySelectorAll('.pk-group')].find((h) => h.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)})?.click()`);
const paint = L.js(`${F}.store().setUi({ color: ${JSON.stringify(NEAR_BLACK)} })`);
const only = (keep) => L.js(`(() => {
  const keep = ${JSON.stringify(keep)};
  document.querySelectorAll('.pk-pop .pk-row').forEach((r) => { if (!keep.includes(r.querySelector('.pk-name-text')?.textContent)) r.style.display = 'none'; });
  document.querySelectorAll('.pk-pop .pk-label, .pk-pop .pk-group').forEach((e) => { e.style.display = 'none'; });
  document.querySelectorAll('.pk-pop .pk-rows').forEach((e) => { e.scrollIntoView(); });
})()`);
module.exports = [
  {
    name: 'pixel',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160),
      paint,
      dab({ size: 6 }), draw(wave(60, 10, 14, 146, 30)),
      paint,
      L.js("document.querySelector('.pk-btn').click()"), L.wait(1200), header('Pen and speed'), L.wait(900), header('Colour'), L.wait(1500),
      only(['Wet smear', 'Pressure spray']), L.wait(2500),
      { shot: '@', el: '.pk-pop', pad: 6 },
    ],
  },
  {
    name: 'vector',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), L.wait(700),
      L.js(`${F}.declinePenCheck()`),
      L.cmd('tools.brush'), L.wait(300),
      paint,
      L.js("document.querySelector('.pk-btn').click()"), L.wait(1500),
      header('Pens'), L.wait(2500),
      { shot: '@', el: '.pk-pop', pad: 6 },
    ],
  },
  {
    // The stroke preview at the top of the vector brush options, which asks for the paint colour first.
    name: 'preview',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), L.wait(700),
      L.js(`${F}.declinePenCheck()`),
      L.cmd('tools.brush'), L.wait(300),
      paint, L.wait(800),
      L.js(`document.querySelector('.cv-preview').parentElement.classList.add('shotme')`), L.wait(200),
      { shot: '@', el: '.shotme', pad: 6 },
    ],
  },
];
