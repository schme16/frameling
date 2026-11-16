// The Matte finish slider (brand/ab/matte). Two entries, each run once per theme:
//   strokes: the Bristle brush drawing the same wave at Matte finish Off, 50% and 100%, as real strokes on the page
//   panel:   the brush options cropped to the Matte finish row, so the control can be seen where it sits
// Run it on whichever build is checked out:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-matte --out <dir>
const L = require('../help/_lib.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const { DARK, PAPER } = require('../ab-charcoal/_draw.cjs');
const F = '__frameling';

const PAINT = ['#c4472f', '#f0735a'];
const wave = (y) => Array.from({ length: 49 }, (_, i) => { const t = i / 48; return [Math.round(24 + t * 352), Math.round(y + Math.sin(t * Math.PI * 2) * 9), +(0.25 + 0.6 * Math.sin(t * Math.PI)).toFixed(3)]; });
const draw = (path) => L.js(`__sp.stroke(${JSON.stringify(path)}, { pen: true, delay: 10 })`);

// Drag the real slider by its label, through React's own value setter so the component sees the change.
const setSlider = (label, v) => L.js(`(() => {
  const head = [...document.querySelectorAll('.cv-field-label')].find((s) => s.textContent === ${JSON.stringify(label)});
  if (!head) throw new Error('no slider called ${label}');
  const el = head.closest('.cv-field').querySelector('input.cv-slider');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, String(${v}));
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`);

const setup = (height) => [
  L.template('blank-vector'),
  L.wait(700),
  L.js(`(() => { const dark = ${DARK}; ${F}.store().update('paper', (d) => { d.width = 400; d.height = ${height}; d.background = dark ? ${JSON.stringify(PAPER.dark)} : ${JSON.stringify(PAPER.light)}; }); })()`),
  L.js(`${F}.run('view.fit')`),
  L.js(HELPER),
  L.js(`${F}.declinePenCheck()`),
  L.cmd('tools.brush'),
  L.wait(300),
  L.js(`${F}.run('brush.tip.bristle')`),
  L.wait(400),
  L.js(`(() => { const dark = ${DARK}; ${F}.store().setUi({ tool: 'brush', color: dark ? ${JSON.stringify(PAINT[1])} : ${JSON.stringify(PAINT[0])} }); })()`),
  L.wait(200),
];

module.exports = [
  {
    name: 'strokes',
    prefs: { firstDrawn: true, showTips: false },
    width: 800,
    steps: [
      ...setup(200),
      ...[0, 50, 100].flatMap((v, i) => [setSlider('Matte finish', v), L.wait(250), draw(wave(36 + i * 64))]),
      { move: [640, 780] },
      L.wait(500),
      { shot: '@', el: '.cv-root', pad: 0 },
    ],
  },
  {
    name: 'panel',
    prefs: { firstDrawn: true, showTips: false },
    width: 1000,
    steps: [
      ...setup(200),
      setSlider('Matte finish', 60),
      L.wait(400),
      // Mark whatever panel the Matte finish row sits in, so the crop follows the control rather than a fixed id.
      L.js(`(() => {
        const head = [...document.querySelectorAll('.cv-field-label')].find((s) => s.textContent === 'Matte finish');
        const panel = head.closest('.ui-panel') || head.closest('[role="tabpanel"]') || head.closest('.cv-opts') || head.parentElement.parentElement;
        panel.classList.add('shotme');
        head.closest('.cv-field').scrollIntoView({ block: 'center' });
      })()`),
      L.wait(200),
      { shot: '@', el: '.shotme', pad: 6 },
    ],
  },
];
