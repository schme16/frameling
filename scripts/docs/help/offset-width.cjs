// Help picture and clip for Offset path and the Width tool, once per theme: see scripts/docs/help-media.cjs.
const { T, UI, view, away, put, stroke, INK, label, REC, STOP, WARM, draw, at } = require('./_shapes.cjs');
const O = require('./_offsetwidth.cjs');

const CANVAS = [113, 47, 764, 444];
const YELLOW = '#ffd23f';
const RED = '#e0685e';

module.exports = [
  // One ghost three ways, left to right: as drawn, a bigger copy behind it (a sticker edge), a smaller copy in front (a cut line).
  { name: 'offset-path', width: 1000, choices: { 'shapes.offsetKeep': 'copy' }, steps: [T('blank-vector'), view(0.6),
    put('Lines', [O.ghost(50, 150)], [0]),
    put('Lines', [O.ghost(450, 150)], [0]), ...O.offset('out', 16), ...O.makeCopy, O.wear(YELLOW, null),
    put('Lines', [O.ghost(850, 150)], [0]), ...O.offset('in', 12), ...O.makeCopy, O.wear(null, stroke(RED, 4, { cap: 'butt', dash: [3, 2] })),
    put('Lines', [...O.eyes(50, 150), ...O.eyes(450, 150), ...O.eyes(850, 150), label(160, 480, 'As drawn'), label(560, 480, 'Out 16'), label(960, 480, 'In 12')], []),
    UI({ selection: [] }), { wait: 600 }, away, { wait: 300 }, { shot: '@', crop: CANVAS }] },

  // A line made fat where you drag it: grab the middle, pull out, add two more points.
  { name: 'tool-width', width: 1000, steps: [T('blank-vector'), view(0.6),
    put('Lines', [O.sLine(12, '#2a6f97')], [0]),
    UI({ tool: 'width' }), { wait: 700 }, away, WARM, REC(CANVAS, 70), { wait: 900 },
    draw(O.pull(0.5, 36), { steps: 14, delay: 18, after: 900 }),
    draw(O.pull(0.22, 18), { steps: 10, delay: 18, after: 800 }),
    draw(O.edge(0.84, 6, 1.2), { steps: 10, delay: 18, after: 1600 }),
    { wait: 600 }, STOP] },
];
