// Pixel checks for blend modes, effects, clipping, masks and folders, in a real Chromium canvas (vitest has no
// canvas). Each case renders a tiny document through the single renderer (the same one every export uses) and
// compares pixels with values worked out by hand.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/effects.cjs            (FILTER=fallback runs it on the JS blur used in Safari)
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const W = 16;
const H = 16;

const rect = (id, x, y, w, h, fill, opacity = 1) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity });

let n = 0;
function layer(name, shapes, extra = {}, length = 20) {
  const id = `l${n++}`;
  return { layer: { id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: `c${id}`, start: 0, length, drawingId: `d${id}` }], ...extra }, drawing: { id: `d${id}`, kind: 'vector', shapes } };
}

function doc(parts, extra = {}) {
  const drawings = {};
  for (const p of parts) drawings[p.drawing.id] = p.drawing;
  return { format: 'frameling', version: 1, lineage: true, id: 'd', name: 't', width: W, height: H, fps: 12, length: 20, background: '#ffffff', layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [], ...extra };
}

const px = (data, x, y) => data.slice((y * W + x) * 4, (y * W + x) * 4 + 4);
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const cases = [];
const add = (name, d, checks, frame = 0, editor = false) => cases.push({ name, d, checks, frame, editor });

const full = (c) => [rect('r' + n, 0, 0, W, H, c)];

add('multiply', doc([layer('a', full('#c86432')), layer('b', full('#64c8fa'), { blend: 'multiply' })]), [[4, 4, [78, 78, 49, 255], 2]]);
add('screen', doc([layer('a', full('#c86432')), layer('b', full('#64c8fa'), { blend: 'screen' })]), [[4, 4, [222, 222, 251, 255], 2]]);
add('add', doc([layer('a', full('#643200')), layer('b', full('#646464'), { blend: 'add' })]), [[4, 4, [200, 150, 100, 255], 1]]);
add('difference against the stage colour', doc([layer('a', full('#ffffff'), { blend: 'difference' })]), [[4, 4, [0, 0, 0, 255], 1]]);
add('clip to the layer below', doc([layer('base', [rect('b', 0, 0, 8, H, '#ff0000')]), layer('clip', full('#00ff00'), { clipToBelow: true })]), [
  [2, 4, [0, 255, 0, 255], 1],
  [12, 4, [255, 255, 255, 255], 1],
]);
add('clipped layers hide with their base', doc([layer('base', [rect('b', 0, 0, 8, H, '#ff0000')], { visible: false }), layer('clip', full('#00ff00'), { clipToBelow: true })]), [[2, 4, [255, 255, 255, 255], 1]]);
{
  const a = layer('a', full('#ff0000'), { folder: 'f' });
  const m = layer('m', [rect('m', 0, 0, 8, H, '#000000')], { folder: 'f', mask: 'show' });
  const top = layer('top', [rect('t', 0, 12, W, 4, '#0000ff')]);
  add('mask shows inside, only in its folder', doc([a, m, top], { folders: { f: { id: 'f', name: 'F', visible: true, opacity: 1 } } }), [
    [2, 4, [255, 0, 0, 255], 1],
    [12, 4, [255, 255, 255, 255], 1],
    [12, 14, [0, 0, 255, 255], 1],
  ]);
}
{
  const a = layer('a', full('#ff0000'), { folder: 'f' });
  const m = layer('m', [rect('m', 0, 0, 8, H, '#000000')], { folder: 'f', mask: 'hide' });
  add('mask hides inside', doc([a, m], { folders: { f: { id: 'f', name: 'F', visible: true, opacity: 1 } } }), [
    [2, 4, [255, 255, 255, 255], 1],
    [12, 4, [255, 0, 0, 255], 1],
  ]);
}
{
  const a = layer('a', [rect('a', 0, 0, 10, H, '#000000')], { folder: 'f' });
  const b = layer('b', [rect('b', 6, 0, 10, H, '#000000')], { folder: 'f' });
  add('a faded folder fades as one picture', doc([a, b], { folders: { f: { id: 'f', name: 'F', visible: true, opacity: 0.5 } } }), [
    [8, 4, [128, 128, 128, 255], 2],
    [2, 4, [128, 128, 128, 255], 2],
  ]);
}
add('hidden folder', doc([layer('a', full('#ff0000'), { folder: 'f' })], { folders: { f: { id: 'f', name: 'F', visible: false, opacity: 1 } } }), [[4, 4, [255, 255, 255, 255], 1]]);
const box = () => [rect('x', 6, 6, 4, 4, '#000000')];
add('outline', doc([layer('a', box(), { effects: [{ id: 'o', kind: 'outline', values: { color: '#ff0000', width: 2 } }] })]), [
  [7, 7, [0, 0, 0, 255], 1],
  [5, 7, [255, 0, 0, 255], 2],
  [1, 1, [255, 255, 255, 255], 1],
]);
add('blur softens edges', doc([layer('a', box(), { effects: [{ id: 'b', kind: 'blur', values: { radius: 2 } }] })]), [
  [8, 8, [145, 145, 145, 255], 30],
  [4, 8, [215, 215, 215, 255], 40],
]);
add('shadow sits down and right', doc([layer('a', box(), { effects: [{ id: 's', kind: 'shadow', values: { color: '#ff0000', opacity: 1, x: 4, y: 4, softness: 0 } }] })]), [
  [12, 12, [255, 0, 0, 255], 2],
  [7, 7, [0, 0, 0, 255], 1],
]);
add('glow around the drawing', doc([layer('a', box(), { effects: [{ id: 'g', kind: 'glow', values: { color: '#0000ff', size: 4, strength: 2 } }] })]), [
  [7, 7, [0, 0, 0, 255], 1],
  [5, 8, [0, 0, 255, 255], 170],
]);
add('colour adjust: no brightness is black', doc([layer('a', full('#ff8800'), { effects: [{ id: 'c', kind: 'adjust', values: { hue: 0, saturation: 100, brightness: 0, contrast: 100 } }] })]), [[4, 4, [0, 0, 0, 255], 1]]);
add('pixelate averages squares', doc([layer('a', [rect('a', 0, 0, 2, 4, '#000000'), rect('b', 2, 0, 2, 4, '#ffffff')], { effects: [{ id: 'p', kind: 'pixelate', values: { size: 4 } }] })]), [[1, 1, [128, 128, 128, 255], 30]]);
{
  // A symbol instance on a layer with an outline and a blend mode: the instance's posed drawing goes through the
  // compositor in the editor and in exports alike.
  const inner = layer('inner', [rect('i', 6, 6, 4, 4, '#000000')]);
  const inst = { id: 'inst', type: 'instance', symbolId: 'sym', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 };
  const stage = layer('stage', [inst], { effects: [{ id: 'o', kind: 'outline', values: { color: '#ff0000', width: 2 } }] });
  const d = doc([layer('bg', full('#ffff00')), stage], { symbols: { sym: { id: 'sym', name: 'Box', layers: [inner.layer], length: 20, origin: { x: 0, y: 0 } } } });
  d.drawings[inner.drawing.id] = inner.drawing;
  d.layers[1].blend = 'multiply';
  add('symbol instance with an outline and multiply', d, [
    [7, 7, [0, 0, 0, 255], 2],
    [5, 7, [255, 0, 0, 255], 2],
    [1, 1, [255, 255, 0, 255], 1],
    [3, 12, [255, 255, 0, 255], 1],
    [12, 12, [255, 255, 0, 255], 1],
  ], 0, true);
}
// Looks inside a symbol: blend modes, effects, masks and clipping on the symbol's own layers show where it's placed.
function symbolDoc(innerParts, inst = {}, stageExtra = {}, folders) {
  const i = { id: 'inst', type: 'instance', symbolId: 'sym', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0, ...inst };
  const d = doc([layer('bg', full('#ffff00')), layer('stage', [i], stageExtra)], { symbols: { sym: { id: 'sym', name: 'Sym', layers: innerParts.map((p) => p.layer), length: 20, origin: { x: 0, y: 0 } } }, ...(folders ? { folders } : {}) });
  for (const p of innerParts) d.drawings[p.drawing.id] = p.drawing;
  return d;
}
add('inside a symbol: multiply', symbolDoc([layer('a', [rect('a', 0, 0, 8, H, '#ff0000')]), layer('b', [rect('b', 0, 0, W, H, '#0000ff')], { blend: 'multiply' })]), [
  [2, 4, [0, 0, 0, 255], 2],
  [12, 4, [0, 0, 255, 255], 2],
], 0, true);
add('inside a symbol: outline, moved and placed twice the size', symbolDoc([layer('a', [rect('a', 2, 2, 2, 2, '#000000')], { effects: [{ id: 'o', kind: 'outline', values: { color: '#ff0000', width: 1 } }] })], { transform: { x: 2, y: 2, scaleX: 2, scaleY: 2, rotation: 0, skew: 0 } }), [
  [7, 7, [0, 0, 0, 255], 2],
  [5, 7, [255, 0, 0, 255], 40],
  [1, 1, [255, 255, 0, 255], 1],
  [13, 13, [255, 255, 0, 255], 1],
]);
add('inside a symbol: a mask shows only the left half', symbolDoc([layer('a', full('#ff0000')), layer('m', [rect('m', 0, 0, 8, H, '#000000')], { mask: 'show' })]), [
  [2, 4, [255, 0, 0, 255], 1],
  [12, 4, [255, 255, 0, 255], 1],
], 0, true);
add('inside a symbol: clipped to the layer below', symbolDoc([layer('base', [rect('b', 0, 0, 8, H, '#ff0000')]), layer('clip', full('#00ff00'), { clipToBelow: true })]), [
  [2, 4, [0, 255, 0, 255], 1],
  [12, 4, [255, 255, 0, 255], 1],
]);
add('inside a symbol: shadow, on a faded copy', symbolDoc([layer('a', box(), { effects: [{ id: 's', kind: 'shadow', values: { color: '#ff0000', opacity: 1, x: 4, y: 4, softness: 0 } }] })], { opacity: 0.5 }), [
  [12, 12, [255, 128, 0, 255], 3],
  [7, 7, [128, 128, 0, 255], 3],
]);
add('inside a symbol: a faded folder with a hiding mask', symbolDoc([layer('a', full('#000000'), { folder: 'f' }), layer('m', [rect('m', 8, 0, 8, H, '#000000')], { folder: 'f', mask: 'hide' })], {}, {}, { f: { id: 'f', name: 'F', visible: true, opacity: 0.5 } }), [
  [2, 4, [128, 128, 0, 255], 3],
  [12, 4, [255, 255, 0, 255], 1],
]);
{
  // A symbol with an outline inside, placed inside another symbol that multiplies it over a red layer.
  const d = symbolDoc([layer('red', [rect('r', 0, 0, W, 8, '#ff0000')]), layer('copy', [{ id: 'in', type: 'instance', symbolId: 'inner', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 }], { blend: 'multiply' })]);
  const inner = layer('box', box(), { effects: [{ id: 'o', kind: 'outline', values: { color: '#00ff00', width: 2 } }] });
  d.symbols.inner = { id: 'inner', name: 'Inner', layers: [inner.layer], length: 20, origin: { x: 0, y: 0 } };
  d.drawings[inner.drawing.id] = inner.drawing;
  add('inside a symbol inside a symbol: outline, multiplied', d, [
    [7, 7, [0, 0, 0, 255], 2],
    [5, 6, [0, 0, 0, 255], 2],
    [5, 10, [0, 255, 0, 255], 2],
    [12, 2, [255, 0, 0, 255], 1],
  ]);
}
const anim = () => [{ id: 'a', kind: 'blur', values: { radius: 0 }, keys: [{ frame: 0, values: { radius: 0 } }, { frame: 10, values: { radius: 3 } }] }];
add('animated blur, frame 1: sharp', doc([layer('a', box(), { effects: anim() })]), [[5, 8, [255, 255, 255, 255], 1]], 0);
add('animated blur, frame 11: soft', doc([layer('a', box(), { effects: anim() })]), [[5, 8, [200, 200, 200, 255], 50]], 10);

// A rejection must end the run with a failure, not leave Electron hanging with the window hidden.
const bail = (e) => {
  console.error('FAIL harness error:', e && e.stack ? e.stack : e);
  app.exit(1);
};
process.on('unhandledRejection', bail);
process.on('uncaughtException', bail);
setTimeout(() => bail(new Error('effects harness timed out after 180s')), 180000).unref();

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  // The ?debug hooks are a separate download that arrives after the load event, so wait for them.
  await win.webContents.executeJavaScript(`new Promise((ok, no) => { const t0 = Date.now(); const t = () => (window.__framelingEffects ? ok() : Date.now() - t0 > 20000 ? no(new Error('debug hooks never appeared')) : setTimeout(t, 50)); t(); })`);
  // FILTER=fallback runs every case on the JS blur used where the canvas has no filter (Safari); FILTER=native forces the canvas filter.
  if (process.env.FILTER) await win.webContents.executeJavaScript(`window.__framelingEffects.setFilterOverride(${JSON.stringify(process.env.FILTER)})`);
  console.log(`canvas filter: ${await win.webContents.executeJavaScript('window.__framelingEffects.nativeFilterWorks() ? "native" : "JS fallback"')}`);
  let failed = 0;
  for (const c of cases) {
    const data = await win.webContents.executeJavaScript(`window.__framelingEffects.pixels(${JSON.stringify(c.d)}, ${c.frame})`);
    const bad = [];
    for (const [x, y, want, tol] of c.checks) {
      const got = px(data, x, y);
      if (!near(got, want, tol)) bad.push(`(${x},${y}) got ${got.join(',')} want ${want.join(',')} ±${tol}`);
    }
    if (c.editor) {
      // The same pixels on the editor canvas (scaled to fit the window, so only well inside each area is compared).
      const got = await win.webContents.executeJavaScript(`window.__framelingEffects.editorPixels(${JSON.stringify(c.d)}, ${c.frame}, ${JSON.stringify(c.checks.map(([x, y]) => [x, y]))})`);
      c.checks.forEach(([x, y, want, tol], i) => {
        if (!near(got[i], want, tol + 40)) bad.push(`editor (${x},${y}) got ${got[i].join(',')} want ${want.join(',')}`);
      });
    }
    if (bad.length) failed++;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} ${c.name}${bad.length ? '\n     ' + bad.join('\n     ') : ''}`);
  }
  console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
  app.exit(failed ? 1 : 0);
}).catch(bail);
