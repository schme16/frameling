// Help clip for Brush tips: the Tip row, with a wave drawn in chalk, charcoal, watercolour and then a leaf stamp.
// Where things land comes from the running app (view() and at() in _shapes.cjs), so no window numbers are kept here.
const L = require('./_lib.cjs');
const { view, at, UI } = require('./_shapes.cjs');
const wave = (y, amp = 40) => ({ drag: Array.from({ length: 33 }, (_, i) => at(260 + i * 24, y + amp * Math.sin((i / 32) * Math.PI * 2))), steps: 3, delay: 12 });
// Opens the Tip picker and clicks the row with this name (a stamp is its shape: Leaf, Heart...). Spread it into the steps.
const tip = (name) => [
  L.js(`document.querySelector('[data-testid="brush-tips"] .pk-btn').click()`),
  L.wait(500),
  L.js(`[...document.querySelectorAll('.pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`),
];
const set = (patch) => L.js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, ...${JSON.stringify(patch)} } }))`);
const fit = view(0.5);
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'brush-tips',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), UI({ color: '#2d3f6e' }), L.cmd('tools.brush'), set({ size: 22, thinning: 0.3 }), L.wait(900), fit, away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: { stageCrop: { rightGap: 80, down: 109 } }, every: 80 },
      L.wait(700),
      ...tip('Chalk'), L.wait(900), wave(170), L.wait(500),
      ...tip('Charcoal'), L.wait(900), wave(300), L.wait(500),
      ...tip('Watercolour'), L.wait(900), set({ size: 34, thinning: 0 }), L.wait(500), wave(430), L.wait(500),
      ...tip('Leaf'), L.wait(900), set({ size: 24, thinning: 0 }), L.wait(500), wave(560), L.wait(1600),
      { rec: 'stop' },
    ],
  },
];
