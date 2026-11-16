// How the dynamics feel while you draw: clips of a pressure pen, a taper, speed and a rainbow being drawn, one stroke each.
// Real pointer events, a pen for the pressure ones. `--entries scripts/docs/ab-pixel-brush --out brand/ab/pixel-brush`.
const { start, away, whole, L } = require('./_draw.cjs');
const { row, inkBack, fill } = require('./_rows.cjs');

const ids = ['pressure', 'taper', 'speed', 'rainbow', 'chalk', 'wet'];
const scene = (size) => [...start(size), fill];
const strokes = ids.flatMap((id, i) => [...row(id, 14 + i * 24), inkBack, L.wait(250)]);
module.exports = [
  {
    name: 'feel-clip',
    prefs: { firstDrawn: true, showTips: false },
    width: 640,
    steps: [...scene(160), L.js(`__frameling.run('view.fit')`), L.wait(700), { rec: '@', el: '.cv-root', pad: 0, every: 70 }, L.wait(400), ...strokes, away, { wait: 900 }, { rec: 'stop' }],
  },
];
