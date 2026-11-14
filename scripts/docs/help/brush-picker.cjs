// Help clip for The brush picker: a big library (144 brushes in 12 groups) in the Brush options, the picker opened, a
// group opened, a search typed, the arrow keys and Enter, then a wave drawn with the brush picked. Window as in
// brush-presets.cjs (canvas 764 x 444 at 113, 47; options panel on the right).
const L = require('./_lib.cjs');
const { libraryText } = require('./_library.cjs');
const at = (x, y) => [Math.round(495 + (x - 640) * 0.5), Math.round(269 + (y - 360) * 0.5)];
const wave = (y, amp = 50) => ({ drag: Array.from({ length: 29 }, (_, i) => at(300 + i * 24, y + amp * Math.sin((i / 28) * Math.PI * 2))), steps: 3, delay: 12 });
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
const away = { move: [720, 28] };
const header = (name) => L.js(`[...document.querySelectorAll('.pk-group')].find((h) => h.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}).click()`);
const typing = (word) => [...word].flatMap((_, n) => [{ type: word.slice(0, n + 1) }, L.wait(260)]);

module.exports = [
  {
    name: 'brush-picker',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    poster: 38,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(900),
      L.js(`__brushes.addFromText(${JSON.stringify(libraryText())})`), L.wait(4200), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 760], every: 80 },
      L.wait(800),
      L.js("document.querySelector('.pk-btn').click()"), L.wait(1300),
      header('Painting'), L.wait(1100),
      L.js("document.querySelector('.pk-search input').focus()"), L.wait(300),
      ...typing('pen'), L.wait(1100),
      { key: 'Down' }, L.wait(450), { key: 'Down' }, L.wait(450), { key: 'Down' }, L.wait(900),
      { key: 'Enter' }, L.wait(900),
      wave(330), L.wait(500), wave(470, 35), L.wait(1300),
      { rec: 'stop' },
    ],
  },
];
