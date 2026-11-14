// Help clip for Align and space out: five shapes dotted about, picked all together, lined up on their middles, then spread out
// evenly. The Properties panel is on show so the buttons are in the picture. Window as in drawing.cjs (canvas 764 x 444 at 113, 47).
const L = require('./_lib.cjs');
const INK = '#1d1b26';
let nid = 0;
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const rect = (x, y, w, h, fill) => ({ id: `al${++nid}`, type: 'path', paths: [rectPath(x, y, w, h)], fill, stroke: { color: INK, width: 5, join: 'round', cap: 'round' }, opacity: 1 });
const SHAPES = [rect(150, 120, 170, 120, '#ff8fb1'), rect(400, 330, 90, 90, '#8fd0ff'), rect(560, 90, 130, 70, '#ffd36b'), rect(760, 260, 60, 150, '#9be0b4'), rect(960, 140, 110, 110, '#b79cff')];
const put = L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(SHAPES)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); S.setUi({ tool: 'select', selection: ${JSON.stringify(SHAPES.map((s) => s.id))} }); })()`);
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
const scrollTo = (text, pad = 8) => L.js(`(() => { const el = [...document.querySelectorAll('h3')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); const sc = document.querySelector('.rd-scroll'); if (!el || !sc) return 'missing'; sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - ${pad}; return 'ok'; })()`);
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'align-space-out',
    width: 900,
    steps: [
      L.template('blank-vector'), put, fit, L.panel('symbol-props'), L.wait(900), scrollTo('Align and space out', 40), L.wait(400), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [112, 44, 1084, 448], every: 80 }, L.wait(1100),
      L.cmd('select.alignMiddle'), L.wait(1700),
      L.cmd('select.spreadAcross'), L.wait(1900),
      L.cmd('select.alignBottom'), L.wait(1700),
      { rec: 'stop' },
    ],
  },
];
