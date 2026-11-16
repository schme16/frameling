// Help clip for Saved brushes: three starter brushes (each from its group) from the brush picker one after another and a wave drawn with each (ink thin,
// marker fat, tapered pointy), then the size changed, the brush saved under a name, and a wave drawn with that.
// Where things land comes from the running app (view() and at() in _shapes.cjs), so no window numbers are kept here.
const L = require('./_lib.cjs');
const { view, at } = require('./_shapes.cjs');
const wave = (y, amp = 50) => ({ drag: Array.from({ length: 29 }, (_, i) => at(300 + i * 24, y + amp * Math.sin((i / 28) * Math.PI * 2))), steps: 3, delay: 12 });
// Open the brush picker, open the group the brush is in, wait a beat so it can be seen, then pick the row.
const pick = (name, group) => [
  L.js("document.querySelector('.pk-btn').click()"), L.wait(700),
  L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(group)}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); })()`), L.wait(700),
  L.js(`[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith(${JSON.stringify(name)})).click()`),
];
const fit = view(0.5);
const away = { move: [720, 28] };

module.exports = [
  {
    name: 'brush-presets',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), L.cmd('tools.brush'), L.wait(900), fit, away, L.wait(300),
      { shot: 'warm', crop: [0, 0, 32, 32] },
      { rec: '@', crop: { stageCrop: { rightGap: 80, down: 109 } }, every: 80 },
      L.wait(700),
      ...pick('Ink', 'Pens'), L.wait(700), wave(190), L.wait(500),
      ...pick('Marker', 'Markers'), L.wait(700), wave(330), L.wait(500),
      ...pick('Tapered', 'Paint'), L.wait(700), wave(470), L.wait(600),
      L.js("__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 22, thinning: 0 } }))"), L.wait(900),
      L.js("[...document.querySelectorAll('.bp-actions button')].find((b) => b.textContent === 'Save as...').click()"), L.wait(900),
      { type: 'Fat pen' }, L.wait(900),
      L.js("[...document.querySelectorAll('.bp-name-go button')].find((b) => b.textContent === 'Save').click()"), L.wait(1100),
      wave(600, 30), L.wait(1500),
      { rec: 'stop' },
    ],
  },
];
