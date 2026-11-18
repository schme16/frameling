// What the brush that follows the layer costs: opening the brush list (cold: the first time, warm: the second) on a vector layer and on a
// pixel layer, hopping from one kind of layer to the other with a brush picked, and a stroke on each kind of layer. The same steps on two
// renderers (`--renderer <dir>`), so before and after can be laid side by side. Prints one JSON line a case. Uses only brushes that
// exist both before and after (starter:ink, starter:px-round6), and the two layer kinds in one document.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only ft1,ft2,ft3 --theme light [--renderer <dir>] --out <dir>
// Nothing else should be running while it measures. The window is hidden, so frames come about once a second and say nothing
// about the work: this waits on message ports until the rows have stopped coming, and times the script work.
const { L } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';
const tick = `const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });`;
const go = (kind) => `(() => { const s = ${F}.store().get(); const l = [...s.doc.layers].reverse().find((x) => x.kind === '${kind}'); ${F}.store().setUi({ activeLayerId: l.id }); })()`;
const settle = `let last = -1, same = 0; while (same < 4 && performance.now() - t0 < 4000) { await tick(); const n = document.querySelectorAll('.cv-options *').length; same = n > 20 && n === last ? same + 1 : 0; last = n; }`;
// Time from the layer change to the options being on screen and steady.
const hop = (kind, name) => `(async () => { ${tick}
  const t0 = performance.now();
  ${go(kind)};
  ${settle}
  return [${JSON.stringify(name)}, Math.round((performance.now() - t0) * 10) / 10, last];
})()`;
const open = (name) => `(async () => { ${tick}
  const b = document.querySelector('[data-testid="brush-presets"] .pk-btn');
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
const stroke = (name) => `(async () => { ${tick}
  const root = document.querySelector('.cv-root');
  const send = (type, x, y, p) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root.getBoundingClientRect(); root.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: r.left + x * zoom + panX, clientY: r.top + y * zoom + panY, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); };
  let ms = 0;
  for (let k = 0; k < 3; k++) { const cy = 60 + 40 * k; const t0 = performance.now(); send('pointerdown', 10, cy, 0.5); for (let i = 1; i <= 160; i++) { const t = i / 160; send('pointermove', 10 + t * 140, cy + 8 * Math.sin(t * Math.PI * 2), 0.2 + 0.8 * Math.sin(Math.PI * t)); } send('pointerup', 150, cy, 0); ms = performance.now() - t0; await tick(); }
  return [${JSON.stringify(name)}, Math.round(ms * 10) / 10];
})()`;
// Hops with a brush picked, alternating, each timed on its own; the first pair is the cold one.
const hops = (pick, from) => [0, 1, 2, 3, 4, 5].map((i) => { const to = (i % 2 === 0) === (from === 'vector') ? 'pixel' : 'vector'; return { log: hop(to, `hop to ${to} ${i < 2 ? 'first' : 'later'} (${pick})`) }; });
const log = (js) => ({ log: js });
const entry = (n) => ({
  name: `ft${n}`,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  size: [1400, 1000],
  width: 400,
  steps: [
    L.js('window.IntersectionObserver = undefined'),
    L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`), L.cmd('layers.addPixel'), L.wait(600),
    L.js("document.querySelectorAll('.ui-toast-x').forEach((b) => b.click())"),
    L.js(`${go('vector')}`), L.js(`${F}.store().setUi({ tool: 'brush', color: '#1b1a20' })`), L.wait(800), L.cmd('view.zoom100'), L.wait(300),
    L.js(`${F}.run('brush.pick.starter:ink')`), L.wait(1500),
    log(open('vector list cold')), log(open('vector list warm')),
    log(stroke('vector stroke, 160 moves')),
    // Hop with the vector brush picked (before: nothing follows; after: its pixel half goes in).
    ...hops('ink picked', 'vector'),
    L.js(`${go('pixel')}`), L.wait(800), L.cmd('view.zoom100'), L.wait(300),
    L.js(`${F}.run('brush.pick.starter:px-round6')`), L.wait(1500),
    log(open('pixel list cold')), log(open('pixel list warm')),
    log(stroke('pixel stroke, 160 moves')),
    ...hops('round 6 picked', 'pixel'),
    { shot: '@', crop: [0, 0, 8, 8] },
  ],
});
module.exports = [1, 2, 3].map(entry);
