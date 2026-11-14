// Help clip for History: five steps made one after another (each names itself in the list), then a click back to the
// second step (the picture goes back and the later steps turn grey), and a click on the newest one to come forward again.
// Window as in drawing.cjs (canvas 764 x 444 at 113, 47). Also used for the look in brand/ab/history.
const L = require('./_lib.cjs');
const INK = '#1d1b26';
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const st = { color: INK, width: 5, join: 'round', cap: 'round' };
const box = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [rectPath(x, y, w, h)], fill, stroke: st, opacity: 1 });
const STEPS = [
  ['Draw sun', box('hs1', 900, 90, 150, 150, '#ffd36b')],
  ['Draw hill', box('hs2', 120, 420, 700, 200, '#9be0b4')],
  ['Draw house', box('hs3', 280, 250, 220, 190, '#ff8fb1')],
  ['Draw door', box('hs4', 360, 340, 60, 100, '#b79cff')],
  ['Draw window', box('hs5', 440, 290, 50, 50, '#8fd0ff')],
];
const add = ([label, shape]) => L.js(`(() => { const S = __frameling.store(); S.update(${JSON.stringify(label)}, (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(${JSON.stringify(shape)}); }); })()`);
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
const row = (n) => L.js(`document.querySelectorAll('.hi-panel .hi-step')[${n}].click()`);
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'history',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.panel('history'), L.wait(900), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [0, 40, 1280, 680], every: 80 },
      L.wait(500),
      ...STEPS.flatMap((s) => [add(s), L.wait(650)]),
      L.wait(900),
      row(3), L.wait(1900),
      row(0), L.wait(1700),
      { rec: 'stop' },
    ],
  },
];
