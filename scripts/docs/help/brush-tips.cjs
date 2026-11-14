// Help clip for Brush tips: the Tip row, with a wave drawn in chalk, charcoal, watercolour and then a leaf stamp.
// Window as in drawing.cjs (canvas 764 x 444 at 113, 47; options panel at 879).
const L = require('./_lib.cjs');
const at = (x, y) => [Math.round(495 + (x - 640) * 0.5), Math.round(269 + (y - 360) * 0.5)];
const wave = (y, amp = 40) => ({ drag: Array.from({ length: 33 }, (_, i) => at(260 + i * 24, y + amp * Math.sin((i / 32) * Math.PI * 2))), steps: 3, delay: 12 });
const tip = (name) => L.js(`[...document.querySelectorAll('.tp-chips[aria-label="Brush tip"] .bp-chip')].find((c) => c.textContent === ${JSON.stringify(name)}).click()`);
const set = (patch) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, ...${JSON.stringify(patch)} } }))`);
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5, color: "#2d3f6e" })');
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'brush-tips',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), set({ size: 22, thinning: 0.3 }), L.wait(900), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 560], every: 80 },
      L.wait(700),
      tip('Chalk'), L.wait(900), wave(170), L.wait(500),
      tip('Charcoal'), L.wait(900), wave(300), L.wait(500),
      tip('Watercolour'), L.wait(900), set({ size: 34, thinning: 0 }), L.wait(500), wave(430), L.wait(500),
      tip('Stamp'), L.wait(900), set({ size: 24, thinning: 0 }), L.wait(500), wave(560), L.wait(1600),
      { rec: 'stop' },
    ],
  },
];
