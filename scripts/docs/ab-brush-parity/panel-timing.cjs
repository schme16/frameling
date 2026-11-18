// How long the brush options take to come up, and how long each list takes to open (cold: the first time; warm: the second),
// on the vector Brush, the Pixel brush and Chalk and charcoal, and how long a stroke takes with the Pixel brush: the same
// steps on two renderers (`--renderer <dir>`), so before and after can be laid side by side. Prints one JSON line a case.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only pt1,pt2,pt3 --theme light [--renderer <dir>] --out <dir>
// Nothing else should be running while it measures. The window is hidden, so frames come about once a second and say nothing
// about the work: this waits on message ports until the rows have stopped coming, and times the script work.
const { L, start } = require('../ab-pixel-brush/_draw.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const F = '__frameling';
const tick = `const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });`;
// Time from picking the tool to the options being on screen and the count of controls steady.
const openPanel = (tool, name) => `(async () => {
  ${tick}
  ${F}.store().setUi({ tool: 'select' });
  await new Promise((r) => setTimeout(r, 300));
  const t0 = performance.now();
  ${F}.store().setUi({ tool: ${JSON.stringify(tool)} });
  let last = -1, same = 0;
  while (same < 4 && performance.now() - t0 < 4000) { await tick(); const n = document.querySelectorAll('.cv-options *').length; same = n > 20 && n === last ? same + 1 : 0; last = n; }
  return [${JSON.stringify(name)}, Math.round((performance.now() - t0) * 10) / 10, last];
})()`;
const open = (sel, name) => `(async () => {
  ${tick}
  const b = document.querySelector(${JSON.stringify(sel)});
  if (!b) return [${JSON.stringify(name)}, null];
  const t0 = performance.now();
  b.click();
  let last = -1, same = 0;
  while (same < 4 && performance.now() - t0 < 4000) { await tick(); const n = document.querySelectorAll('.pk-pop canvas').length; same = n > 0 && n === last ? same + 1 : 0; last = n; }
  const ms = performance.now() - t0, n = document.querySelectorAll('.pk-pop canvas').length;
  b.click();
  await new Promise((r) => setTimeout(r, 400));
  return [${JSON.stringify(name)}, Math.round(ms * 10) / 10, n];
})()`;
const stroke = `(async () => {
  ${tick}
  const root = document.querySelector('.cv-root');
  const send = (type, x, y, p) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root.getBoundingClientRect(); root.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: r.left + x * zoom + panX, clientY: r.top + y * zoom + panY, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); };
  let ms = 0;
  for (let k = 0; k < 3; k++) { const cy = 60 + 40 * k; const t0 = performance.now(); send('pointerdown', 10, cy, 0.5); for (let i = 1; i <= 160; i++) { const t = i / 160; send('pointermove', 10 + t * 140, cy + 8 * Math.sin(t * Math.PI * 2), 0.2 + 0.8 * Math.sin(Math.PI * t)); } send('pointerup', 150, cy, 0); ms = performance.now() - t0; await tick(); }
  return ['pixel stroke, 160 moves', Math.round(ms * 10) / 10];
})()`;
const lists = [['[data-testid="brush-presets"] .pk-btn', 'brush'], ['[data-testid="brush-tips"] .pk-btn', 'tip'], ['[data-testid="brush-stick"] .pk-btn', 'stick']];
const log = (js) => ({ log: js });
const entry = (n) => ({
  name: `pt${n}`,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  size: [1400, 1000],
  width: 400,
  steps: [
    L.js('window.IntersectionObserver = undefined'),
    // the vector Brush, on a chalk brush so Tip, Stick and Paper are all there
    L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.js(`${F}.run('brush.pick.starter:sketch-pencil')`), L.wait(2500),
    log(openPanel('brush', 'vector panel open')),
    ...lists.map(([s, nm]) => log(open(s, `vector ${nm} list cold`))), ...lists.map(([s, nm]) => log(open(s, `vector ${nm} list warm`))),
    // the Pixel brush
    L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...start(160), L.js('window.IntersectionObserver = undefined'), L.js(`${F}.run('brush.pick.starter:px-round6')`), L.wait(2500),
    log(openPanel('pixel-brush', 'pixel brush panel open')),
    ...lists.map(([s, nm]) => log(open(s, `pixel ${nm} list cold`))), ...lists.map(([s, nm]) => log(open(s, `pixel ${nm} list warm`))),
    L.js(HELPER), L.js(`__framelingSoft.edge('smooth')`), L.cmd('view.zoom100'), L.wait(300), L.js(`${F}.store().setUi({ tool: 'pixel-brush', color: '#1b1a20' })`), log(stroke),
    // Chalk and charcoal
    L.js(`${F}.run('brush.pick.starter:chalk')`), L.wait(2500),
    log(openPanel('charcoal', 'chalk and charcoal panel open')),
    ...lists.map(([s, nm]) => log(open(s, `charcoal ${nm} list cold`))),
    // Soft paint
    log(openPanel('soft-brush', 'soft paint panel open')),
    { shot: '@', crop: [0, 0, 8, 8] },
  ],
});
module.exports = [1, 2, 3].map(entry);
