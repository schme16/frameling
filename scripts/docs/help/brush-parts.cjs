// Help clip for A brush, its tip, its stick and its paper: Sketch pencil picked, then its tip changed to Chalk (the preview
// names it and the Tip and Stick both say changed), then Back to how it came. The panel only, so it stays small.
const L = require('./_lib.cjs');

const pickBrush = (id) => L.js(`__frameling.run('brush.pick.starter:${id}')`);
const tip = (name) => [
  L.js(`document.querySelector('[data-testid="brush-tips"] .pk-btn').click()`),
  L.wait(700),
  L.js(`[...document.querySelectorAll('.pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`),
];
const stick = (name) => [
  L.js(`document.querySelector('[data-testid="brush-stick"] .pk-btn').click()`),
  L.wait(700),
  L.js(`[...document.querySelectorAll('.pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`),
];
// The options scrolled so the preview is at the top of the picture.
const toTop = L.js(`(() => { const o = document.querySelector('.cv-options'); let e = o; while (e && e.scrollHeight <= e.clientHeight + 2) e = e.parentElement; if (e) e.scrollTop = o.offsetTop - 60; })()`);
const back = L.js(`document.querySelector('[data-control="revert"]').click()`);

module.exports = [
  {
    name: 'brush-parts',
    prefs: { firstDrawn: true, showTips: false, showQuill: false, reduceMotion: false },
    size: [1400, 1000],
    width: 1000,
    steps: [
      L.template('blank-vector'), L.cmd('tools.brush'), L.wait(900), pickBrush('sketch-pencil'), L.wait(1500), toTop, L.wait(600),
      { move: [300, 20] },
      { rec: '@', crop: [1000, 40, 312, 590], every: 60 },
      L.wait(900),
      ...tip('Chalk'), L.wait(2900),
      ...stick('Crayon'), L.wait(2900),
      back, L.wait(2600),
      { rec: 'stop' },
    ],
  },
];
