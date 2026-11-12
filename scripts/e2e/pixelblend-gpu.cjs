// Checks the GPU path of Linear dodge, Subtract and Divide against the CPU path in a real Chromium canvas, and times
// both on a 1920x1080 frame with three such layers.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixelblend-gpu.cjs
//
// Fails (non-zero) when the two paths differ by more than 1 level on any pixel (colour measured premultiplied, so
// near-transparent pixels don't count rounding noise), or when the GPU path was not used.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// Without a real GPU (xvfb) Chromium blocks WebGL; software WebGL (SwiftShader) lets the GPU path run.
if (process.env.PIXELBLEND_NO_SOFTWARE_GL !== '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}

let n = 0;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hex = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
const rect = (x, y, w, h, fill, opacity) => ({ id: 'r' + n++, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity });
function layer(W, H, extra, soft = true) {
  const id = 'l' + n++;
  const shapes = [];
  for (let i = 0; i < 14; i++) shapes.push(rect(rnd() * W * 0.8, rnd() * H * 0.8, 20 + rnd() * W * 0.5, 20 + rnd() * H * 0.5, hex(), soft ? 0.2 + rnd() * 0.8 : 1));
  return { layer: { id, name: id, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c' + id, start: 0, length: 4, drawingId: 'd' + id }], ...extra }, drawing: { id: 'd' + id, kind: 'vector', shapes } };
}
function doc(W, H, parts, background) {
  const drawings = {};
  for (const p of parts) drawings[p.drawing.id] = p.drawing;
  return { format: 'frameling', version: 1, lineage: true, id: 'd', name: 't', width: W, height: H, fps: 12, length: 4, background, layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [] };
}

process.on('unhandledRejection', (e) => {
  console.log('FAILED', e);
  app.exit(1);
});

app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept', 'library:list']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState']) ipcMain.handle(ch, () => true);
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => (e.level === 'error' || e.level === 3) && console.log('page error:', String(e.message ?? e)));
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  const ev = (js) => win.webContents.executeJavaScript(js);
  await ev('new Promise((res) => { const t = () => (window.__framelingEffects ? res(true) : setTimeout(t, 50)); t(); })');
  let failed = 0;
  const pairs = `(d, bg) => { const E = window.__framelingEffects; E.setPixelBlendGpu(false); const a = E.pixels(d, 0); const b0 = E.gpuBlits(); E.setPixelBlendGpu(true); const b = E.pixels(d, 0); return { a, b, gpu: E.gpuBlits() - b0 }; }`;
  for (const background of ['#ffffff', '#3a5f8c', '']) {
    for (const mode of ['linear-dodge', 'subtract', 'divide']) {
      for (const op of [1, 0.5, 0.2]) {
       for (const soft of [false, true]) {
        const W = 96;
        const H = 80;
        const d = doc(W, H, [layer(W, H, {}, soft), layer(W, H, { blend: mode, opacity: op }, soft), layer(W, H, { blend: mode, opacity: 1 }, soft)], background);
        const r = await ev(`(${pairs})(${JSON.stringify(d)})`);
        let worst = 0;
        let off = 0;
        for (let i = 0; i < r.a.length; i += 4) {
          let e = Math.abs(r.a[i + 3] - r.b[i + 3]);
          for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs((r.a[i + c] * r.a[i + 3]) / 255 - (r.b[i + c] * r.b[i + 3]) / 255));
          if (e > worst) worst = e;
          if (e > 1) off++;
        }
        // Opaque shapes: both paths work from exact colours, so they must agree within 1 level. See-through shapes put
        // colours the CPU path has to un-premultiply into whole bytes first (Divide magnifies that), so they get more room.
        const tol = soft ? 8 : 1.01;
        const bad = worst > tol || r.gpu === 0;
        if (bad) failed++;
        console.log(`${bad ? 'FAIL' : 'ok  '} ${mode} op ${op} bg ${background || 'none'} ${soft ? 'see-through shapes' : 'solid shapes'}: worst ${worst.toFixed(2)} levels, ${off} pixels over 1, ${r.gpu} gpu blits`);
       }
      }
    }
  }
  // Timing: 1920x1080, a backdrop and three layers with a pixel blend each.
  const W = 1920;
  const H = 1080;
  const big = doc(W, H, [layer(W, H, {}), layer(W, H, { blend: 'linear-dodge', opacity: 0.8 }), layer(W, H, { blend: 'subtract' }), layer(W, H, { blend: 'divide', opacity: 0.6 })], '#ffffff');
  const times = {};
  for (const gpu of [false, true]) {
    const ms = await ev(`(() => { const E = window.__framelingEffects; E.setPixelBlendGpu(${gpu}); return E.renderMs(${JSON.stringify(big)}, 0, 12); })()`);
    times[gpu ? 'gpu' : 'cpu'] = Math.round(ms * 10) / 10;
  }
  console.log(`1920x1080, 3 pixel-blend layers: CPU ${times.cpu} ms per frame, GPU ${times.gpu} ms per frame`);
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  app.exit(failed ? 1 : 0);
});
