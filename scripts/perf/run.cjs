// Hidden-Electron performance harness for Frameling. Real input events, real GPU canvas, numbers out as JSON.
//
//   npx electron scripts/perf/run.cjs --out scripts/perf/results/before.json [--only draw,playback] [--label before]
//
// Needs a build first (`npm run build`), or point PERF_RENDERER at another renderer build directory. See README.md.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const outFile = opt('out', null);
const label = opt('label', path.basename(outFile || 'run', '.json'));
const only = opt('only', '') ? opt('only', '').split(',') : null;
const rendererDir = process.env.PERF_RENDERER || path.join(__dirname, '../../dist/renderer');
const WIN_W = 1400;
const WIN_H = 900;

app.commandLine.appendSwitch('enable-precise-memory-info');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// Numbers are speed claims, so they are measured on the real card, and the run fails if the card did not come up (it does
// not quietly measure software). PERF_SOFTWARE_GL=1 asks for software instead, for a machine with no card; the results
// then say so in env.gpuRun. Details and the colour pin: scripts/lib/gpu.cjs.
const gpuMod = require('../lib/gpu.cjs');
gpuMod.use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(xs) {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const r = (v) => Math.round(v * 100) / 100;
  return { n: s.length, mean: r(mean), p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), max: r(s[s.length - 1]) };
}

// Runs inside the page: builds big documents, records rAF timestamps, and reads the ?perf collector.
const PRELUDE = `
window.__h = (() => {
  const prng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let idn = 0;
  const id = (p) => p + '-' + ++idn;
  const BRUSH = { size: 8, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
  const COLORS = ['#1d1b26', '#ff6f91', '#5ab8ff', '#4fd1a5', '#ffc94a', '#9b7bff'];
  function stroke(r, w, h, n) {
    let x = r() * w, y = r() * h, a = r() * 6.28;
    const points = [];
    for (let i = 0; i < n; i++) {
      points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: 0.25 + 0.6 * r() });
      a += (r() - 0.5) * 0.9;
      const step = 5 + r() * 9;
      x = Math.min(w - 2, Math.max(2, x + Math.cos(a) * step));
      y = Math.min(h - 2, Math.max(2, y + Math.sin(a) * step));
    }
    return { id: id('sh'), type: 'stroke', points, brush: BRUSH, color: COLORS[Math.floor(r() * COLORS.length)], opacity: 1 };
  }
  // layers x frames, each frame a different drawing of strokesPer strokes (or one cel when frames is 1).
  function mkDoc({ width = 1280, height = 720, fps = 24, frames = 1, layers = 1, strokesPer = 50, pts = 12, seed = 7, opacity = 1 }) {
    const r = prng(seed);
    const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'perf', width, height, fps, length: frames, background: '#ffffff', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
    for (let l = 0; l < layers; l++) {
      const layer = { id: id('l'), name: 'L' + l, kind: 'vector', visible: true, locked: false, opacity, cels: [] };
      for (let f = 0; f < frames; f++) {
        const d = { id: id('dr'), kind: 'vector', shapes: [] };
        for (let s = 0; s < strokesPer; s++) d.shapes.push(stroke(r, width, height, pts));
        doc.drawings[d.id] = d;
        layer.cels.push({ id: id('c'), start: f, length: 1, drawingId: d.id });
      }
      doc.layers.push(layer);
    }
    return doc;
  }
  let raf = null;
  function startRaf() {
    const ts = [];
    const loop = (t) => { ts.push(t); raf.id = requestAnimationFrame(loop); };
    raf = { ts, id: requestAnimationFrame(loop) };
  }
  function stopRaf() {
    cancelAnimationFrame(raf.id);
    const out = raf.ts; raf = null; return out;
  }
  let longs = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ t: e.startTime, d: e.duration }); }).observe({ entryTypes: ['longtask'] });
  } catch {}
  const takeLongs = () => { const o = longs; longs = []; return o; };
  const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const heap = async () => { gc(); await new Promise((r) => setTimeout(r, 50)); gc(); return performance.memory.usedJSHeapSize; };
  return { mkDoc, startRaf, stopRaf, takeLongs, raf2, heap };
})();
true;
`;

async function main() {
  ipcMain.handle('app:launchFile', () => null);
  ipcMain.handle('recent:list', () => []);
  ipcMain.handle('library:list', () => []);
  ipcMain.handle('autosave:read', () => null);
  await app.whenReady();
  const gpuRun = await gpuMod.confirmOrExit();
  // A window that is truly hidden gets one rAF a second with this app (nothing is presented), which makes every
  // number meaningless. So the window is mapped but parked off-screen and unfocusable: nothing appears, nothing
  // takes focus, and frames are produced at the display's rate. PERF_HIDDEN=1 forces a truly hidden one.
  const hidden = process.env.PERF_HIDDEN === '1';
  const onScreen = process.env.PERF_SHOW === '1';
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: onScreen ? undefined : -4000,
    y: onScreen ? undefined : 0,
    show: false,
    focusable: onScreen,
    skipTaskbar: !onScreen,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '../../dist/preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: ['--frameling-version=perf'],
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  const js = (code) => wc.executeJavaScript(code);
  const send = (e) => wc.sendInputEvent(e);

  // Emulate a slower machine (CPU only; the GPU is what it is): PERF_CPU_SLOWDOWN=4 means four times slower JS.
  const slowdown = Number(process.env.PERF_CPU_SLOWDOWN || 1);
  const dbg = (m) => process.env.PERF_DEBUG && console.error('[perf] ' + m);
  async function load() {
    dbg('load');
    await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1', perf: '1' } });
    if (!hidden) (onScreen ? win.show() : win.showInactive());
    if (slowdown > 1) {
      // Needs a page to talk to, so it's applied after each load.
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: slowdown });
    }
    dbg('loaded');
    await sleep(900);
    await js(PRELUDE);
    dbg('prelude');
    // The welcome screen (if any) is in the way: a fresh blank document and a plain canvas.
    await js(`(() => { const f = window.__frameling; f.store().load(window.__h.mkDoc({ strokesPer: 0, frames: 1 })); f.store().setUi({ tool: 'brush' }); })()`);
    await sleep(300);
    // The welcome sheet covers the canvas: close it, then make sure the canvas really is what's under the pointer.
    for (let i = 0; i < 3; i++) {
      send({ type: 'keyDown', keyCode: 'Escape' });
      send({ type: 'keyUp', keyCode: 'Escape' });
      await sleep(150);
    }
    const covered = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && el.closest('.cv-root') ? '' : (el && el.className) || 'nothing'; })()`);
    if (covered) throw new Error('something covers the canvas: ' + covered);
  }

  /** Puts a document in, fits it, and waits for the first paint. */
  async function setDoc(spec) {
    await js(`(() => { const f = window.__frameling; f.store().load(window.__h.mkDoc(${JSON.stringify(spec)})); f.store().setUi({ tool: 'brush', playing: false, frame: 0 }); window.__framelingPerf.reset(); })()`);
    await js('window.__h.raf2()');
    await sleep(200);
  }

  const canvasBox = () => js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

  // A long wiggly stroke fully inside the canvas; the points are in window coordinates.
  function wiggle(box, n, margin = 40) {
    const pts = [];
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = box.w / 2 - margin;
    const ry = box.h / 2 - margin;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = t * Math.PI * 2 * 5;
      const k = 0.35 + 0.65 * t;
      pts.push([Math.round(cx + Math.cos(a) * rx * k), Math.round(cy + Math.sin(a * 1.07) * ry * k)]);
    }
    return pts;
  }

  async function strokeThrough(pts, { perTick = 4, tickMs = 16 } = {}) {
    send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
    send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
    await sleep(tickMs);
    for (let i = 1; i < pts.length; i += perTick) {
      for (let k = i; k < Math.min(pts.length, i + perTick); k++) send({ type: 'mouseMove', x: pts[k][0], y: pts[k][1], modifiers: ['leftButtonDown'] });
      await sleep(tickMs);
    }
    const l = pts[pts.length - 1];
    send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
  }

  const readBag = () =>
    js(`(() => { const b = window.__framelingPerf; return { latency: b.latency, overlayMs: b.overlayMs, mainMs: b.mainMs, painted: b.painted, builds: b.painter ? b.painter.cache.builds : null }; })()`);
  const deltas = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

  const results = {};

  // ------------------------------------------------------------------ drawing
  async function drawLong() {
    const out = {};
    for (const [name, spec] of [
      ['empty', { strokesPer: 0 }],
      ['strokes300', { strokesPer: 300, pts: 30 }],
      ['strokes3000', { strokesPer: 3000, pts: 30 }],
    ]) {
      await setDoc({ frames: 1, layers: 1, ...spec });
      const box = await canvasBox();
      const pts = wiggle(box, 2000);
      await js('window.__h.takeLongs(); window.__framelingPerf.reset(); window.__h.startRaf()');
      await strokeThrough(pts);
      await sleep(200);
      const raf = await js('window.__h.stopRaf()');
      const longs = await js('window.__h.takeLongs()');
      const bag = await readBag();
      const q = Math.floor(bag.latency.length / 4);
      // The moment of lifting the pen: the document changes and the main canvas repaints (the hitch after a stroke).
      out[name] = {
        rafDelta: stats(deltas(raf)),
        latencyAll: stats(bag.latency),
        latencyFirstQuarter: stats(bag.latency.slice(0, q)),
        latencyLastQuarter: stats(bag.latency.slice(-q)),
        overlayDrawMs: stats(bag.overlayMs),
        overlayDrawMsLastQuarter: stats(bag.overlayMs.slice(-Math.floor(bag.overlayMs.length / 4))),
        mainDrawMs: stats(bag.mainMs),
        mainDrawMsMax: bag.mainMs.length ? Math.max(...bag.mainMs) : 0,
        longTasks: longs.length,
        longTaskMaxMs: longs.length ? Math.round(Math.max(...longs.map((l) => l.d))) : 0,
        bitmapBuilds: bag.builds,
      };
    }
    // One short stroke at a steady one-event-per-frame pace on the busy document: plain brush latency.
    await setDoc({ frames: 1, layers: 1, strokesPer: 300, pts: 30 });
    const box = await canvasBox();
    await js('window.__framelingPerf.reset()');
    await strokeThrough(wiggle(box, 240), { perTick: 1 });
    await sleep(200);
    const bag = await readBag();
    out.steadyLatencyStrokes300 = stats(bag.latency);
    return out;
  }

  // ------------------------------------------------------------------ playback
  async function playback() {
    const out = {};
    await setDoc({ frames: 600, layers: 5, strokesPer: 50, pts: 10, fps: 24 });
    for (const onion of [false, true]) {
      await js(`window.__frameling.store().setUi({ frame: 0, playing: false, onion: { ...window.__frameling.store().get().ui.onion, enabled: ${onion} } })`);
      await js('window.__h.raf2()');
      await sleep(300);
      await js('window.__h.takeLongs(); window.__framelingPerf.reset(); window.__h.startRaf()');
      const t0 = Date.now();
      await js(`window.__frameling.run('timeline.play')`);
      // 8 seconds of playback is 192 frames at 24 fps.
      await sleep(8000);
      await js(`window.__frameling.run('timeline.play')`);
      const raf = await js('window.__h.stopRaf()');
      const longs = await js('window.__h.takeLongs()');
      const bag = await readBag();
      const elapsed = (Date.now() - t0) / 1000;
      const painted = bag.painted;
      const dt = deltas(painted.map((p) => p.t));
      const skipped = painted.slice(1).reduce((n, p, i) => n + Math.max(0, p.frame - painted[i].frame - 1), 0);
      const ideal = 1000 / 24;
      out[onion ? 'onionOn' : 'onionOff'] = {
        secondsPlayed: Math.round(elapsed * 10) / 10,
        framesPainted: painted.length,
        framesSkipped: skipped,
        paintIntervalMs: stats(dt),
        latePaints: dt.filter((d) => d > ideal * 1.5).length,
        paintMs: stats(bag.mainMs),
        rafDelta: stats(deltas(raf)),
        longTasks: longs.length,
        longTaskMaxMs: longs.length ? Math.round(Math.max(...longs.map((l) => l.d))) : 0,
        bitmapBuilds: bag.builds,
      };
      await js(`window.__frameling.store().setUi({ playing: false })`);
    }
    // Second lap over frames already seen once: what a warm cache buys.
    await js(`window.__frameling.store().setUi({ frame: 0, playing: false })`);
    await js('window.__h.raf2()');
    await js('window.__framelingPerf.reset(); window.__h.startRaf()');
    await js(`window.__frameling.run('timeline.play')`);
    await sleep(4000);
    await js(`window.__frameling.run('timeline.play')`);
    await js('window.__h.stopRaf()');
    {
      const bag = await readBag();
      const dt = deltas(bag.painted.map((p) => p.t));
      out.replayFirstSeconds = { framesPainted: bag.painted.length, paintIntervalMs: stats(dt), latePaints: dt.filter((d) => d > 1000 / 24 * 1.5).length, paintMs: stats(bag.mainMs) };
    }
    // Scrubbing with onion skin on: each step shows the frame plus its ghosts.
    await js(`window.__frameling.store().setUi({ frame: 300, playing: false, onion: { ...window.__frameling.store().get().ui.onion, enabled: true } })`);
    await js('window.__h.raf2()');
    await js('window.__framelingPerf.reset(); window.__h.startRaf()');
    for (let f = 301; f < 361; f++) {
      await js(`window.__frameling.store().setUi({ frame: ${f} })`);
      await sleep(33);
    }
    await js('window.__h.stopRaf()');
    {
      const bag = await readBag();
      out.scrubWithOnion60 = { paintMs: stats(bag.mainMs), bitmapBuilds: bag.builds };
    }
    // Stepping through frames the way a person does (a key press every ~150 ms, onion skin off), so a paused
    // canvas has idle time between steps. What the paint on each step costs.
    await js(`window.__frameling.store().setUi({ frame: 400, playing: false, onion: { ...window.__frameling.store().get().ui.onion, enabled: false } })`);
    await js('window.__h.raf2()');
    await sleep(400);
    await js('window.__framelingPerf.reset()');
    for (let f = 401; f < 461; f++) {
      await js(`window.__frameling.store().setUi({ frame: ${f} })`);
      await sleep(150);
    }
    {
      const bag = await readBag();
      out.stepPaused60 = { paintMs: stats(bag.mainMs), bitmapBuilds: bag.builds };
    }
    // What one playhead move costs everything that listens to the store (React panels, menus), without any drawing.
    out.storeFrameUpdateMs = stats(
      await js(`(async () => {
        const s = window.__frameling.store(); const xs = [];
        for (let i = 0; i < 120; i++) {
          const t = performance.now();
          s.setUi({ frame: 100 + (i % 50) });
          await Promise.resolve();
          xs.push(performance.now() - t);
          await new Promise((r) => requestAnimationFrame(r));
        }
        return xs;
      })()`),
    );
    await js(`window.__frameling.store().setUi({ onion: { ...window.__frameling.store().get().ui.onion, enabled: false } })`);
    return out;
  }

  // ------------------------------------------------------------------ effects, folders, masks, tiles, bones, symbols
  // The kitchen sink stretched to 300 frames at 24 fps (src/export/kitchenSink.ts): ten layers, effects on several,
  // a folder with a mask, tiles, a tweening symbol and an arm bending a mesh layer. Played at 1x for 8 seconds.
  async function rigfx() {
    await js(`window.__framelingExport.loadKitchenSinkPerf(300)`);
    await js(`window.__frameling.store().setUi({ tool: 'brush', playing: false, frame: 0 })`);
    await js('window.__h.raf2()');
    await sleep(500);
    const out = {};
    for (const lap of ['first', 'second']) {
      await js(`window.__frameling.store().setUi({ frame: 0, playing: false })`);
      await js('window.__h.raf2()');
      await js('window.__h.takeLongs(); window.__framelingPerf.reset(); window.__h.startRaf()');
      await js(`window.__frameling.run('timeline.play')`);
      await sleep(8000);
      await js(`window.__frameling.run('timeline.play')`);
      await js('window.__h.stopRaf()');
      const longs = await js('window.__h.takeLongs()');
      const bag = await readBag();
      const dt = deltas(bag.painted.map((p) => p.t));
      const skipped = bag.painted.slice(1).reduce((n, p, i) => n + Math.max(0, p.frame - bag.painted[i].frame - 1), 0);
      out[lap] = { framesPainted: bag.painted.length, framesSkipped: skipped, paintIntervalMs: stats(dt), latePaints: dt.filter((d) => d > (1000 / 24) * 1.5).length, paintMs: stats(bag.mainMs), longTasks: longs.length, longTaskMaxMs: longs.length ? Math.round(Math.max(...longs.map((l) => l.d))) : 0 };
    }
    return out;
  }

  // ------------------------------------------------------------------ pixel-mixed blend modes
  // One 1920x1080 frame: a backdrop and three layers on Linear dodge, Subtract and Divide, rendered by the single renderer
  // (what an export does), with the GPU path off (pixel by pixel on the CPU, the old way) and on.
  async function pixelblend() {
    const spec = { width: 1920, height: 1080, frames: 1, layers: 4, strokesPer: 12, pts: 14, opacity: 1 };
    const out = {};
    // The same frame with every layer on Normal, for what the drawing alone costs.
    {
      const ms = [];
      for (let lap = 0; lap < 5; lap++) ms.push(await js(`window.__framelingEffects.renderMs(window.__h.mkDoc(${JSON.stringify(spec)}), 0, 6)`));
      out.normalMs = stats(ms);
    }
    for (const gpu of [false, true]) {
      const ms = [];
      for (let lap = 0; lap < 5; lap++) {
        ms.push(
          await js(`(() => {
            const doc = window.__h.mkDoc(${JSON.stringify(spec)});
            ['linear-dodge', 'subtract', 'divide'].forEach((m, i) => { doc.layers[i + 1].blend = m; doc.layers[i + 1].opacity = [0.8, 1, 0.6][i]; });
            const E = window.__framelingEffects; E.setPixelBlendGpu(${gpu});
            return E.renderMs(doc, 0, 6);
          })()`),
        );
      }
      out[gpu ? 'gpu' : 'cpu'] = { frameMs: stats(ms), gpuBlits: await js('window.__framelingEffects.gpuBlits()') };
    }
    out.speedup = Math.round((out.cpu.frameMs.p50 / out.gpu.frameMs.p50) * 100) / 100;
    return out;
  }

  // ------------------------------------------------------------------ pixel drawing, full grid
  // A pixel drawing that fills the whole grid (the worst case for the live preview): the first dab of a stroke, from the
  // pointer event to the canvas showing it, how much is uploaded to the live canvas, and what each paint costs after.
  async function pixellive() {
    const out = {};
    for (const size of [2048, 4096]) {
      await setDoc({ frames: 1, layers: 1, strokesPer: 0 });
      // Opening a pixel document asks about the workspace the first time: answer it in advance.
      await js(`localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
      await js(`(() => {
        const F = window.__frameling;
        const doc = window.__h.mkDoc({ width: ${size}, height: ${size}, frames: 1, layers: 1, strokesPer: 0 });
        const px = new Uint8ClampedArray(${size} * ${size} * 4);
        for (let i = 0; i < ${size} * ${size}; i++) { const o = i * 4; px[o] = (i * 7) & 255; px[o + 1] = (i >> 6) & 255; px[o + 2] = 90; px[o + 3] = 255; }
        const layer = doc.layers[0];
        layer.kind = 'pixel'; layer.pixelSize = 1;
        const dr = { id: 'px-full', kind: 'pixel', width: ${size}, height: ${size}, pixels: px };
        doc.drawings = { [dr.id]: dr };
        layer.cels = [{ id: 'cel-full', start: 0, length: 1, drawingId: dr.id }];
        F.store().load(doc);
        F.store().setUi({ tool: 'pencil', activeLayerId: layer.id, frame: 0, color: '#d6204a' });
        F.run('view.fit');
        return true;
      })()`);
      await js('window.__h.raf2()');
      await sleep(400);
      for (let i = 0; i < 2; i++) {
        send({ type: 'keyDown', keyCode: 'Escape' });
        send({ type: 'keyUp', keyCode: 'Escape' });
        await sleep(150);
      }
      const runs = [];
      for (let lap = 0; lap < 4; lap++) {
        const box = await canvasBox();
        await js(`(() => {
          const T = window.__pxl = { down: 0, puts: [], hooked: false };
          const proto = (typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D : CanvasRenderingContext2D).prototype;
          if (!proto.__putHook) {
            const orig = proto.putImageData; proto.__putHook = true;
            proto.putImageData = function (img, ...a) { const t0 = performance.now(); const r = orig.call(this, img, ...a); window.__pxl.puts.push({ at: t0, ms: performance.now() - t0, px: (a[4] ?? img.width) * (a[5] ?? img.height) }); return r; };
          }
          window.addEventListener('pointerdown', (e) => { if (!T.down) T.down = e.timeStamp; }, { capture: true, once: true });
          window.addEventListener('pointerup', (e) => { T.up = e.timeStamp; }, { capture: true, once: true });
          window.__framelingPerf.reset();
        })()`);
        const cx = Math.round(box.x + box.w / 2 + lap * 30);
        const cy = Math.round(box.y + box.h / 2);
        const pts = [];
        for (let i = 0; i < 60; i++) pts.push([cx + i * 3, cy + Math.round(Math.sin(i / 5) * 12)]);
        await strokeThrough(pts, { perTick: 2, tickMs: 16 });
        await sleep(250);
        if (process.env.PERF_DEBUG) dbg('stroke ' + JSON.stringify(box) + ' ' + JSON.stringify(await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); const el = document.elementFromPoint(${cx}, ${cy}); return [el && el.className, window.__frameling.store().get().ui.tool, window.__framelingPerf.painted.length, Object.keys(window.__frameling.store().get().doc.drawings).length]; })()`)));
        runs.push(
          await js(`(() => {
            const b = window.__framelingPerf, T = window.__pxl;
            const first = b.painted.find((p) => p.t >= T.down);
            const during = b.mainMs;
            const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
            return {
              firstPaintMs: first ? first.t - T.down : null,
              firstMainMs: during[0] ?? null,
              mainMsMedian: q(during, 0.5), mainMsP95: q(during, 0.95), mainMsMax: Math.max(0, ...during),
              uploads: T.puts.length, uploadMs: T.puts.reduce((a, p) => a + p.ms, 0), uploadMegapixels: T.puts.reduce((a, p) => a + p.px, 0) / 1e6,
              maxUploadMs: Math.max(0, ...T.puts.map((p) => p.ms)),
              uploadMsWhileDrawing: T.puts.filter((p) => p.at < T.up).reduce((a, p) => a + p.ms, 0), maxUploadMsWhileDrawing: Math.max(0, ...T.puts.filter((p) => p.at < T.up).map((p) => p.ms)),
              bigUploads: T.puts.filter((p) => p.ms > 2).map((p) => ({ ms: Math.round(p.ms * 10) / 10, megapixels: Math.round(p.px / 1e4) / 100, afterDownMs: Math.round(p.at - T.down), beforeUpMs: Math.round(T.up - p.at) })),
              uploadMsAfterRelease: T.puts.filter((p) => p.at >= T.up).reduce((a, p) => a + p.ms, 0),
            };
          })()`),
        );
        await js('window.__frameling.store().undo()');
        await js('window.__h.raf2()');
        await sleep(150);
      }
      const med = (k) => stats(runs.map((r) => r[k])).p50;
      out[size + 'px'] = { firstPaintMs: med('firstPaintMs'), firstMainMs: med('firstMainMs'), mainMsMedian: med('mainMsMedian'), mainMsP95: med('mainMsP95'), mainMsMax: med('mainMsMax'), uploads: med('uploads'), uploadMs: med('uploadMs'), uploadMegapixels: med('uploadMegapixels'), maxUploadMs: med('maxUploadMs'), uploadMsWhileDrawing: med('uploadMsWhileDrawing'), maxUploadMsWhileDrawing: med('maxUploadMsWhileDrawing'), uploadMsAfterRelease: med('uploadMsAfterRelease'), laps: runs };
    }
    return out;
  }

  // ------------------------------------------------------------------ templates
  async function templates() {
    const out = {};
    const ids = await js(`window.__framelingPerf.templates.map((t) => t.id)`);
    for (const id of ids) {
      const runs = [];
      for (let k = 0; k < 3; k++) {
        const r = await js(`(async () => {
          const f = window.__frameling; const b = window.__framelingPerf;
          f.store().load(window.__h.mkDoc({ strokesPer: 0 }));
          await window.__h.raf2();
          b.reset();
          const t = b.templates.find((x) => x.id === ${JSON.stringify(id)});
          const t0 = performance.now();
          const doc = t.make();
          const t1 = performance.now();
          f.store().load(doc);
          // First main paint after the load, then the next presented frame.
          await new Promise((res) => { const poll = () => (b.painted.length ? res() : requestAnimationFrame(poll)); poll(); });
          const t2 = b.painted[0].t;
          await window.__h.raf2();
          return { make: t1 - t0, firstPaintAfterLoad: t2 - t1, presented: performance.now() - t1 };
        })()`);
        runs.push(r);
        await sleep(100);
      }
      const med = (key) => stats(runs.map((r) => r[key])).p50;
      out[id] = { makeMs: med('make'), firstPaintMs: med('firstPaintAfterLoad'), presentedMs: med('presented'), coldFirstPaintMs: Math.round(runs[0].firstPaintAfterLoad * 100) / 100 };
    }
    return out;
  }

  // ------------------------------------------------------------------ zoom and pan
  async function zoomPan() {
    const out = {};
    for (const [name, spec] of [
      ['strokes300', { frames: 1, layers: 1, strokesPer: 300, pts: 30 }],
      ['layers5x50', { frames: 1, layers: 5, strokesPer: 50, pts: 12 }],
    ]) {
      await setDoc(spec);
      const box = await canvasBox();
      const cx = Math.round(box.x + box.w / 2);
      const cy = Math.round(box.y + box.h / 2);
      // Zoom: ctrl+wheel in then out, 90 ticks each, about 16 ms apart.
      await js('window.__framelingPerf.reset(); window.__h.takeLongs(); window.__h.startRaf()');
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 90; i++) {
          send({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: dir * 100, wheelTicksY: dir, modifiers: ['control'], canScroll: true });
          await sleep(16);
        }
      }
      await sleep(400);
      let raf = await js('window.__h.stopRaf()');
      let bag = await readBag();
      const zoomLongs = await js('window.__h.takeLongs()');
      out[name + '_zoom'] = { rafDelta: stats(deltas(raf)), mainDrawMs: stats(bag.mainMs), overlayDrawMs: stats(bag.overlayMs), longTasks: zoomLongs.length, bitmapBuilds: bag.builds };
      // Pan: a middle-button drag in a big circle.
      await js('window.__framelingPerf.reset(); window.__h.takeLongs(); window.__h.startRaf()');
      send({ type: 'mouseMove', x: cx, y: cy });
      send({ type: 'mouseDown', x: cx, y: cy, button: 'middle', clickCount: 1 });
      for (let i = 0; i < 240; i++) {
        const a = (i / 240) * Math.PI * 4;
        send({ type: 'mouseMove', x: Math.round(cx + Math.cos(a) * 160), y: Math.round(cy + Math.sin(a) * 120), modifiers: ['middleButtonDown'] });
        await sleep(8);
      }
      send({ type: 'mouseUp', x: cx, y: cy, button: 'middle', clickCount: 1 });
      await sleep(300);
      raf = await js('window.__h.stopRaf()');
      bag = await readBag();
      const panLongs = await js('window.__h.takeLongs()');
      out[name + '_pan'] = { rafDelta: stats(deltas(raf)), mainDrawMs: stats(bag.mainMs), longTasks: panLongs.length, bitmapBuilds: bag.builds };
      // Pan again at 400%: the stage is bigger than the screen, so nothing can be cached and every frame is drawn live.
      await js(`window.__frameling.store().setUi({ zoom: 4, panX: -900, panY: -500 })`);
      await js('window.__h.raf2()');
      await js('window.__framelingPerf.reset(); window.__h.takeLongs(); window.__h.startRaf()');
      send({ type: 'mouseMove', x: cx, y: cy });
      send({ type: 'mouseDown', x: cx, y: cy, button: 'middle', clickCount: 1 });
      for (let i = 0; i < 240; i++) {
        const a = (i / 240) * Math.PI * 4;
        send({ type: 'mouseMove', x: Math.round(cx + Math.cos(a) * 160), y: Math.round(cy + Math.sin(a) * 120), modifiers: ['middleButtonDown'] });
        await sleep(8);
      }
      send({ type: 'mouseUp', x: cx, y: cy, button: 'middle', clickCount: 1 });
      await sleep(300);
      raf = await js('window.__h.stopRaf()');
      bag = await readBag();
      const zoomedLongs = await js('window.__h.takeLongs()');
      out[name + '_pan400'] = { rafDelta: stats(deltas(raf)), mainDrawMs: stats(bag.mainMs), longTasks: zoomedLongs.length, bitmapBuilds: bag.builds };
    }
    return out;
  }

  // ------------------------------------------------------------------ onion skin through the camera
  // A heavy drawing on every frame, a camera that is not the plain view, the canvas looking through it, onion skin on.
  // Panning the view repaints without changing a ghost (cached ghost frames are only blitted); scrubbing changes them.
  async function onionCamera() {
    const out = {};
    for (const [name, spec] of [
      ['strokes300x2', { frames: 8, layers: 2, strokesPer: 300, pts: 30 }],
      ['strokes1000x2', { frames: 8, layers: 2, strokesPer: 1000, pts: 30 }],
    ]) {
      await setDoc(spec);
      await js(`(() => {
        const f = window.__frameling;
        const doc = JSON.parse(JSON.stringify(f.store().get().doc));
        const view = { x: doc.width / 2 + 40, y: doc.height / 2, zoom: 1.25, rotation: 0 };
        doc.drawings.camdr = { id: 'camdr', kind: 'camera', view };
        doc.layers.push({ id: 'camlayer', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, onion: false, cels: [{ id: 'camcel', start: 0, length: doc.length, drawingId: 'camdr' }] });
        f.store().load(doc);
        f.anim.view({ throughCamera: true });
        f.store().setUi({ tool: 'brush', playing: false, frame: 4, onion: { ...f.store().get().ui.onion, enabled: true, before: 2, after: 2 } });
      })()`);
      await js('window.__h.raf2()');
      await sleep(400);
      // Pan: 120 repaints with the same ghosts.
      await js('window.__framelingPerf.reset(); window.__h.takeLongs(); window.__h.startRaf()');
      for (let i = 0; i < 120; i++) {
        await js(`window.__frameling.store().setUi({ panX: ${Math.round(Math.sin(i / 10) * 60)}, panY: ${Math.round(Math.cos(i / 10) * 40)} })`);
        await js('window.__h.raf2()');
      }
      let raf = await js('window.__h.stopRaf()');
      let bag = await readBag();
      out[name + '_pan'] = { rafDelta: stats(deltas(raf)), mainDrawMs: stats(bag.mainMs), longTasks: (await js('window.__h.takeLongs()')).length };
      // Scrub: step through the frames (each new frame brings new ghosts, then the cache serves the way back).
      await js('window.__framelingPerf.reset(); window.__h.takeLongs(); window.__h.startRaf()');
      for (let i = 0; i < 80; i++) {
        await js(`window.__frameling.store().setUi({ frame: ${2 + (i % 5)} })`);
        await js('window.__h.raf2()');
      }
      raf = await js('window.__h.stopRaf()');
      bag = await readBag();
      out[name + '_scrub'] = { rafDelta: stats(deltas(raf)), mainDrawMs: stats(bag.mainMs), longTasks: (await js('window.__h.takeLongs()')).length };
    }
    return out;
  }

  // ------------------------------------------------------------------ memory
  async function memory() {
    await setDoc({ frames: 1, layers: 1, strokesPer: 0 });
    const box = await canvasBox();
    const heap0 = await js('window.__h.heap()');
    const r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 200; i++) {
      const cx = box.x + r(120, box.w - 120);
      const cy = box.y + r(120, box.h - 120);
      const pts = [];
      for (let k = 0; k < 24; k++) pts.push([Math.round(cx + Math.cos(k / 4 + i) * (30 + k * 3)), Math.round(cy + Math.sin(k / 4 + i) * (30 + k * 2))]);
      await strokeThrough(pts, { perTick: 3, tickMs: 6 });
      await sleep(10);
    }
    await sleep(300);
    const heap200 = await js('window.__h.heap()');
    const strokes = await js(`window.__frameling.store().get().doc.drawings[Object.keys(window.__frameling.store().get().doc.drawings)[0]].shapes.length`);
    for (let i = 0; i < 100; i++) {
      await js('window.__frameling.store().undo()');
      if (i % 10 === 0) await js('window.__h.raf2()');
    }
    await js('window.__h.raf2()');
    const heapUndo = await js('window.__h.heap()');
    const mb = (b) => Math.round((b / 1048576) * 10) / 10;
    const strokesLeft = await js(`(() => { const d = window.__frameling.store().get().doc; const k = Object.keys(d.drawings)[0]; return k ? d.drawings[k].shapes.length : 0; })()`);
    const cacheSize = await js(`(() => { const c = window.__framelingPerf.painter.cache; return c.size ? { entries: c.size.entries, megapixels: Math.round(c.size.pixels / 1e5) / 10 } : null; })()`);
    return { bitmapCache: cacheSize, strokesDrawn: strokes, strokesAfterUndo: strokesLeft, heapMBStart: mb(heap0), heapMBAfter200Strokes: mb(heap200), heapMBAfter100Undos: mb(heapUndo), growthMB: mb(heapUndo - heap0) };
  }

  // ------------------------------------------------------------------ soak (memory over repeated use)
  // A heap snapshot summed by constructor: { name: { count, size } }.
  // Snapshots of big documents are far past the longest string V8 allows, so the chunks go to a file and the nodes and
  // strings are read from it piecewise.
  async function heapSummary() {
    await js('window.__h.heap()');
    const d = wc.debugger;
    if (!d.isAttached()) d.attach('1.3');
    const file = path.join(os.tmpdir(), `frameling-heap-${process.pid}.heapsnapshot`);
    const fd = fs.openSync(file, 'w');
    const onMsg = (_e, method, params) => {
      if (method === 'HeapProfiler.addHeapSnapshotChunk') fs.writeSync(fd, params.chunk);
    };
    d.on('message', onMsg);
    await d.sendCommand('HeapProfiler.enable');
    await d.sendCommand('HeapProfiler.collectGarbage');
    await d.sendCommand('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    d.removeListener('message', onMsg);
    fs.closeSync(fd);
    const buf = fs.readFileSync(file);
    fs.rmSync(file, { force: true });
    const metaEnd = buf.indexOf('"nodes":[');
    const meta = JSON.parse(buf.subarray(buf.indexOf('{"node_fields"'), buf.indexOf(',"node_count"')).toString());
    const f = meta.node_fields;
    const types = meta.node_types[0];
    const nodesEnd = buf.indexOf(']', metaEnd);
    const sStart = buf.lastIndexOf('"strings":[');
    const strings = JSON.parse(buf.subarray(sStart + 10, buf.lastIndexOf(']') + 1).toString());
    const [iType, iName, iSize] = ['type', 'name', 'self_size'].map((k) => f.indexOf(k));
    const out = {};
    let total = 0;
    // The nodes are a flat list of numbers, too many to hold at once, so they're summed one node at a time.
    const node = new Array(f.length).fill(0);
    let k = 0;
    const take = () => {
      const type = types[node[iType]];
      const size = node[iSize];
      total += size;
      const name = type === 'object' || type === 'native' || type === 'closure' ? strings[node[iName]] : '(' + type + ')';
      const o = (out[name] ??= { count: 0, size: 0 });
      o.count++;
      o.size += size;
    };
    let n = 0;
    let inNum = false;
    for (let i = metaEnd + 9; i <= nodesEnd; i++) {
      const c = buf[i];
      if (c >= 48 && c <= 57) {
        n = n * 10 + (c - 48);
        inNum = true;
      } else if (inNum) {
        node[k++] = n;
        if (k === f.length) {
          take();
          k = 0;
        }
        n = 0;
        inNum = false;
      }
    }
    return { total, byName: out };
  }

  function heapDiff(a, b, n = 12) {
    const rows = [];
    for (const [k, v] of Object.entries(b.byName)) {
      const o = a.byName[k] ?? { count: 0, size: 0 };
      if (v.size - o.size > 0 || v.count - o.count > 0) rows.push({ name: k.slice(0, 60), dCount: v.count - o.count, dKB: Math.round((v.size - o.size) / 1024) });
    }
    return { totalKB: Math.round((b.total - a.total) / 1024), top: rows.sort((x, y) => y.dKB - x.dKB).slice(0, n) };
  }

  // Opens a document, then does the same round several times: scrub every frame, play 5 s, export a GIF of the
  // whole thing. After each round, the JS heap after a full GC. Bounded means the later rounds stop adding to it.
  // Heap snapshots after the second and last rounds are compared by constructor, to show what keeps growing.
  async function soak() {
    const out = {};
    const rounds = Number(process.env.PERF_SOAK_ROUNDS || 4);
    const docs = {
      kitchenSink600: `window.__framelingExport.loadKitchenSinkPerf(600)`,
      strokes600: `window.__frameling.store().load(window.__h.mkDoc({ frames: 600, layers: 5, strokesPer: 40, pts: 10, fps: 24 }))`,
    };
    for (const [name, open] of Object.entries(docs)) {
      await js(open);
      await js(`window.__frameling.store().setUi({ tool: 'brush', playing: false, frame: 0 })`);
      await js('window.__h.raf2()');
      await sleep(500);
      const length = await js('window.__frameling.store().get().doc.length');
      const heaps = [await js('window.__h.heap()')];
      const caches = [];
      let snapA = null;
      let snapB = null;
      const exports = [];
      for (let r = 0; r < rounds; r++) {
        for (let f = 0; f < length; f += 1) {
          await js(`window.__frameling.store().setUi({ frame: ${f} })`);
          if (f % 4 === 0) await js('new Promise((r) => requestAnimationFrame(r))');
        }
        await js(`window.__frameling.store().setUi({ frame: 0 })`);
        await js(`window.__frameling.run('timeline.play')`);
        await sleep(5000);
        await js(`window.__frameling.run('timeline.play')`);
        const ex = await js(`(async () => { const s = { ...window.__framelingExport.defaults(), format: 'gif', range: 'all', scale: 0.25 }; try { return await window.__framelingExport.encode(s); } catch (e) { return { error: String(e) }; } })()`);
        exports.push(ex.error ? 'error: ' + ex.error : ex.ms);
        await sleep(300);
        heaps.push(await js('window.__h.heap()'));
        caches.push(await js(`(() => { const c = window.__framelingPerf.painter && window.__framelingPerf.painter.cache; return c && c.size ? { entries: c.size.entries, megapixels: Math.round(c.size.pixels / 1e5) / 10 } : null; })()`));
        if (r === 1) snapA = await heapSummary();
        if (r === rounds - 1) snapB = await heapSummary();
      }
      const mb = (b) => Math.round((b / 1048576) * 10) / 10;
      out[name] = {
        frames: length,
        heapMB: heaps.map(mb),
        growthAfterRound2MB: mb(heaps[heaps.length - 1] - heaps[2]),
        bitmapCache: caches,
        exportMs: exports,
        snapshotDiffRound2ToLast: snapA && snapB ? heapDiff(snapA, snapB) : null,
      };
    }
    return out;
  }

  const tests = { draw: drawLong, playback, rigfx, pixelblend, pixellive, templates, zoompan: zoomPan, onioncam: onionCamera, memory, soak };
  await load();
  const feat = app.getGPUFeatureStatus();
  results.env = {
    label,
    cpuSlowdown: slowdown,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    cpu: os.cpus()[0]?.model,
    gpuRun,
    window: [WIN_W, WIN_H],
    gpu2dCanvas: feat.canvas_oop_rasterization ?? feat['2d_canvas'],
    gpuFeatures: { canvas: feat['2d_canvas'], oop: feat.canvas_oop_rasterization, gpu_compositing: feat.gpu_compositing },
    // (No gpuDevice here any more: getGPUInfo lists the first device, not the one drawing, so it named the wrong card. gpuRun.renderer is what WebGL says is drawing.)
    dpr: await js('window.devicePixelRatio'),
    idleRafMs: await js(`new Promise((res) => { const ts = []; const l = (t) => { ts.push(t); if (ts.length < 40) requestAnimationFrame(l); else res((ts[39] - ts[0]) / 39); }; requestAnimationFrame(l); })`),
    renderer: rendererDir,
    when: new Date().toISOString(),
  };
  for (const [name, fn] of Object.entries(tests)) {
    if (only ? !only.includes(name) : name === 'soak') continue; // soak is long, so only when asked for
    process.stdout.write(`${name}... `);
    const t = Date.now();
    try {
      await load();
      results[name] = await fn();
      console.log(`${((Date.now() - t) / 1000).toFixed(1)}s`);
    } catch (e) {
      results[name] = { error: String(e && e.stack ? e.stack : e) };
      console.log('FAILED ' + e);
    }
  }
  results.consoleErrors = errors.slice(0, 20);
  const json = JSON.stringify(results, null, 2);
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, json);
    console.log('wrote ' + outFile);
  } else console.log(json);
  win.destroy();
  app.quit();
}

main().catch((e) => {
  console.error(e);
  app.exit(1);
});
