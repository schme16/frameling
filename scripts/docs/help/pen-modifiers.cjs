// Help clip for Pen modifiers: the same wave drawn five times down the page. First plain, then with a shaky hand on, a thin
// brush, a fat brush and a steady hand, each put on with its "Try the pen modifier" command (so nothing real is touched and no
// door is needed), with the chip at the top right counting down. Last, Put my pen back, and one more plain wave.
// Window as in brush-presets.cjs (canvas 764 x 444 at 113, 47). Reduce motion is OFF here: the clip is about motion.
const L = require('./_lib.cjs');
const at = (x, y) => [Math.round(495 + (x - 640) * 0.5), Math.round(269 + (y - 360) * 0.5)];
const wave = (y, amp = 22) => ({ drag: Array.from({ length: 33 }, (_, i) => at(260 + i * 22, y + amp * Math.sin((i / 32) * Math.PI * 2.5))), steps: 4, delay: 12 });
const fit = L.js('__frameling.store().setUi({ zoom: 0.5, panX: 382 - 640 * 0.5, panY: 222 - 360 * 0.5 })');
const away = { move: [720, 28] };
const blue = '#2d3f6e';
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);
const BRUSH = L.js('__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 14, thinning: 0, smoothing: 0.5, streamline: 0.3, taperStart: 0, taperEnd: 0 } }))');
const next = (id, y) => [L.cmd(id), L.wait(1300), wave(y), L.wait(700)];

module.exports = [
  {
    name: 'pen-modifiers',
    prefs: { firstDrawn: true, showTips: false, reduceMotion: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700), PAPER, BRUSH, L.wait(500), away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: [113, 40, 1167, 560], every: 80 },
      L.wait(700),
      wave(150), L.wait(700),
      ...next('penmods.try.shaky', 245),
      ...next('penmods.try.thin', 340),
      ...next('penmods.try.fat', 435),
      ...next('penmods.try.steady', 520),
      L.cmd('penmods.stop'), L.wait(900),
      wave(600), L.wait(1300),
      { rec: 'stop' },
    ],
  },
];
