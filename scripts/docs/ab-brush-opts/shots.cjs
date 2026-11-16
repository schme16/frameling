// The brush Tool options before and after (brand/ab/brush-opts): Oil paint and Chalk in both themes, a narrow window
// of its own, and a first stroke with Catch on paper on and off. Both builds run the same steps:
//   S=...; npx vite build --outDir $S/after   (and the same from a checkout of development for $S/before)
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-opts --renderer $S/after --out <raw>
const L = require('../help/_lib.cjs');
const { view, at } = require('../help/_shapes.cjs');

const js = (code) => L.js(code);
const pickBrush = (name, group) => [
  js("document.querySelector('[data-testid=\"brush-presets\"] .pk-btn').click()"), L.wait(700),
  js(`(() => { const h = [...document.querySelectorAll('.pk-group')].find((x) => x.querySelector('.pk-group-name').textContent === ${JSON.stringify(group)}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); })()`), L.wait(700),
  js(`[...document.querySelectorAll('.pk-pop .pk-row')].find((r) => r.querySelector('.pk-name-text').textContent.startsWith(${JSON.stringify(name)})).click()`), L.wait(700),
];
// Chalk picked from the Tip picker the way a person does it, then Catch on paper as asked.
const chalk = (on) => js(`__frameling.store().setUi((u) => ({ brush: { ...u.brush, size: 22, tip: ${on ? "{ kind: 'chalk', amount: 0.6, grain: 1, dry: 'chalk' }" : "{ kind: 'chalk', amount: 0.6, grain: 1 }"} } }))`);
const toTop = js("document.querySelector('[data-panel-id=\"tool-options\"]')?.scrollIntoView({ block: 'start' })");
const away = { move: [300, 20] };
const wave = (y) => ({ drag: Array.from({ length: 25 }, (_, i) => at(180 + i * 20, y + 50 * Math.sin((i / 24) * Math.PI * 2))), steps: 3, delay: 12 });
// The right dock at 1400 wide, scrolled so Tool options starts at its top.
const PANEL = { shot: '@', crop: [1004, 46, 304, 916] };

const entry = (name, steps, shot, o = {}) => ({
  name,
  prefs: { firstDrawn: true, showTips: false },
  size: o.size ?? [1400, 1000],
  width: (o.size ?? [1400, 1000])[0],
  steps: [L.template('blank-vector'), L.cmd('tools.brush'), L.wait(900), ...steps, L.wait(1000), away, L.wait(300), { shot: 'warm', crop: [0, 0, 32, 32] }, shot],
});

module.exports = [
  entry('panel-oil', [...pickBrush('Oil paint', 'Paint'), toTop], PANEL),
  entry('panel-chalk', [...pickBrush('Chalk', 'Chalk and charcoal'), toTop], PANEL),
  entry('panel-narrow', [
    ...pickBrush('Chalk', 'Chalk and charcoal'),
    js("__frameling.dock.floatPlacement('tool-options', { x: 40, y: 60, w: 230, h: 620 })"), L.wait(900),
  ], { shot: '@', el: '.ui-float', pad: 6 }),
  entry('stroke-off', [chalk(false), view(0.5), wave(300)], { shot: '@', crop: { stageCrop: {} } }),
  entry('stroke-on', [chalk(true), view(0.5), wave(300)], { shot: '@', crop: { stageCrop: {} } }),
];
