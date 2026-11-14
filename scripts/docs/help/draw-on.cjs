// Help clip for Make a line draw itself: a winding route and a ring picked, Draw it on pressed, and the clip plays while
// they draw themselves in. Window as in brush-presets.cjs (canvas 764 x 444 at 113, 47; the Draw on panel on the right).
const L = require('./_lib.cjs');
const INK = '#1d1b26';
let nid = 0;
const hid = () => `d${++nid}`;
const KAPPA = 0.5522847498307936;
const ring = (cx, cy, r) => {
  const k = KAPPA * r;
  return { closed: true, points: [
    { x: cx + r, y: cy, c1: { x: cx + r, y: cy - k }, c2: { x: cx + k, y: cy - r } },
    { x: cx, y: cy + r, c1: { x: cx + r, y: cy + k }, c2: { x: cx + k, y: cy + r } },
    { x: cx - r, y: cy, c1: { x: cx - k, y: cy + r }, c2: { x: cx - r, y: cy + k } },
    { x: cx, y: cy - r, c1: { x: cx - r, y: cy - k }, c2: { x: cx - k, y: cy - r } },
  ] };
};
const route = {
  closed: false,
  points: [
    { x: 150, y: 520 },
    { x: 470, y: 300, c1: { x: 260, y: 300 }, c2: { x: 330, y: 160 } },
    { x: 760, y: 520, c1: { x: 600, y: 440 }, c2: { x: 620, y: 600 } },
    { x: 1080, y: 250, c1: { x: 900, y: 440 }, c2: { x: 940, y: 150 } },
  ],
};
const shape = (paths, color, width) => ({ id: hid(), type: 'path', paths, fill: null, stroke: { color, width, join: 'round', cap: 'round' }, opacity: 1 });
const SHAPES = [shape([route], '#d3445f', 14), shape([ring(1030, 540, 70)], '#3b82f6', 14)];
const put = L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(SHAPES)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); S.load(S.get().doc); const d = S.get().doc; const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; S.setUi({ tool: 'select', activeLayerId: l.id, frame: 0, selection: d.drawings[l.cels[0].drawingId].shapes.map((s) => s.id), zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 }); return true; })()`);
/** Types a new number in the panel's Takes box (frames), the way a person would. */
const takes = (n) => L.js(`(() => { const i = [...document.querySelectorAll('input')].find((x) => x.getAttribute('aria-label') === 'Takes (frames)'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${n}'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'draw-on',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), put, L.panel('draw-on'), L.wait(900), away, L.wait(400),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 560], every: 80 },
      L.wait(900),
      takes(24), L.wait(700),
      L.cmd('trim.drawOn'), L.wait(1400),
      L.cmd('timeline.play'), L.wait(2500),
      L.cmd('timeline.play'), L.wait(300),
      L.js('__frameling.store().setUi({ frame: __frameling.store().get().doc.length - 1, playing: false })'), L.wait(1300),
      { rec: 'stop' },
    ],
  },
];
