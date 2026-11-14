// Help clip for Brushes you build yourself: a leafy vine is drawn as shapes, selected and made into a brush with the real
// command, a wave is drawn with it, then the Pen nib and Bristles tips each draw a wave.
// Window as in drawing.cjs (canvas 764 x 444 at 113, 47; options panel at 879).
const L = require('./_lib.cjs');
const at = (x, y) => [Math.round(495 + (x - 640) * 0.5), Math.round(269 + (y - 360) * 0.5)];
const wave = (y, amp = 34) => ({ drag: Array.from({ length: 33 }, (_, i) => at(260 + i * 24, y + amp * Math.sin((i / 32) * Math.PI * 2))), steps: 3, delay: 12 });
const tip = (name) => L.js(`[...document.querySelectorAll('.tp-chips[aria-label="Brush tip"] .bp-chip')].find((c) => c.textContent === ${JSON.stringify(name)}).click()`);
const set = (patch) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, ...${JSON.stringify(patch)} } }))`);
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5, color: "#2d3f6e" })');
const away = { move: [720, 28] };

const K = 0.5522847498307936;
const ell = (id, x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = K * rx, ky = K * ry;
  return { id, type: 'path', fill: '#2d3f6e', stroke: null, opacity: 1, paths: [{ closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] }] };
};
const vine = [ell('q0', 480, 150, 320, 14)];
for (let i = 0; i < 6; i++) vine.push(ell(`q${i + 1}`, 495 + i * 50, i % 2 ? 158 : 118, 24, 44));

module.exports = [
  {
    name: 'brush-own',
    prefs: { firstDrawn: true, showTips: false },
    choices: { 'brush.alongFit': 'repeat' },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), set({ size: 22, thinning: 0, smoothing: 0.6, streamline: 0.6 }), L.wait(900), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 560], every: 80 },
      L.wait(600),
      L.js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(vine)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.kind === 'vector'); S.setUi({ activeLayerId: l.id, selection: shapes.map((x) => x.id), tool: 'select' }); })()`),
      L.wait(1500), L.cmd('brush.makeAlong'), L.wait(1300),
      L.js("(() => { const S = __frameling.store(); S.update('cleanup', (d) => { const l = d.layers.find((x) => x.kind === 'vector'); const dr = d.drawings[l.cels[0].drawingId]; dr.shapes = dr.shapes.filter((x) => !/^q\\d+$/.test(x.id)); }); S.setUi({ selection: [] }); })()"),
      L.wait(500), L.cmd('tools.brush'), L.wait(300), wave(250), L.wait(700),
      tip('Pen nib'), L.wait(900), set({ size: 24 }), L.wait(400), wave(420), L.wait(700),
      tip('Bristles'), L.wait(900), set({ size: 40 }), L.wait(400), wave(580), L.wait(1500),
      { rec: 'stop' },
    ],
  },
];
