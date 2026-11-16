// The chalk options before and after the stick became a picker (brand/ab/stick-picker): the Tool options panel in both
// themes with Soft pastel as the stick, the list dropped open, Catch on paper off, and a window of its own. Both builds
// run the same steps:
//   S=...; npx vite build --outDir $S/after   (and the same from a checkout of development for $S/before)
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-stick-picker --renderer $S/after --out <raw>
const L = require('../help/_lib.cjs');

const js = (code) => L.js(code);
const pickChalk = [
  js("document.querySelector('[data-testid=\"brush-presets\"] .pk-btn').click()"), L.wait(700),
  js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === 'Chalk and charcoal'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); })()`), L.wait(400),
  js(`[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith('Chalk')).click()`), L.wait(700),
];
// Soft pastel as the stick, so the three pickers say three different things.
const stick = (dry) => js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 22, tip: { ...u.brush.tip, ...${JSON.stringify(dry ? { dry } : {})}, ${dry ? '' : 'dry: undefined'} } } }))`);
const toTop = js("document.querySelector('[data-panel-id=\"tool-options\"]')?.scrollIntoView({ block: 'start' })");
const away = { move: [300, 20] };
const PANEL = { shot: '@', crop: [1004, 46, 304, 916] };

const entry = (name, steps, shot, o = {}) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: o.size ?? [1400, 1000],
  width: (o.size ?? [1400, 1000])[0],
  steps: [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(900), ...steps, L.wait(1000), away, L.wait(300), { shot: 'warm', crop: [0, 0, 32, 32] }, shot],
});

module.exports = [
  entry('panel', [...pickChalk, stick('soft-pastel'), toTop], PANEL),
  entry('panel-off', [...pickChalk, stick(null), toTop], PANEL),
  entry('panel-narrow', [...pickChalk, stick('soft-pastel'), js("__frameling.dock.floatPlacement('tool-options', { x: 40, y: 60, w: 230, h: 700 })"), L.wait(900)], { shot: '@', el: '.ui-float', pad: 6 }),
  entry(
    'panel-open',
    [...pickChalk, stick('soft-pastel'), toTop, L.wait(300), js("document.querySelector('[data-testid=\"brush-stick\"] .pk-btn').click()"), L.wait(1200)],
    { shot: '@', crop: [640, 46, 668, 916] },
  ),
];
