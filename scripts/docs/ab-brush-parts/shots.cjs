// The shots for brand/ab/brush-parts: the panel as it comes, with the tip changed, with only the stick changed, each list open,
// the Paper picker open, and the flash (a still and a clip).
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parts --only <names> --renderer <dist/renderer> --out <dir>
const L = require('../help/_lib.cjs');
const PANEL = [1000, 40, 312, 940];
const OPEN = [900, 40, 412, 940];
const brush = (id) => L.js(`__frameling.run('brush.pick.starter:${id}')`);
const pick = (sel, name) => [
  L.js(`document.querySelector(${JSON.stringify(sel)}).click()`),
  L.wait(800),
  L.js(`[...document.querySelectorAll('.pk-row')].find((r) => r.querySelector('.pk-name-text').textContent === ${JSON.stringify(name)}).click()`),
];
const tip = (name) => pick('[data-testid="brush-tips"] .pk-btn', name);
const stick = (name) => pick('[data-testid="brush-stick"] .pk-btn', name);
const open = (sel) => [L.js(`document.querySelector(${JSON.stringify(sel)}).click()`), L.wait(1200)];
const top = L.js(`(() => { const o = document.querySelector('.cv-options'); let e = o; while (e && e.scrollHeight <= e.clientHeight + 2) e = e.parentElement; if (e) e.scrollTop = o.offsetTop - 60; })()`);
const rough = L.js(`__framelingDry.paper('rough')`);
const base = [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(700), rough, brush('sketch-pencil'), L.wait(500)];
const entry = (name, setup, post = [], o = {}) => ({
  name,
  prefs: { firstDrawn: true, showTips: false, showQuill: false, reduceMotion: false },
  size: [1400, 1000],
  width: 1400,
  steps: [...base, ...setup, L.wait(o.settle ?? 3000), top, L.wait(300), ...post, L.wait(o.wait ?? 700), { move: [300, 20] }, L.wait(250), { shot: '@', crop: o.crop || PANEL }],
});
module.exports = [
  entry('1-as-it-comes', []),
  entry('2-tip-changed', [...tip('Chalk')]),
  entry('3-stick-changed', [...stick('Crayon')]),
  // The flash itself, a moment after the change.
  entry('4-flash-still', [], [...tip('Chalk')], { wait: 450, crop: [1000, 40, 312, 560] }),
  entry('5-brush-list', [], open('[data-testid="brush-presets"] .pk-btn'), { crop: OPEN }),
  entry('6-tip-list', [], open('[data-testid="brush-tips"] .pk-btn'), { crop: OPEN }),
  entry('7-stick-list', [], open('[data-testid="brush-stick"] .pk-btn'), { crop: OPEN }),
  entry('8-paper-list', [], open('[data-control="paper-choice"] .pk-btn'), { crop: OPEN }),
  {
    name: '9-flash-clip',
    prefs: { firstDrawn: true, showTips: false, showQuill: false, reduceMotion: false },
    size: [1400, 1000],
    width: 1000,
    steps: [...base, L.wait(1500), top, L.wait(600), { move: [300, 20] },
      { rec: '@', crop: [1000, 40, 312, 590], every: 60 }, L.wait(900),
      ...tip('Chalk'), L.wait(2900), ...stick('Crayon'), L.wait(2900),
      L.js(`document.querySelector('[data-control="revert"]').click()`), L.wait(2600), { rec: 'stop' }],
  },
];
