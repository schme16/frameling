// Pixel checks for blend modes, effects, clipping, masks and folders, in a real Chromium canvas (vitest has no
// canvas). Each case renders a tiny document through the single renderer (the same one every export uses) and
// compares pixels with values worked out by hand.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/effects.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

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
  return { format: 'frameling', version: 1, id: 'd', name: 't', width: W, height: H, fps: 12, length: 20, background: '#ffffff', layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [], ...extra };
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
const anim = () => [{ id: 'a', kind: 'blur', values: { radius: 0 }, keys: [{ frame: 0, values: { radius: 0 } }, { frame: 10, values: { radius: 3 } }] }];
add('animated blur, frame 1: sharp', doc([layer('a', box(), { effects: anim() })]), [[5, 8, [255, 255, 255, 255], 1]], 0);
add('animated blur, frame 11: soft', doc([layer('a', box(), { effects: anim() })]), [[5, 8, [200, 200, 200, 255], 50]], 10);

app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState']) ipcMain.handle(ch, () => true);
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
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
});
