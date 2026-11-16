// The help picture for the pixel brush's dynamics: strokes whose size follows a pen, a fade and speed, a colour that wanders
// and one that smears, with the Pen, speed and fade and Colour changes folds open. (The same rows are in scripts/docs/ab-pixel-brush.)
const { start, whole, away } = require('../ab-pixel-brush/_draw.cjs');
const { row, inkBack, fill, ROWS } = require('../ab-pixel-brush/_rows.cjs');
const L = require('./_lib.cjs');

const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
// Scrolls the options so a fold sits at the top, with what it holds under it.
const scrollTo = (name) => L.js(`document.querySelector('[data-fold="${name}"]')?.scrollIntoView({ block: 'start' })`);
const ids = ['pressure', 'taper', 'speed', 'rainbow', 'wet'];

module.exports = [
  {
    name: 'pixel-brush-dynamics',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), fill,
      ...ids.flatMap((id, i) => [...row(id, 18 + i * 30), inkBack]),
      whole(ROWS.pressure.brush), open('pixel-brush-dynamics'), L.wait(300), L.js(`(() => { const s = document.querySelector('select.dab-select'); })()`), scrollTo('pixel-brush-dynamics'), L.wait(400), away, L.wait(5000), { shot: '@' },
    ],
  },
];
