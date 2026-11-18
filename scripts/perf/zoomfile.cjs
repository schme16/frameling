// Zooming a real drawing: wheel notches and a pinch, in and out, frame times for each.
// Same set-up as run.cjs (real input events, real GPU canvas, numbers out as JSON). Run it inside xvfb after a build:
//
//   __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia xvfb-run -a -s "-screen 0 1600x1000x24" \
//     npx electron scripts/perf/zoomfile.cjs --out scripts/perf/results/zoomfile-after.json [--label after]
//
// ZOOM_DOC=/path/to/file.frameling measures that file (read where it is, never copied). Without it the harness builds a
// stand-in that has what made a real file lag: a 1920x1080 page of long brush strokes with the slow tips (bristle,
// watercolour, nib) and paper tooth on half of them. ZOOM_ONLY=notch,pinch picks the gestures. PERF_RENDERER points at another
// renderer build so the same run can measure development (before) and this branch (after). PERF_SHOW=1 shows the window.
// ZOOM_TOOTH_BUDGET=<pixels> shrinks the paper tooth picture cache (--check uses 3000000, which stands in for a drawing with
// more lines than the cache holds, where a catch-up that leans on the cache never finishes).
// ZOOM_CLIP=1 runs the gesture to film (wheel in, a hold, wheel out: about ten seconds); ZOOM_CLIP=stop3x zooms in to about 3x and holds.
// ZOOM_DPR=2 runs at that screen scaling; ZOOM_THROTTLE=4 makes the page's JavaScript that many times slower, as a busy or slow
// machine does.
// --check makes the run fail when zooming lags. It judges the time the page spends drawing a frame (main thread draw ms) and
// long tasks, not the raw frame gap, because the frame gap also grows when other programs are using the machine and the check
// must not cry wolf then: a gesture's draw p95 over ZOOM_DRAW_P95_MS (25) or worst over ZOOM_DRAW_MAX_MS (100), more than 2 long
// tasks in it; after the zoom stops the sharp picture must land within ZOOM_SHARP_MS (3000), with no draw over ZOOM_SETTLE_DRAW_MS
// (200), and then nothing owed and no drawing at all while idle. The limits are multiplied by how slow the page's JavaScript
// measures right now (a fixed calculation timed at the start against a quiet machine, 1 to 8 times), so a busy machine or a
// throttle does not fail it. It runs on the stand-in.
const { app } = require('electron');
const { startRealApp } = require('./realapp.cjs');
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
const only = (process.env.ZOOM_ONLY || '').split(',').filter(Boolean);
const doc = process.env.ZOOM_DOC || '';
const check = args.includes('--check');
// The calibration piece takes this long on a quiet machine here (set by running it with nothing else going).
const CAL_REF_MS = 6.8;
const num = (k, d) => Number(process.env[k] || d);
const lim0 = { drawP95: num('ZOOM_DRAW_P95_MS', 50), drawMax: num('ZOOM_DRAW_MAX_MS', 120), longTasks: 3, sharp: num('ZOOM_SHARP_MS', 3000), settleDraw: num('ZOOM_SETTLE_DRAW_MS', 200) };
if (process.env.ZOOM_DPR) require('electron').app.commandLine.appendSwitch('force-device-scale-factor', process.env.ZOOM_DPR);
const rendererDir = process.env.PERF_RENDERER || path.join(__dirname, '../../dist/renderer');
const WIN_W = 1400;
const WIN_H = 900;

const gpuMod = require('../lib/gpu.cjs');
gpuMod.use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
function stats(xs) {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: r2(s.reduce((a, b) => a + b, 0) / s.length), p50: r2(q(0.5)), p95: r2(q(0.95)), p99: r2(q(0.99)), max: r2(s[s.length - 1]) };
}

// ZOOM_PROFILE=1 prints a CPU profile of each gesture: the top functions by self and inclusive time (build the renderer
// with --minify false first, or the names are mangled).
function analyse(prof) {
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = prof.timeDeltas;
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) self.set(prof.samples[i], (self.get(prof.samples[i]) || 0) + (dt[i] || 0));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const bySelf = new Map();
  const byIncl = new Map();
  for (const [id, t] of self) {
    const n = nodes.get(id);
    bySelf.set(key(n), (bySelf.get(key(n)) || 0) + t);
    const seen = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) {
      const k = key(nodes.get(c));
      if (seen.has(k)) continue;
      seen.add(k);
      byIncl.set(k, (byIncl.get(k) || 0) + t);
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)} ms  ${k}`).join('\n');
  console.log('--- self time\n' + top(bySelf, 18) + '\n--- inclusive time\n' + top(byIncl, 30));
}

// Runs inside the page: frame timestamps, long tasks, and a stand-in document.
const PRELUDE = `
window.__z = (() => {
  const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let n = 0;
  const id = (p) => p + '-' + ++n;
  const TIPS = [
    { size: 20, thinning: 0.6, smoothing: 0.3, streamline: 0.25, tip: { kind: 'nib', nibAngle: 40, roundness: 0.3, angle: 'upright' } },
    { size: 60, thinning: 0, smoothing: 0.65, streamline: 0.65, tip: { kind: 'watercolour', amount: 0.25 } },
    { size: 24, thinning: 0.5, smoothing: 0.7, streamline: 0.7, tip: { kind: 'bristle', amount: 0.25, count: 14, stiffness: 0.6, seed: 7 } },
    { size: 5, thinning: 0.5, smoothing: 0.7, streamline: 0.7, tip: { kind: 'bristle', amount: 0.25, count: 14, stiffness: 0.6, seed: 9 } },
  ];
  function mkDoc(strokes, ptsPer) {
    const r = prng(11);
    const shapes = [];
    for (let s = 0; s < strokes; s++) {
      const t = TIPS[s % TIPS.length];
      let x = 200 + r() * 1500, y = 150 + r() * 780, a = r() * 6.28;
      const points = [];
      for (let i = 0; i < ptsPer; i++) {
        points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: 0.5 });
        a += (r() - 0.5) * 0.8; const step = 4 + r() * 8;
        x = Math.min(1880, Math.max(40, x + Math.cos(a) * step)); y = Math.min(1040, Math.max(40, y + Math.sin(a) * step));
      }
      const sh = { id: id('sh'), type: 'stroke', points, color: ['#16186c', '#81c9ff', '#ffc94a', '#9b7bff'][s % 4], opacity: 1,
        brush: { ...t, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } };
      // Like the real file: about half the lines have paper tooth (chalk, charcoal), a few have an adjust and grain.
      if (s % 2 === 0) sh.effects = [{ id: id('fx'), kind: 'tooth', values: { press: 80, tooth: 100, edge: 30, soft: 42, cover: 98, streak: 35, paper: 3, grain: 1, seed: 40 + s } }];
      else if (s % 11 === 1) sh.effects = [{ id: id('fx'), kind: 'adjust', values: { hue: 0, saturation: 94, brightness: 109, contrast: 98 } }, { id: id('fx'), kind: 'grain', values: { amount: 5, size: 1, colour: 0, change: 0, seed: 100 + s } }];
      shapes.push(sh);
    }
    const did = id('d'), lid = id('l');
    return { format: 'frameling', version: 5, lineage: true, id: id('doc'), name: 'zoom stand-in', width: 1920, height: 1080, fps: 12, length: 1, animated: false, background: '#ffffff',
      layers: [{ id: lid, name: 'Layer 1', visible: true, locked: false, opacity: 1, kind: 'vector', cels: [{ id: id('c'), start: 0, length: 1, drawingId: did, autoHold: true }] }],
      drawings: { [did]: { id: did, kind: 'vector', shapes } }, clips: [], markers: [], swatches: [] };
  }
  let raf = null;
  const startRaf = () => { const ts = []; const loop = (t) => { ts.push({ t, z: window.__frameling.store().get().ui.zoom }); raf.id = requestAnimationFrame(loop); }; raf = { ts, id: requestAnimationFrame(loop) }; };
  const stopRaf = () => { cancelAnimationFrame(raf.id); const o = raf.ts; raf = null; return o; };
  let longs = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ t: e.startTime, d: e.duration }); }).observe({ entryTypes: ['longtask'] }); } catch {}
  const takeLongs = () => { const o = longs; longs = []; return o; };
  const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { mkDoc, startRaf, stopRaf, takeLongs, raf2 };
})(), 0;
`;

async function main() {
  const onScreen = process.env.PERF_SHOW === '1';
  const win = await startRealApp({ rendererDir, onScreen, hidden: false, width: WIN_W, height: WIN_H });
  const gpuRun = await gpuMod.confirmOrExit(win);
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  const js = (code) => wc.executeJavaScript(code).catch((e) => { throw new Error(String(e && e.message) + ' in: ' + code.slice(0, 120)); });
  const send = (e) => wc.sendInputEvent(e);

  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1', perf: '1' } });
  (onScreen ? win.show() : win.showInactive());
  await js(`new Promise((res) => { const t = Date.now(); const w = () => (window.__frameling ? requestAnimationFrame(() => requestAnimationFrame(res)) : Date.now() - t < 10000 ? setTimeout(w, 5) : res()); w(); })`);
  await sleep(900);
  await js(PRELUDE);
  if (Number(process.env.ZOOM_THROTTLE || 1) > 1) {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: Number(process.env.ZOOM_THROTTLE) });
  }

  // How slow is this page's JavaScript right now (a busy machine, a throttle)? A fixed piece of arithmetic, best of five, against
  // what it takes on a quiet machine, so the draw time limits of --check scale with it instead of crying wolf under load.
  const calMs = await js(`(() => { let best = 1e9; for (let r = 0; r < 5; r++) { const t = performance.now(); let a = 0; for (let i = 0; i < 4e6; i++) a += Math.sqrt(i) * 1.0001; if (a < 0) console.log(a); best = Math.min(best, performance.now() - t); } return best; })()`);
  const speed = Math.min(8, Math.max(1, calMs / CAL_REF_MS));
  await js(`(() => { const f = window.__frameling; f.store().load(window.__z.mkDoc(0, 2)); f.store().setUi({ tool: 'brush' }); return 0; })()`);
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    send({ type: 'keyDown', keyCode: 'Escape' });
    send({ type: 'keyUp', keyCode: 'Escape' });
    await sleep(150);
  }

  if (doc) {
    const ok = await js(`window.__framelingIo.openPath(${JSON.stringify(doc)})`);
    if (!ok) throw new Error('openPath said no for ' + doc);
  } else {
    await js(`(() => { const f = window.__frameling; f.store().load(window.__z.mkDoc(${Number(process.env.ZOOM_SHAPES ?? 56)}, 150)); return 0; })()`);
  }
  const toothBudget = process.env.ZOOM_TOOTH_BUDGET || (check ? '3000000' : '');
  if (toothBudget) await js(`window.__frameling.toothBudget && window.__frameling.toothBudget(${Number(toothBudget)}), 0`);
  await js(`window.__frameling.store().setUi({ tool: 'select', playing: false, frame: 0 }), 0`);
  await js(`void window.__frameling.run('view.fit')`);
  await js('window.__z.raf2()');
  await sleep(500);
  const box = await js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const cx = Math.round(box.x + box.w / 2);
  const cy = Math.round(box.y + box.h / 2);
  const counts = await js(`(() => { const d = window.__frameling.store().get().doc; const ds = Object.values(d.drawings); let shapes = 0, pts = 0; for (const x of ds) for (const s of x.shapes || []) { shapes++; pts += (s.points ? s.points.length : 0) / 1; } return { layers: d.layers.length, drawings: ds.length, shapes, points: pts, artboards: (d.artboards || []).length, width: d.width, height: d.height, ui: window.__frameling.store().get().ui.zoom, dpr: window.devicePixelRatio, canvas: (() => { const c = document.querySelector('.cv-root canvas'); return c ? c.width + 'x' + c.height : null; })() }; })()`);





  if (process.env.ZOOM_CLIP === 'stop3x') {
    // Stopping at about 3x: wheel in until the zoom passes 3, then hold while the sharp picture lands.
    await js(`window.__frameling.store().setUi({ tool: 'select' }), 0`);
    await sleep(800);
    console.log('CLIP_START');
    await sleep(700);
    for (let i = 0; i < 40 && (await js('window.__frameling.store().get().ui.zoom')) < 3; i++) {
      send({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 100, wheelTicksY: 1, modifiers: ['control'], canScroll: true });
      await sleep(110);
    }
    await sleep(4500);
    console.log('CLIP_END');
    win.destroy();
    app.exit(0);
    return;
  }
  if (process.env.ZOOM_CLIP === '1') {
    // A gesture to film (ffmpeg x11grab runs outside): in with the wheel, a hold while the sharp picture catches up, out again.
    await js(`window.__frameling.store().setUi({ tool: 'select' }), 0`);
    await sleep(800);
    console.log('CLIP_START');
    await sleep(700);
    const notches = async (n, dir, gap) => {
      for (let i = 0; i < n; i++) {
        send({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: dir * 100, wheelTicksY: dir, modifiers: ['control'], canScroll: true });
        await sleep(gap);
      }
    };
    await notches(22, 1, 110);
    await sleep(2200);
    await notches(22, -1, 110);
    await sleep(1500);
    win.destroy();
    app.exit(0);
    return;
  }
  if (process.env.ZOOM_HASH === '1') {
    // The settled picture at fixed views, as a hash of the main canvas, so before and after can be compared exactly.
    const views = [{ zoom: 1, panX: 0, panY: 0 }, { zoom: 3, panX: -700, panY: -300 }, { zoom: 8, panX: -2600, panY: -1200 }, { zoom: 24, panX: -9000, panY: -4000 }, { zoom: 0.5, panX: 0, panY: 0 }];
    const hashes = [];
    for (const v of views) {
      await js(`window.__frameling.store().setUi(${JSON.stringify(v)}), 0`);
      await sleep(3500);
      const img = await wc.capturePage({ x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) });
      const png = img.toPNG();
      if (process.env.ZOOM_HASH_DIR) { fs.mkdirSync(process.env.ZOOM_HASH_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.ZOOM_HASH_DIR, `view-${v.zoom}.png`), png); }
      hashes.push(v.zoom + ' ' + require('node:crypto').createHash('sha256').update(img.toBitmap()).digest('hex').slice(0, 12));
    }
    console.log('HASHES ' + JSON.stringify(hashes));
    win.destroy();
    app.exit(0);
    return;
  }
  if (process.env.ZOOM_DEBUG === '1') {
    await js(`window.__frameling.store().setUi({ zoom: 8 }), 0`);
    await js('window.__z.raf2()');
    console.log(JSON.stringify(await js(`(() => { const p = window.__framelingPerf.painter; const lp = p.lastParams; return { owed: p.owed, hasOverview: !!p.overview, zooming: lp && lp.zooming, live: !!(lp && lp.live), playing: lp && lp.playing, tile: lp && lp.tileMode, cam: !!(lp && lp.camera), pb: !!(lp && lp.pasteboard), rect: lp && lp.rect, w: lp && lp.width, h: lp && lp.height, proxyFor: p.proxyFor(lp) }; })()`)));
    win.destroy();
    app.exit(0);
    return;
  }
  if (process.env.ZOOM_PROBE === '1') {
    // Settled cost at fixed zooms: one set-zoom frame, then small pans (what a held view costs to repaint).
    for (const z of (process.env.ZOOM_AT || '1,2,4,8,16,32').split(',').map(Number)) {
      await js(`window.__frameling.store().setUi({ zoom: ${z} }), 0`);
      await js('window.__z.raf2()');
      await sleep(1200);
      await js('window.__framelingPerf.reset(), 0');
      if (process.env.ZOOM_PROFILE === '1') {
        if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
        await wc.debugger.sendCommand('Profiler.enable');
        await wc.debugger.sendCommand('Profiler.setSamplingInterval', { interval: 500 });
        await wc.debugger.sendCommand('Profiler.start');
      }
      for (let i = 0; i < 20; i++) {
        await js(`window.__frameling.store().setUi({ panX: window.__frameling.store().get().ui.panX - 3 }), 0`);
        await js('window.__z.raf2()');
      }
      if (process.env.ZOOM_PROFILE === '1') analyse((await wc.debugger.sendCommand('Profiler.stop')).profile);
      const mm = await js('window.__framelingPerf.mainMs');
      const st = await js('(() => { const b = window.__framelingPerf.painter; return b ? { builds: b.cache.builds } : null })()');
      console.log(`probe zoom ${z}: pan frame draw ms`, JSON.stringify(stats(mm)), JSON.stringify(st));
    }
    win.destroy();
    app.exit(0);
    return;
  }

  // A gesture is a list of [deltaY, wait ms]. Zoom out first so every run starts from the fitted page.
  const gestures = {
    // A mouse wheel: 100 a notch, one every 60 ms, 40 notches in then 40 out.
    notch: { ev: 80, dy: 100, gap: 60, in: 40 },
    // A trackpad pinch: small fractional steps about every 16 ms (60 a second), 180 in then 180 out.
    pinch: { ev: 360, dy: 8, gap: 16, in: 180 },
  };
  const results = {};
  for (const [name, g] of Object.entries(gestures)) {
    if (only.length && !only.includes(name)) continue;
    for (const rep of [0, 1]) {
      await js(`void window.__frameling.run('view.fit')`);
      await js('window.__z.raf2()');
      await sleep(600);
      let dbg = null;
      if (rep === 1 && process.env.ZOOM_PROFILE === '1') {
        dbg = wc.debugger;
        if (!dbg.isAttached()) dbg.attach('1.3');
        await dbg.sendCommand('Profiler.enable');
        await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 500 });
        await dbg.sendCommand('Profiler.start');
      }
      await js('window.__framelingPerf.reset(); window.__z.takeLongs(); window.__z.startRaf(); 0');
      const marks = [];
      for (let i = 0; i < g.ev; i++) {
        const dir = i < g.in ? 1 : -1;
        send({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: dir * (g.dy + (g.dy < 50 ? 0.37 : 0)), wheelTicksY: dir, modifiers: ['control'], canScroll: true });
        marks.push(Date.now());
        await sleep(g.gap);
      }
      await sleep(500);
      const raf = await js('window.__z.stopRaf()');
      if (dbg) { console.log('--- profile: ' + name); analyse((await dbg.sendCommand('Profiler.stop')).profile); }
      const longs = await js('window.__z.takeLongs()');
      const bag = await js(`(() => { const b = window.__framelingPerf; return { mainMs: b.mainMs, builds: b.painter ? b.painter.cache.builds : null }; })()`);
      const deltas = raf.slice(1).map((e, i) => e.t - raf[i].t);
      // Only the frames while the gesture ran (plus the tail where the sharp picture catches up).
      const during = deltas.slice(0, Math.max(1, Math.round((g.ev * g.gap) / 16.7)));
      const zs = raf.map((e) => e.z);
      if (rep === 1)
        results[name] = {
          rafDelta: stats(during),
          rafDeltaAll: stats(deltas),
          mainDrawMs: stats(bag.mainMs),
          slowDraws: bag.mainMs.map((m, i) => [i, r2(m)]).filter((x) => x[1] > 25),
          longTasks: longs.length,
          longTaskMaxMs: longs.reduce((m, l) => Math.max(m, l.d), 0),
          bitmapBuilds: bag.builds,
          zoomRange: [r2(Math.min(...zs)), r2(Math.max(...zs))],
          zoomTrace: raf.filter((_, i) => i % 15 === 0).map((e) => r2(e.z)),
          framesOver33: during.filter((d) => d > 33.4).length,
        };
    }
  }

  // Waits until the zoom has stopped changing (the wheel events a slow page was still working through are done). Returns the time (page clock) it last moved.
  const zoomStill = async () => {
    let last = await js('window.__frameling.store().get().ui.zoom');
    let at = await js('performance.now()');
    for (let i = 0; i < 400; i++) {
      await sleep(50);
      const z = await js('window.__frameling.store().get().ui.zoom');
      const now = await js('performance.now()');
      if (z !== last) { last = z; at = now; } else if (now - at > 500) break;
    }
    return at;
  };
  // Settling: zoom in to a depth and stop. Frames for the next three seconds, and when the sharp picture arrived.
  if (!only.length || only.includes('settle')) {
    for (const target of (process.env.ZOOM_STOPS || '1.5,3,8,24').split(',').map(Number)) {
      await zoomStill();
      await js(`void window.__frameling.run('view.fit')`);
      await js('window.__z.raf2()');
      await sleep(900);
      await js(`(window.__zs = { ts: [], sharpAt: 0, lastEv: 0 }), (() => { const loop = (t) => { const p = window.__framelingPerf.painter; window.__zs.ts.push({ t, owed: !!(p && (p.owed || p.catchingUp)), z: window.__frameling.store().get().ui.zoom }); window.__zs.id = requestAnimationFrame(loop); }; window.__zs.id = requestAnimationFrame(loop); })(), window.__z.takeLongs(), window.__framelingPerf.reset(), 0`);
      if (process.env.ZOOM_PROFILE === '1') {
        if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
        await wc.debugger.sendCommand('Profiler.enable');
        await wc.debugger.sendCommand('Profiler.setSamplingInterval', { interval: 300 });
        await wc.debugger.sendCommand('Profiler.start');
      }
      let guard = 0;
      while ((await js('window.__frameling.store().get().ui.zoom')) < target && guard++ < 200) {
        send({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 100, wheelTicksY: 1, modifiers: ['control'], canScroll: true });
        await sleep(60);
      }
      const stopped = await zoomStill();
      await sleep(3600);
      if (process.env.ZOOM_PROFILE === '1') { console.log('--- profile: settle ' + target); analyse((await wc.debugger.sendCommand('Profiler.stop')).profile); }
      const z = await js('(cancelAnimationFrame(window.__zs.id), window.__zs.ts)');
      const longs = await js('window.__z.takeLongs()');
      const after = z.filter((e) => e.t > stopped);
      const dl = after.slice(1).map((e, i) => e.t - after[i].t);
      // Sharp: the first frame after the stop, once the zoom has stopped moving for the settle delay, with nothing owed.
      const owedSeen = after.findIndex((e) => e.owed);
      const sharp = owedSeen < 0 ? null : after.slice(owedSeen).find((e, i, a) => !e.owed && i > 0);
      if (process.env.ZOOM_TRACE) console.log('TRACE', JSON.stringify(after.map((e) => [Math.round(e.t - stopped), e.owed ? 1 : 0, +e.z.toFixed(2)]).filter((_, i) => i % 3 === 0)), JSON.stringify(await js('(() => { const p = window.__framelingPerf.painter; const lp = p.lastParams; return { w: lp.width, h: lp.height, rect: lp.rect, cacheable: p.isCacheable(lp.rect, lp.width, lp.height), slow: p.hasSlowLook(lp), zooming: lp.zooming }; })()')));
      const bagS = await js('({ mainMs: window.__framelingPerf.mainMs, painted: window.__framelingPerf.painted.map((x) => x.t) })');
      const idleFrom = sharp ? sharp.t + 300 : owedSeen < 0 ? stopped + 1000 : Infinity;
      const owedAtEnd = after.length ? after[after.length - 1].owed : null;
      results['settle' + target] = {
        sharpOk: owedSeen < 0 ? true : !!sharp,
        idleDraws: bagS.painted.filter((t) => t > idleFrom).length,
        idleOwedFrames: after.filter((e) => e.t > idleFrom && e.owed).length,
        owedAtEnd,
        drawMs: stats(bagS.mainMs), reachedZoom: r2(after[0]?.z ?? 0), frameMs: stats(dl), longTasks: longs.filter((l) => l.t > stopped).length, longTaskMaxMs: longs.filter((l) => l.t > stopped).reduce((m, l) => Math.max(m, l.d), 0), owedAll: z.filter((e) => e.owed).length, framesAll: z.length, owedFrames: after.filter((e) => e.owed).length, lastOwedAt: Math.round((after.filter((e) => e.owed).pop()?.t ?? stopped) - stopped), slow: dl.map((d, i) => [i, Math.round(d)]).filter((x) => x[1] > 33), sharpAfterMs: sharp ? Math.round(sharp.t - stopped) : null, framesOver33: dl.filter((d) => d > 33.4).length };
    }
  }
  const out = { env: { label, electron: process.versions.electron, cpu: os.cpus()[0]?.model, gpuRun, renderer: rendererDir, doc: doc ? path.basename(doc) : 'stand-in', when: new Date().toISOString() }, counts, speed, calMs, results, consoleErrors: errors.slice(0, 10) };
  const json = JSON.stringify(out, null, 2);
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, json);
    console.log('wrote ' + outFile);
  }
  console.log(JSON.stringify(counts));
  for (const [k, v] of Object.entries(results)) if (k.startsWith('settle')) console.log(`${k.padEnd(9)} reached ${v.reachedZoom}  frame ms p50 ${v.frameMs.p50} p95 ${v.frameMs.p95} max ${v.frameMs.max}  | long tasks ${v.longTasks} (max ${Math.round(v.longTaskMaxMs)}) | >33ms ${v.framesOver33}/${v.frameMs.n} | draw ms max ${v.drawMs.max} | sharp after ${v.sharpAfterMs} ms | idle draws ${v.idleDraws} idle owed ${v.idleOwedFrames} | owed all ${v.owedAll}/${v.framesAll} owed after ${v.owedFrames} last at ${v.lastOwedAt} ms | slow ${JSON.stringify(v.slow)}`); else console.log(`${k.padEnd(6)} frame ms p50 ${v.rafDelta.p50}  p95 ${v.rafDelta.p95}  max ${v.rafDelta.max}  | draw ms p50 ${v.mainDrawMs.p50 ?? '-'} max ${v.mainDrawMs.max ?? '-'} | long tasks ${v.longTasks} (max ${Math.round(v.longTaskMaxMs)}) | >33ms frames ${v.framesOver33}/${v.rafDelta.n} | zoom ${v.zoomRange}`);
  let failed = false;
  // Draw times scale with how slow the page's JavaScript is right now (speed 1 = quiet); the sharp picture gets longer too.
  const lim = { ...lim0, drawP95: lim0.drawP95 * speed, drawMax: lim0.drawMax * speed, settleDraw: lim0.settleDraw * speed, sharp: lim0.sharp * speed, longTasks: lim0.longTasks + Math.round(speed) * 2 };
  console.log(`js speed factor ${speed.toFixed(2)} (calibration ${calMs.toFixed(1)} ms, quiet ${CAL_REF_MS} ms)`);
  const bad = (m) => { console.error('OVER BUDGET: ' + m); failed = true; };
  if (check) {
    for (const [k, v] of Object.entries(results)) {
      if (k.startsWith('settle')) {
        if (!v.sharpOk) bad(`${k}: the sharp picture never landed (owed at the end: ${v.owedAtEnd})`);
        else if (v.sharpAfterMs !== null && v.sharpAfterMs > lim.sharp) bad(`${k}: sharp picture landed after ${v.sharpAfterMs} ms > ${lim.sharp}`);
        if (v.owedAtEnd) bad(`${k}: still owed at the end`);
        if (v.idleDraws) bad(`${k}: ${v.idleDraws} draws while idle after it was sharp`);
        if (v.idleOwedFrames) bad(`${k}: owed on ${v.idleOwedFrames} idle frames`);
        if (v.drawMs.max > lim.settleDraw) bad(`${k}: slowest draw ${v.drawMs.max} ms > ${lim.settleDraw}`);
      } else {
        if (v.mainDrawMs.p95 > lim.drawP95) bad(`${k}: draw p95 ${v.mainDrawMs.p95} ms > ${lim.drawP95}`);
        if (v.mainDrawMs.max > lim.drawMax) bad(`${k}: slowest draw ${v.mainDrawMs.max} ms > ${lim.drawMax}`);
        if (v.longTasks > lim.longTasks) bad(`${k}: ${v.longTasks} long tasks`);
      }
    }
  }
  console.log(failed ? 'ZOOM CHECK FAILED' : check ? 'zoom check passed' : 'done');
  win.destroy();
  app.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  app.exit(1);
});
