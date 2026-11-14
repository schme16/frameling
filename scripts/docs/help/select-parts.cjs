// Help clip for "Picking part of a shape": a box round one corner picks just that corner and pulling it stretches the
// shape; Ctrl and the same box picks the whole shape and moving it takes the lot. See scripts/docs/help-media.cjs.
const { T, UI, away, view, put, tool, draw, rect, ell, stroke, INK, REC, STOP, WARM } = require('./_shapes.cjs');

const CANVAS = [113, 47, 764, 444];
const BLUE = '#4a7cf0';
const SUN = '#f7c95a';
const CORNER_BOX = [[780, 150], [680, 250]];

// The art and the first pick, shared with the before/after looks.
const setup = () => [T('blank-vector'), view(0.6), put('Lines', [rect(400, 200, 320, 240, BLUE, stroke(INK, 6, { join: 'miter' })), ell(110, 300, 190, 190, SUN, stroke(INK, 6))], []), tool('select'), { wait: 600 }, away, { wait: 300 }];

const entries = [
  {
    name: 'select-parts',
    prefs: { showTips: false, reduceMotion: true },
    choices: { 'select.vectorScope': 'parts' },
    steps: [
      ...setup(),
      WARM,
      REC(CANVAS, 70),
      { wait: 700 },
      draw(CORNER_BOX, { steps: 14, delay: 16, after: 1100 }),
      draw([[720, 200], [800, 140]], { steps: 14, delay: 16, after: 1500 }),
      { key: 'z', mods: ['control'] },
      { wait: 700 },
      UI({ selection: [] }),
      { wait: 500 },
      draw(CORNER_BOX, { steps: 14, delay: 16, mods: ['control'], after: 1100 }),
      draw([[540, 380], [610, 345]], { steps: 14, delay: 16, after: 1800 }),
      STOP,
    ],
  },
];

module.exports = entries;
module.exports.setup = setup;
