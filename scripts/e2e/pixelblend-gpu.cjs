// Checks the GPU path of Linear dodge, Subtract and Divide against the CPU path in a real Chromium canvas, and times
// both on a 1920x1080 frame with three such layers.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixelblend-gpu.cjs
//
// Fails (non-zero) when a pixel differs by more than 1 level (colour measured premultiplied and as straight bytes), when
// more than 1 pixel in 100000 differs at all (the reason is where MAX_DIFFER_FRACTION is set), or when the GPU path was not used, or when the engine is not
// the one asked for (scripts/lib/gpu.cjs).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

// Software WebGL (SwiftShader), so the GPU blend path runs and gives the same answer on any machine. GPU_MODE=card runs
// the same comparison on the real card (the pixels must agree within the limit below either way). The timing line is
// only a rough guide in software: the card is the one that says how fast it is.
const gpu = require('../lib/gpu.cjs');
gpu.use('software');

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
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => (e.level === 'error' || e.level === 3) && console.log('page error:', String(e.message ?? e)));
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  const ev = (js) => win.webContents.executeJavaScript(js);
  await ev('new Promise((res) => { const t = () => (window.__framelingEffects ? res(true) : setTimeout(t, 50)); t(); })');
  let failed = 0;
  const REPS = Number(process.env.REPS || 6);
  // The agreed limit. Both paths share one rounding rule at every step (src/effects/pixelBlend.ts), so the answer is
  // the same byte for byte except where a pixel's exact value sits within float noise of a rounding edge: the shader
  // works in 32-bit floats and the CPU path in 64-bit, so a value that close can round either way. That costs one
  // level, never more, and measured 5 pixels in 2.5 million (2e-6) in software. 1e-5 leaves room for a card's own
  // float quirks and nothing else: before the shared rule it was 22005 in 2.5 million, up to 4 levels (Divide).
  const MAX_LEVELS = 1;
  const MAX_DIFFER_FRACTION = 1e-5;
  const agree = (premult, straight) => straight <= MAX_LEVELS && premult <= MAX_LEVELS + 0.01;
  const pairs = `(d, bg) => { const E = window.__framelingEffects; E.setPixelBlendGpu(false); const a = E.pixels(d, 0); const b0 = E.gpuBlits(); E.setPixelBlendGpu(true); const b = E.pixels(d, 0); return { a, b, gpu: E.gpuBlits() - b0 }; }`;
  // Every mode, three layer opacities, solid and see-through shapes, three backdrops, and several random pictures each.
  // Two blend layers stack on one backdrop, so the second one starts from the first one's result: a one level slip in
  // the first shows up in the second, and Divide magnifies it. Colours are compared as the canvas hands them back
  // (straight bytes) and as premultiplied (what is seen); the limit is set above.
  let pixelsTotal = 0;
  let differTotal = 0;
  let worstAll = 0;
  for (const background of ['#ffffff', '#3a5f8c', '']) {
    for (const mode of ['linear-dodge', 'subtract', 'divide']) {
      for (const op of [1, 0.5, 0.2]) {
       for (const soft of [false, true]) {
        const W = 96;
        const H = 80;
        let worst = 0;
        let worstStraight = 0;
        let differ = 0;
        let blits = 0;
        for (let rep = 0; rep < REPS; rep++) {
          const d = doc(W, H, [layer(W, H, {}, soft), layer(W, H, { blend: mode, opacity: op }, soft), layer(W, H, { blend: mode, opacity: 1 }, soft)], background);
          const r = await ev(`(${pairs})(${JSON.stringify(d)})`);
          blits += r.gpu;
          for (let i = 0; i < r.a.length; i += 4) {
            let e = Math.abs(r.a[i + 3] - r.b[i + 3]);
            let es = e;
            for (let c = 0; c < 3; c++) {
              e = Math.max(e, Math.abs((r.a[i + c] * r.a[i + 3]) / 255 - (r.b[i + c] * r.b[i + 3]) / 255));
              es = Math.max(es, Math.abs(r.a[i + c] - r.b[i + c]));
            }
            worst = Math.max(worst, e);
            worstStraight = Math.max(worstStraight, es);
            if (es > 0) differ++;
          }
          pixelsTotal += r.a.length / 4;
        }
        differTotal += differ;
        worstAll = Math.max(worstAll, worst);
        const bad = !agree(worst, worstStraight) || blits === 0;
        if (bad) failed++;
        console.log(`${bad ? 'FAIL' : 'ok  '} ${mode} op ${op} bg ${background || 'none'} ${soft ? 'see-through shapes' : 'solid shapes'}: worst ${worst.toFixed(2)} levels (straight ${worstStraight}), ${differ} pixels differ, ${blits} gpu blits`);
       }
      }
    }
  }
  // A see-through backdrop on its own, exact bytes, over every backdrop alpha: 256 alphas by 256 colours, a layer on top
  // that is solid, half see-through (opacity) or partly see-through itself. This is the case a card got wrong while
  // software did not (the shader's own premultiply came out a level low over a partly see-through result, so a
  // transparent export was off by two or more levels); the random pictures above reach it only by luck. A software
  // run says nothing about a card here, so the card's answer is the one that counts.
  {
    const E_W = 256;
    const E_H = 256;
    let gridBad = 0;
    let gridWorst = 0;
    for (const mode of ['linear-dodge', 'subtract', 'divide']) {
      for (const [topA, opacity] of [[255, 1], [255, 0.5], [128, 1], [60, 0.7]]) {
        const back = [];
        const top = [];
        for (let y = 0; y < E_H; y++) for (let x = 0; x < E_W; x++) { back.push(y, (y * 5 + 40) & 255, 255 - y, x); top.push(90, 160, 200 - (x >> 2), topA); }
        const r = await ev(`window.__framelingEffects.blendBytes(${E_W}, ${E_H}, ${JSON.stringify(back)}, ${JSON.stringify(top)}, '${mode}', ${opacity})`);
        let bad = 0;
        let worstHere = 0;
        for (let i = 0; i < r.cpu.length; i++) {
          const e = Math.abs(r.cpu[i] - r.gpu[i]);
          if (e) bad++;
          worstHere = Math.max(worstHere, e);
        }
        // Colour is compared as straight bytes, where one premultiplied level can be several at a low alpha, so the
        // count of pixels that differ is the measure, with the same share allowed as above.
        const bytesFraction = bad / r.cpu.length;
        const gridBadHere = !r.used || bytesFraction > MAX_DIFFER_FRACTION * 4 || worstHere > 2;
        if (gridBadHere) gridBad++;
        gridWorst = Math.max(gridWorst, worstHere);
        console.log(`${gridBadHere ? 'FAIL' : 'ok  '} see-through backdrop grid ${mode} layer alpha ${topA} op ${opacity}: ${bad} of ${r.cpu.length} bytes differ, worst ${worstHere}${r.used ? '' : ', gpu path declined'}`);
      }
    }
    failed += gridBad;
  }
  const fraction = differTotal / pixelsTotal;
  console.log(`\n${differTotal} of ${pixelsTotal} pixels differ at all (${fraction.toExponential(1)}, limit ${MAX_DIFFER_FRACTION}), worst ${worstAll.toFixed(2)} levels`);
  if (fraction > MAX_DIFFER_FRACTION) failed++;
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
