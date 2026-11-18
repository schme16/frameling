// How long a stroke takes with each new pixel preset (and the vector brush it pairs with, for scale): 160 pointer moves along
// a wave 440 pixels long, sent as fast as the page takes them, so the time is the brush's own work and not the pauses of a
// hand. Each is done twice and the second is kept (the first warms the tip and paper pictures). Prints one JSON line.
// Software drawing under xvfb: the numbers are for comparing brushes, not for a graphics card.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-parity --only timing-0,timing-1,timing-2,timing-3,timing-4,timing-5 --out <dir> --theme light
const { L } = require('../ab-pixel-brush/_draw.cjs');
const { HELPER } = require('../ab-soft-paint/_draw.cjs');
const F = '__frameling';
const IDS = ['mechanical', 'colour-pencil', 'sketch-pencil', 'gel', 'ballpoint', 'brush-pen', 'dip-pen', 'fine-marker', 'block-marker', 'brush-marker', 'tapered', 'round-brush', 'dry-brush', 'charcoal', 'oil-pastel', 'leaves', 'falling-leaves', 'paw-prints', 'dashed-line', 'broad', 'round-nib', 'pressure-pencil', 'pressure-spray', 'speckle', 'sprinkle', 'slash'];
const PIXEL_ID = { 'sketch-pencil': 'sketch-pencil-medium', 'dry-brush': 'dry-brush-crayon', broad: 'broad-nib' };
const run = (kind, ids) => `(async () => {
  const root = document.querySelector('.cv-root');
  const send = (type, x, y, p) => { const { zoom, panX, panY } = ${F}.store().get().ui; const r = root.getBoundingClientRect(); root.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: r.left + x * zoom + panX, clientY: r.top + y * zoom + panY, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); };
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = {};
  for (const v of ${JSON.stringify(ids)}) {
    const id = ${kind === 'pixel' ? `'starter:px-' + (${JSON.stringify(PIXEL_ID)}[v] ?? v)` : `'starter:' + v`};
    ${F}.run('brush.pick.' + id);
    await frame();
    let ms = 0;
    for (let k = 0; k < 2; k++) {
      const cy = 100 + 90 * k;
      const t0 = performance.now();
      send('pointerdown', 36, cy, 0.5);
      for (let i = 1; i <= 160; i++) { const t = i / 160; send('pointermove', 36 + t * 440, cy + 16 * Math.sin(t * Math.PI * 2), 0.2 + 0.8 * Math.sin(Math.PI * t)); }
      send('pointerup', 476, cy, 0);
      ms = performance.now() - t0;
      await frame();
    }
    out[v] = Math.round(ms * 10) / 10;
  }
  return '${kind} ' + JSON.stringify(out);
})()`;
// A few brushes an entry, so one run never takes long: timing-0, timing-1, ...
const entry = (n, ids) => ({
  name: `timing-${n}`,
  prefs: { firstDrawn: true, showTips: false, showQuill: false },
  size: [1400, 1000],
  width: 1400,
  steps: [
    L.template('blank-vector'), L.wait(700), L.js(`${F}.declinePenCheck()`),
    L.js(`${F}.store().update('size', (d) => { d.width = 512; d.height = 512; d.background = '#ffffff'; })`), L.js(HELPER), L.cmd('view.zoom100'), L.wait(400),
    L.js(`${F}.store().setUi({ color: '#1b1a20' })`), { log: run('vector', ids) },
    L.js(`__framelingPixel.newSprite('picture', 512)`), L.wait(900), L.js(HELPER), L.js(`__framelingSoft.edge('smooth')`), L.cmd('view.zoom100'), L.wait(400),
    L.js(`${F}.store().setUi({ color: '#1b1a20' })`), { log: run('pixel', ids) },
    { shot: '@', crop: [0, 0, 10, 10] },
  ],
});
module.exports = Array.from({ length: Math.ceil(IDS.length / 5) }, (_, n) => entry(n, IDS.slice(n * 5, n * 5 + 5)));
