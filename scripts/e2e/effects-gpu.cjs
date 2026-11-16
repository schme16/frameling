// Checks the GPU path of film grain, wave, colour fringe, dark corners and motion blur against the JS path in a real
// Chromium canvas, and times both on a 1920x1080 frame.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/effects-gpu.cjs
//
// Both paths read the same numbers (src/effects/kernels.ts), so they must agree: the worst difference per pixel (colour
// measured premultiplied, so near-transparent pixels don't count rounding noise) has to stay within the limit for each
// effect, and the GPU path has to have been used. Fails (non-zero) otherwise, or when the engine is not the one asked for.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

// Software WebGL (SwiftShader) gives the same answer on any machine; GPU_MODE=card runs the same comparison on the real card.
const gpu = require('../lib/gpu.cjs');
gpu.use('software');

let n = 0;
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hex = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
const rect = (x, y, w, h, fill, opacity) => ({ id: 'r' + n++, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity });
function layer(W, H, effects, soft) {
  const id = 'l' + n++;
  const shapes = [];
  for (let i = 0; i < 12; i++) shapes.push(rect(rnd() * W * 0.8, rnd() * H * 0.8, 10 + rnd() * W * 0.4, 10 + rnd() * H * 0.4, hex(), soft ? 0.25 + rnd() * 0.75 : 1));
  return { layer: { id, name: id, kind: 'vector', visible: true, locked: false, opacity: 1, effects, cels: [{ id: 'c' + id, start: 0, length: 4, drawingId: 'd' + id }] }, drawing: { id: 'd' + id, kind: 'vector', shapes } };
}
function doc(W, H, parts) {
  const drawings = {};
  for (const p of parts) drawings[p.drawing.id] = p.drawing;
  return { format: 'frameling', version: 1, lineage: true, id: 'd', name: 't', width: W, height: H, fps: 12, length: 4, background: '#e8e2d0', layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [] };
}

// Each effect with the settings tried, and the most a pixel may differ (in levels, premultiplied) between the two paths.
const CASES = {
  grain: { tol: 3, sets: [{ amount: 40, size: 1, colour: 0, change: 1, seed: 3 }, { amount: 70, size: 2.5, colour: 100, change: 0, seed: 11 }] },
  wave: { tol: 3, sets: [{ amount: 6, length: 40, phase: 0, angle: 0, ripple: 0 }, { amount: 9, length: 31, phase: 123, angle: 37, ripple: 80 }] },
  fringe: { tol: 3, sets: [{ distance: 4, angle: 0 }, { distance: 7.5, angle: -52 }] },
  vignette: { tol: 3, sets: [{ amount: 60, size: 65, softness: 60, color: '#000000' }, { amount: 100, size: 20, softness: 30, color: '#ff4060' }] },
  motionblur: { tol: 3, sets: [{ length: 14, angle: 0, trail: 0 }, { length: 25, angle: 35, trail: 60 }, { length: 120, angle: 90, trail: 0 }] },
};

process.on('unhandledRejection', (e) => {
  console.log('FAILED', e);
  app.exit(1);
});

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => (e.level === 'error' || e.level === 3) && console.log('page error:', String(e.message ?? e)));
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  const ev = (js) => win.webContents.executeJavaScript(js);
  await ev('new Promise((res) => { const t = () => (window.__framelingEffects ? res(true) : setTimeout(t, 50)); t(); })');
  let failed = 0;
  const pairs = `(d, scale) => { const E = window.__framelingEffects; E.setEffectsGpu(false); const fresh = () => JSON.parse(JSON.stringify(d)); const a = E.pixels(fresh(), 1, scale); const r0 = E.effectsGpuRuns(); E.setEffectsGpu(true); const b = E.pixels(fresh(), 1, scale); return { a, b, gpu: E.effectsGpuRuns() - r0 }; }`;
  for (const [kind, c] of Object.entries(CASES)) {
    for (const [i, values] of c.sets.entries()) {
      for (const soft of [false, true]) {
        for (const scale of [1, 2]) {
          const W = 96;
          const H = 72;
          const d = doc(W, H, [layer(W, H, undefined, soft), layer(W, H, [{ id: 'e', kind, values }], soft)]);
          const r = await ev(`(${pairs})(${JSON.stringify(d)}, ${scale})`);
          let worst = 0;
          let off = 0;
          let sum = 0;
          for (let p = 0; p < r.a.length; p += 4) {
            let e = Math.abs(r.a[p + 3] - r.b[p + 3]);
            for (let k = 0; k < 3; k++) e = Math.max(e, Math.abs((r.a[p + k] * r.a[p + 3]) / 255 - (r.b[p + k] * r.b[p + 3]) / 255));
            if (e > worst) worst = e;
            if (e > 1) off++;
            sum += e;
          }
          const bad = worst > c.tol || r.gpu === 0;
          if (bad) failed++;
          console.log(`${bad ? 'FAIL' : 'ok  '} ${kind} #${i} ${soft ? 'see-through' : 'solid'} x${scale}: worst ${worst.toFixed(2)} levels, mean ${(sum / (r.a.length / 4)).toFixed(3)}, ${off} of ${r.a.length / 4} pixels over 1, ${r.gpu} gpu runs`);
        }
      }
    }
  }
  // (Each render gets its own copy of the document: finished effect pictures are cached by drawing, so a shared one would hand the second render the first's picture.)
  // Timing: 1920x1080, one layer with the effect on a backdrop layer.
  const W = 1920;
  const H = 1080;
  const rows = [];
  for (const [kind, c] of Object.entries(CASES)) {
    const big = doc(W, H, [layer(W, H, undefined, false), layer(W, H, [{ id: 'e', kind, values: c.sets[c.sets.length - 1] }], false)]);
    const t = {};
    for (const on of [false, true]) t[on ? 'gpu' : 'cpu'] = Math.round((await ev(`(() => { const E = window.__framelingEffects; E.setEffectsGpu(${on}); return E.renderMs(${JSON.stringify(big)}, 0, ${on ? 12 : 2}, 1, true); })()`)) * 10) / 10;
    rows.push(`${kind} ${t.cpu} ms CPU, ${t.gpu} ms GPU`);
  }
  console.log(`1920x1080, one layer with the effect (per frame): ${rows.join('; ')}`);
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  app.exit(failed ? 1 : 0);
});
