// Help picture for Repeat, once per theme: see scripts/docs/help-media.cjs. A ring of petals, a grid of tiles and a
// mirrored wing, side by side, each a real repeat on one shape.
const { T, UI, away, put, label } = require('./_shapes.cjs');
const R = require('./_repeat.cjs');

// The window is 1600 x 1000; the page sits at 0.7484 zoom with its corner at (191, 99.56).
const PAGE = [191, 100, 958, 539];

module.exports = [
  { name: 'repeat', size: [1600, 1000], width: 1000, choices: { 'repeat.ringTurn': 'follow' }, steps: [T('blank-vector'), { wait: 700 },
    (() => {
      const r = R.ring(R.at(0.8, 220, 340), 0.8, 10, { x: 0, y: 0 });
      const g = R.grid(R.at(0.7, 640, 340), 0.7, 4, 3);
      const w = R.wing(R.at(0.62, 1045, 340), 0.62);
      return put('Lines', [r.repeated, r.dot, g, ...w, label(220, 560, 'A ring'), label(640, 560, 'Rows and columns'), label(1045, 560, 'A mirror image')], [0]);
    })(),
    UI({ selection: [] }), { wait: 600 }, away, { wait: 300 }, { shot: '@', crop: PAGE }] },
];
