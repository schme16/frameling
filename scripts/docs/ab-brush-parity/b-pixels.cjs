// The plain Brush (B) on a pixel layer, before and after it took the Pixel brush's panel (card pixel-brush-parity, piece 5).
//   bp-panel   the Tool options with every fold open (a tall shot of the panel)
//   bp-strokes five strokes at 800% (size 1 with Pixel perfect on and off, a square 3, a round 6, a picture): the pixels must be the same
//   bp-time    one number: how long 160 pointer moves take, for each of three brushes
// Run on the old and the new build (each from its own checkout), then compare:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only bp-panel,bp-strokes --out <dir>
const { L, start, draw, wave, line } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';
// Sets the plain Brush the way this build wants it: the old build reads the tool settings, the new one the shared pixel brush.
const brush = ({ size, shape = 'square', perfect = true }) =>
  L.js(`(() => { ${F}.toolSettings.set({ pixelBrushSize: ${size}, pixelBrushShape: ${JSON.stringify(shape)}, pixelPerfect: ${perfect}, pixelStamp: null }); __framelingDab.reset(); __framelingDab.set({ size: ${size}, tip: ${JSON.stringify(shape)} }); })()`);
const openAll = L.js(`(async () => { for (let i = 0; i < 5; i++) { document.querySelectorAll('#ui-panel-tool-options [data-fold][aria-expanded="false"]').forEach((b) => b.click()); document.querySelectorAll('#ui-panel-tool-options details').forEach((d) => (d.open = true)); await new Promise((r) => setTimeout(r, 200)); } })()`);
const onB = L.js(`${F}.store().setUi({ tool: 'brush' })`);
const sprite = (size) => [...start(size), onB, L.wait(300)];

const stairs = (x, y) => [[x, y, 0.5], [x + 1, y, 0.5], [x + 1, y + 1, 0.5], [x + 2, y + 1, 0.5], [x + 2, y + 2, 0.5], [x + 4, y + 2, 0.5], [x + 5, y + 4, 0.5], [x + 8, y + 4, 0.5], [x + 8, y + 7, 0.5], [x + 3, y + 9, 0.5], [x + 3, y + 5, 0.5]];

const TWO = { w: 3, h: 3, colours: ['#d6204a', '#2a6fdb'], cells: [1, 2, 1, 2, 1, 2, 1, 2, 1], keep: true };

// 160 pointer moves along a wave, sent as fast as the page takes them, so the time is the stroke's own work. Eleven runs, the first
// (which warms things up) dropped; prints the median and the spread in ms.
const timing = (label, set) => `(async () => {
  ${set}
  const root = document.querySelector('.cv-root');
  const send = (type, x, y, p) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root.getBoundingClientRect(); root.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: r.left + 20 + x, clientY: r.top + 20 + y, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); };
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const runs = [];
  for (let k = 0; k < 11; k++) {
    const cy = 40 + 20 * (k % 9);
    const t0 = performance.now();
    send('pointerdown', 10, cy, 0.5);
    for (let i = 1; i <= 160; i++) { const t = i / 160; send('pointermove', 10 + t * 300, cy + 12 * Math.sin(t * Math.PI * 4), 0.5); }
    send('pointerup', 310, cy, 0);
    runs.push(performance.now() - t0);
    await frame();
  }
  runs.shift();
  runs.sort((a, b) => a - b);
  return ${JSON.stringify(label)} + ' median ' + runs[Math.floor(runs.length / 2)].toFixed(1) + ' min ' + runs[0].toFixed(1) + ' max ' + runs[runs.length - 1].toFixed(1);
})()`;
const SET = (size, shape, perfect) => `${F}.toolSettings.set({ pixelBrushSize: ${size}, pixelBrushShape: '${shape}', pixelPerfect: ${perfect}, pixelStamp: null }); __framelingDab.reset(); __framelingDab.set({ size: ${size}, tip: '${shape}' });`;

module.exports = [
  {
    name: 'bp-time',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    size: [1400, 1000],
    width: 1400,
    steps: [
      ...sprite(160), L.wait(300),
      { log: timing('size1-perfect', SET(1, 'square', true)) },
      { log: timing('size1-nopefect', SET(1, 'square', false)) },
      { log: timing('size4-round', SET(4, 'round', false)) },
      { log: timing('size12-square', SET(12, 'square', false)) },
      { shot: '@', crop: [0, 0, 10, 10] },
    ],
  },
  {
    name: 'bp-panel',
    prefs: { firstDrawn: true, showTips: false, showQuill: false, rightSide: 'tabs' },
    size: [1400, 5200],
    width: 1400,
    steps: [L.js(`${F}.dock.applyWorkspace('pixel')`), L.wait(600), ...sprite(160), brush({ size: 4, shape: 'round' }), L.js(`${F}.showPanel('tool-options')`), L.wait(600), openAll, L.wait(600), { shot: '@', el: '#ui-panel-tool-options', pad: 0 }],
  },
  {
    name: 'bp-strokes',
    prefs: { firstDrawn: true, showTips: false, showQuill: false },
    size: [1400, 1000],
    width: 1400,
    steps: [
      ...sprite(40),
      L.js(`${F}.run('pixel.zoom4')`), L.wait(400),
      brush({ size: 1, perfect: true }), draw(stairs(2, 2)),
      brush({ size: 1, perfect: false }), draw(stairs(14, 2)),
      brush({ size: 3 }), draw(stairs(2, 16)),
      brush({ size: 6, shape: 'round' }), draw(stairs(16, 16)),
      L.js(`(() => { ${F}.toolSettings.set({ pixelStamp: ${JSON.stringify(TWO)} }); __framelingDab.whole({ ...__framelingDab.settings(), tip: 'picture', picture: ${JSON.stringify(TWO)}, size: 3, spacing: 1 }); })()`),
      draw(line(4, 33, 28, 36, 14)),
      L.wait(300), { move: [640, 900] },
      { shot: '@', el: '.cv-root', pad: 0 },
    ],
  },
];
