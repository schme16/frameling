// The paw print brush (brand/ab/paw-brush): its row in the picker, and strokes drawn with it picked from the picker.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-paw-brush --out <dir>
// Names: picker, stroke. Both run in each theme. The stroke page is the one the brush tips look uses (a wave, a zigzag, a loop and a dab).
const L = require('../help/_lib.cjs');
const at = (x, y) => [Math.round(x - 145), Math.round(y - 91)];
const fit = L.js('__frameling.store().setUi({ zoom: 1, panX: 382 - 640, panY: 222 - 360 })');
const away = { move: [720, 28] };
const wave = { drag: Array.from({ length: 36 }, (_, i) => at(300 + i * 15, 230 + 46 * Math.sin((i / 35) * Math.PI * 2.2))), steps: 3, delay: 10 };
const zig = { drag: Array.from({ length: 13 }, (_, i) => at(330 + i * 22 + (i % 2 ? 6 : 0), i % 2 ? 330 : 440)), steps: 4, delay: 10 };
const loop = { drag: Array.from({ length: 36 }, (_, i) => { const a = (i / 35) * Math.PI * 2.6; return at(740 + Math.cos(a) * 70 + i * 3, 385 + Math.sin(a) * 52); }), steps: 3, delay: 10 };
const blue = '#2d3f6e';
const PAPER = L.js(`(() => { const S = __frameling.store(); const c = getComputedStyle(document.body).backgroundColor.match(/\\d+/g).map(Number); const dark = (c[0] + c[1] + c[2]) / 3 < 110; S.update('page', (d) => { d.background = dark ? '#262a33' : '#ffffff'; }); S.setUi({ color: dark ? '#f3ecd9' : '${blue}' }); })()`);
const click = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const header = (name) => L.js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(name)}); if (h.getAttribute('aria-expanded') !== 'true') h.click(); })()`);
const onlyOne = (name) => [click('[aria-label="Open every group"]'), L.wait(300), click('[aria-label="Fold every group"]'), L.wait(300), header(name), L.wait(800)];
const pawRow = L.js("[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith('Paw prints')).click()");

module.exports = [
  {
    name: 'picker',
    prefs: { firstDrawn: true, showTips: false },
    size: [1400, 900],
    width: 1400,
    steps: [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), L.js('__brushes.box({ w: 400, h: 860 })'), click('.pk-btn'), L.wait(400), ...onlyOne('Stamps and texture'), L.js("[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith('Paw prints')).scrollIntoView({ block: 'center' })"), L.wait(900), { move: [300, 20] }, L.wait(300), { shot: '@', crop: [870, 40, 470, 860] }],
  },
  {
    name: 'stroke',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      L.template('blank-vector'), fit, L.cmd('tools.brush'), L.wait(700), PAPER,
      click('.pk-btn'), L.wait(500), ...onlyOne('Stamps and texture'), pawRow, L.wait(500),
      away, L.wait(300),
      wave, L.wait(250), zig, L.wait(250), loop, L.wait(500), away, L.wait(500),
      { shot: '@', crop: [150, 52, 720, 435] },
    ],
  },
];
