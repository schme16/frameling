// The board looks for Offset path and the Width tool: the same ghost as drawn, offset out and offset in; the same line
// even, then made fat in the middle with the Width tool. Once per theme, in the real app.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/.bin/electron scripts/docs/help-media.cjs --entries scripts/docs/ab-offset-width --out <dir>
const { T, UI, view, away, put, stroke, label, STAGE } = require('../help/_shapes.cjs');
const O = require('../help/_offsetwidth.cjs');

const CANVAS = STAGE;
const YELLOW = '#ffd23f';
const RED = '#e0685e';
const choices = { 'shapes.offsetKeep': 'copy' };
const eyesAndLabel = (text) => put('Lines', [...O.eyes(530, 110), label(640, 440, text)], []);
const ghostScene = (text, ...after) => [T('blank-vector'), view(0.6), put('Lines', [O.ghost(530, 110)], [0]), ...after, eyesAndLabel(text), UI({ selection: [] }), { wait: 500 }, away, { wait: 300 }, { shot: '@', crop: [283, 90, 420, 290] }];
const lineScene = (shots) => [T('blank-vector'), view(0.6), put('Lines', [O.sLine(12, '#2a6f97')], [0]), UI({ tool: 'width' }), { wait: 600 }, away, { wait: 300 }, ...shots];

module.exports = [
  { name: 'offset-0-as-drawn', width: 1000, choices, steps: ghostScene('As drawn') },
  { name: 'offset-1-out', width: 1000, choices, steps: ghostScene('Out 16 px, round corners, recoloured', ...O.offset('out', 16), ...O.makeCopy, O.wear(YELLOW, null)) },
  { name: 'offset-2-in', width: 1000, choices, steps: ghostScene('In 12 px, as a dashed cut line', ...O.offset('in', 12), ...O.makeCopy, O.wear(null, stroke(RED, 4, { cap: 'butt', dash: [3, 2] }))) },
  { name: 'width-0-even', width: 1000, steps: lineScene([{ shot: '@', crop: CANVAS }]) },
  { name: 'width-1-fat', width: 1000, steps: lineScene([
    { drag: O.pull(0.5, 36).map(([x, y]) => require('../help/_shapes.cjs').at(x, y)), steps: 14, delay: 18, after: 600 },
    { drag: O.pull(0.22, 18).map(([x, y]) => require('../help/_shapes.cjs').at(x, y)), steps: 10, delay: 18, after: 600 },
    { drag: O.edge(0.84, 6, 1.2).map(([x, y]) => require('../help/_shapes.cjs').at(x, y)), steps: 10, delay: 18, after: 800 },
    away, { wait: 300 }, { shot: '@', crop: CANVAS }]) },
];
