// The help picture for the pixel brush's grain and dual tip: a plain stroke for comparison, then chalk, pencil on paper, a
// sponge, spatter and bristles, with the Grain and dual tip fold open. (The same rows are in scripts/docs/ab-pixel-brush.)
const { start, whole, away } = require('../ab-pixel-brush/_draw.cjs');
const { row, inkBack, fill, ROWS } = require('../ab-pixel-brush/_rows.cjs');
const L = require('./_lib.cjs');

const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
// Scrolls the options so a fold sits at the top, with what it holds under it.
const scrollTo = (name) => L.js(`document.querySelector('[data-fold="${name}"]')?.scrollIntoView({ block: 'start' })`);
const ids = ['plain', 'chalk', 'pencil', 'sponge', 'spatter', 'bristles'];

module.exports = [
  {
    name: 'pixel-brush-texture',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    steps: [
      L.js(`__frameling.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), fill,
      ...ids.flatMap((id, i) => [...row(id, 16 + i * 25), inkBack]),
      whole(ROWS.chalk.brush), open('pixel-brush-texture'), L.wait(300), scrollTo('pixel-brush-texture'), L.wait(400), away, L.wait(5000), { shot: '@' },
    ],
  },
];
