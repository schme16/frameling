// Help clip for Saved brushes: three starter brushes picked one after another and a wave drawn with each (ink thin,
// marker fat, tapered pointy), then the size changed, the brush saved under a name, and a wave drawn with that.
// Window as in drawing.cjs (canvas 764 x 444 at 113, 47; options panel at 879).
const L = require('./_lib.cjs');
const at = (x, y) => [Math.round(495 + (x - 640) * 0.5), Math.round(269 + (y - 360) * 0.5)];
const wave = (y, amp = 50) => ({ drag: Array.from({ length: 29 }, (_, i) => at(300 + i * 24, y + amp * Math.sin((i / 28) * Math.PI * 2))), steps: 3, delay: 12 });
const chip = (name) => L.js(`[...document.querySelectorAll('.bp-chip')].find((c) => c.textContent.startsWith(${JSON.stringify(name)})).click()`);
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'brush-presets',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(900), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1087, 560], every: 80 },
      L.wait(700),
      chip('Ink'), L.wait(700), wave(190), L.wait(500),
      chip('Marker'), L.wait(700), wave(330), L.wait(500),
      chip('Tapered'), L.wait(700), wave(470), L.wait(600),
      L.js("__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 22, thinning: 0 } }))"), L.wait(900),
      L.js("[...document.querySelectorAll('.bp-actions button')].find((b) => b.textContent === 'Save as...').click()"), L.wait(900),
      { type: 'Fat pen' }, L.wait(900),
      L.js("[...document.querySelectorAll('.bp-name-go button')].find((b) => b.textContent === 'Save').click()"), L.wait(1100),
      wave(600, 30), L.wait(1500),
      { rec: 'stop' },
    ],
  },
];
