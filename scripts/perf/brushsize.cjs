// Big brush sizes: what a stroke costs with each tip at the old cap and at the top of the new slider range.
// Same set-up as run.cjs (real input events, real GPU canvas, numbers out as JSON). Run it inside xvfb after a build:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/brushsize.cjs --out scripts/perf/results/brushsize-after.json [--only vector,pixel] [--label after]
//
// PERF_RENDERER points at another renderer build, so the same run can measure development (before) and this branch (after).
// BRUSH_CANVAS=4000x3000 sets the vector canvas; BRUSH_EVENTS sets pointer moves per stroke (default 40).
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

  const EVENTS = Number(process.env.BRUSH_EVENTS || 40);
  const [CW, CH] = (process.env.BRUSH_CANVAS || '4000x3000').split('x').map(Number);

  // The tips as a new brush starts with them (src/geometry/tip.ts defaultTip).
  const TIPS = `(() => {
    const ribbon = () => { const o = [], n = 16; for (let i = 0; i <= n; i++) { const t = i / n; o.push(-0.5 + t, -0.07 * Math.pow(Math.sin(Math.PI * t), 0.7)); } for (let i = n - 1; i >= 1; i--) { const t = i / n; o.push(-0.5 + t, 0.07 * Math.pow(Math.sin(Math.PI * t), 0.7)); } return [o]; };
    const stadium = (w, h) => { const o = [], r = h / 2; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; o.push(w / 2 - r + Math.cos(a) * r, Math.sin(a) * r); } for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 + (i / 8) * Math.PI; o.push(-w / 2 + r + Math.cos(a) * r, Math.sin(a) * r); } return o; };
    return {
      plain: null,
      chalk: { kind: 'chalk', amount: 0.6, grain: 1 },
      charcoal: { kind: 'charcoal', amount: 0.75, grain: 1.2 },
      watercolour: { kind: 'watercolour', amount: 0.6 },
      stamp: { kind: 'stamp', shape: 'leaf', spacing: 1.1, jitter: 0.25, angle: 'follow', scatter: 0.15 },
      nib: { kind: 'nib', roundness: 0.3, nibAngle: 40, angle: 'upright' },
      along: { kind: 'along', custom: ribbon(), fit: 'stretch' },
      edged: { kind: 'edged', custom: [stadium(1, 0.56), stadium(0.64, 0.24)] },
      bristle: { kind: 'bristle', count: 14, stiffness: 0.6, amount: 0.25 },
    };
  })()`;

  // One stroke, EVENTS pointer moves one frame apart. Stops sending early when the page is clearly stuck (the numbers say so).
  async function oneStroke(pts) {
    await js('window.__h.takeLongs(); window.__framelingPerf.reset(); window.__h.startRaf()');
    const t0 = Date.now();
    send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
    send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
    let sent = 1;
    let aborted = false;
    for (let i = 1; i < pts.length - 1; i++) {
      send({ type: 'mouseMove', x: pts[i][0], y: pts[i][1], modifiers: ['leftButtonDown'] });
      sent++;
      await sleep(16);
      if (Date.now() - t0 > 25000) {
        aborted = true;
        break;
      }
    }
    // Everything sent is handled before the pen lifts, so the last moves are timed too.
    const waited = await js(`(async () => { const t = performance.now(); await new Promise((r) => setTimeout(r, 0)); return performance.now() - t; })()`);
    const raf = await js('window.__h.stopRaf()');
    const l = pts[Math.min(sent, pts.length - 1)];
    const tUp = Date.now();
    send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
    await sleep(150);
    await js('window.__h.raf2()');
    const upMs = Date.now() - tUp;
    const bag = await readBag();
    const longs = await js('window.__h.takeLongs()');
    return {
      moves: sent,
      aborted,
      wallMs: Date.now() - t0,
      // Time between frames while the pen moves: the page is smooth when this stays at the screen's own frame time.
      frameDeltaMs: stats(deltas(raf)),
      latency: stats(bag.latency),
      overlayDrawMs: stats(bag.overlayMs),
      overlayLastThird: stats(bag.overlayMs.slice(-Math.max(1, Math.floor(bag.overlayMs.length / 3)))),
      mainDrawMsMax: bag.mainMs.length ? Math.round(Math.max(...bag.mainMs) * 100) / 100 : 0,
      liftToSettledMs: upMs,
      longTasks: longs.length,
      longTaskMaxMs: longs.length ? Math.round(Math.max(...longs.map((x) => x.d))) : 0,
      pageBusyAfterMs: Math.round(waited),
    };
  }

  const wavy = (box, n) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push([Math.round(box.x + box.w * (0.1 + 0.8 * t)), Math.round(box.y + box.h * (0.5 + 0.3 * Math.sin(t * Math.PI * 3)))]);
    }
    return pts;
  };

  // ------------------------------------------------------------------ vector
  async function vector() {
    const out = { canvas: [CW, CH] };
    await js(`localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
    await setDoc({ width: CW, height: CH, frames: 1, layers: 1, strokesPer: 0 });
    await js('window.__frameling.run("view.fit"); true');
    await js('window.__h.raf2()');
    const box = await canvasBox();
    const tips = await js(TIPS);
    const sizes = (process.env.BRUSH_VSIZES || `120,${Math.ceil(Math.max(CW, CH) * 1.1)},${Math.max(CW, CH) * 5}`).split(',').map(Number);
    const kinds = (process.env.BRUSH_TIPS || Object.keys(tips).join(',')).split(',');
    for (const kind of kinds) {
      out[kind] = {};
      for (const size of sizes) {
        await js(`(() => { const f = window.__frameling; const b = f.store().get().ui.brush; const tip = (${TIPS})[${JSON.stringify(kind)}]; const nb = { ...b, size: ${size}, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }; delete nb.tip; if (tip) nb.tip = tip; f.store().setUi({ tool: 'brush', brush: nb }); return true; })()`);
        await sleep(100);
        process.stdout.write(`  ${kind} ${size}... `);
        const r = await oneStroke(wavy(box, EVENTS));
        console.log(`median overlay ${r.overlayDrawMs.p50 ?? '-'} ms, max ${r.overlayDrawMs.max ?? '-'} ms${r.aborted ? ' (stopped early)' : ''}`);
        out[kind][size] = r;
        // Back to an empty page, so every stroke starts from the same place.
        await js(`window.__frameling.store().load(window.__h.mkDoc({ width: ${CW}, height: ${CH}, frames: 1, layers: 1, strokesPer: 0 })); window.__frameling.store().setUi({ tool: 'brush' }); window.__frameling.run("view.fit"); true`);
        await js('window.__h.raf2()');
        await sleep(150);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ pixel
  async function pixel() {
    const out = {};
    const PS = Number(process.env.BRUSH_PIXELCANVAS || 2000);
    const sizes = (process.env.BRUSH_PSIZES || `24,200,${Math.ceil(PS * 1.1)}`).split(',').map(Number);
    await js(`localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
    for (const shape of ['square', 'round']) {
      out[shape] = {};
      for (const size of sizes) {
        await js(`(() => {
          const F = window.__frameling;
          const doc = window.__h.mkDoc({ width: ${PS}, height: ${PS}, frames: 1, layers: 1, strokesPer: 0 });
          const layer = doc.layers[0];
          layer.kind = 'pixel'; layer.pixelSize = 1;
          const dr = { id: 'px-full', kind: 'pixel', width: ${PS}, height: ${PS}, pixels: new Uint8ClampedArray(${PS} * ${PS} * 4) };
          doc.drawings = { [dr.id]: dr };
          layer.cels = [{ id: 'cel-full', start: 0, length: 1, drawingId: dr.id }];
          F.store().load(doc);
          F.store().setUi({ tool: 'brush', activeLayerId: layer.id, frame: 0, color: '#d6204a' });
          F.run('view.fit');
          return true;
        })()`);
        await js('window.__h.raf2()');
        await sleep(300);
        const box = await canvasBox();
        // The tool settings live in the page's module state: set them through the settings the pixel bar uses.
        await js(`window.__frameling.toolSettings.set({ pixelBrushSize: ${size}, pixelBrushShape: ${JSON.stringify(shape)}, pixelPerfect: false }); true`);
        process.stdout.write(`  pixel ${shape} ${size}... `);
        // Hover first: the footprint outline is drawn on every move even with no button down.
        await js('window.__framelingPerf.reset()');
        for (let i = 0; i < 20; i++) {
          send({ type: 'mouseMove', x: Math.round(box.x + box.w * (0.3 + i * 0.01)), y: Math.round(box.y + box.h * 0.5) });
          await sleep(16);
        }
        await sleep(100);
        const hover = await readBag();
        const r = await oneStroke(wavy(box, EVENTS));
        r.hoverOverlayMs = stats(hover.overlayMs);
        console.log(`median latency ${r.latency.p50 ?? '-'} ms, max ${r.latency.max ?? '-'} ms; hover overlay median ${r.hoverOverlayMs.p50 ?? '-'} ms${r.aborted ? ' (stopped early)' : ''}`);
        out[shape][size] = r;
      }
    }
    return out;
  }

  const tests = { vector, pixel };
  await load();
  results.env = {
    label,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    cpu: os.cpus()[0]?.model,
    gpuRun,
    window: [WIN_W, WIN_H],
    events: EVENTS,
    renderer: rendererDir,
    when: new Date().toISOString(),
  };
  for (const [name, fn] of Object.entries(tests)) {
    if (only && !only.includes(name)) continue;
    console.log(name);
    try {
      await load();
      results[name] = await fn();
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
