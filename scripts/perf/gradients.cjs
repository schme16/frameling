// Gradients on a busy canvas: what many angular or diamond shapes cost, next to the same scene in radial gradients.
// A canvas draws linear and radial gradients itself, and angular where the browser has createConicGradient; a diamond has no
// canvas gradient, so src/core/gradient.ts paints it from pieces on spare canvases the size of the whole canvas. This
// measures the case that would hurt: a big canvas with many shapes, repainted every frame.
//
//   npm run build
//   __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia xvfb-run -a -s "-screen 0 1600x1000x24" \
//     npx electron scripts/perf/gradients.cjs --out scripts/perf/results/gradients-<name>.json [--only render,live] [--reps 7] [--quick]
//
// render: the single renderer (what an export or a frame grab uses) drawing one frame, `reps` times, taking the minimum
//         (the least disturbed run; see the perf skill). Grid: canvas size x shape count x paint (solid, linear, radial,
//         angular, diamond, diamond line). Every shape is about a tenth of the canvas wide, so a diamond's cost is the
//         spare canvas, not the shape.
// live:   playback in the real app where every frame is a different drawing full of such shapes, so no bitmap is reused:
//         the time the app spends painting a frame, against the 41.7 ms a frame has at 24 fps.
// Judge by the ratio to radial in the same run, not the milliseconds: other work on the machine moves them together.
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
const only = opt('only', '') ? opt('only', '').split(',') : null;
const reps = Number(opt('reps', 7));
const quick = args.includes('--quick');
const rendererDir = process.env.PERF_RENDERER || path.join(__dirname, '../../dist/renderer');

app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const gpuMod = require('../lib/gpu.cjs');
gpuMod.use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
function stats(xs) {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: r2(s[0]), p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s[s.length - 1]) };
}

// Runs inside the page: a document of `shapes` small shapes, each painted one way, on a width x height canvas.
const PRELUDE = `
window.__g = (() => {
  const prng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let idn = 0;
  const id = (p) => p + '-' + ++idn;
  const STOPS = [{ at: 0, color: '#ff6f91' }, { at: 0.5, color: '#ffc94a' }, { at: 1, color: '#5ab8ff' }];
  // paint: solid | linear | radial | angular | diamond | diamondline (a diamond outline round a solid fill)
  function shape(r, w, h, paint) {
    const size = Math.max(40, Math.round(w / 10));
    const x = r() * (w - size), y = r() * (h - size);
    const cx = x + size / 2, cy = y + size / 2;
    // a rounded blob: eight curved points round the middle
    const pts = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = (size / 2) * (0.75 + 0.25 * r());
      pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
    }
    const paths = [{ points: pts, closed: true }];
    const grad = (kind) => ({ kind, stops: STOPS, from: { x: cx, y: cy }, to: { x: cx + size / 2, y: cy } });
    if (paint === 'diamondline') {
      return { id: id('sh'), type: 'path', paths, fill: '#ffffff', stroke: { color: '#000000', width: 6, join: 'round', cap: 'round' }, strokeGradient: grad('diamond'), opacity: 1 };
    }
    const s = { id: id('sh'), type: 'fill', paths, color: '#ff6f91', opacity: 1 };
    if (paint !== 'solid') s.gradient = grad(paint);
    return s;
  }
  function mkDoc({ width, height, shapes, paint, frames = 1, seed = 5, fps = 24 }) {
    const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'gradients', width, height, fps, length: frames, background: '#ffffff', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
    const layer = { id: id('l'), name: 'L0', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
    const r = prng(seed);
    for (let f = 0; f < frames; f++) {
      const d = { id: id('dr'), kind: 'vector', shapes: [] };
      for (let s = 0; s < shapes; s++) d.shapes.push(shape(r, width, height, paint));
      doc.drawings[d.id] = d;
      layer.cels.push({ id: id('c'), start: f, length: 1, drawingId: d.id });
    }
    doc.layers.push(layer);
    return doc;
  }
  let rafs = null;
  const startRaf = () => { const ts = []; const loop = (t) => { ts.push(t); rafs.id = requestAnimationFrame(loop); }; rafs = { ts, id: requestAnimationFrame(loop) }; };
  const stopRaf = () => { cancelAnimationFrame(rafs.id); const o = rafs.ts; rafs = null; return o; };
  const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { mkDoc, raf2, startRaf, stopRaf };
})();
true;
`;

async function main() {
  const win = await startRealApp({ rendererDir, onScreen: process.env.PERF_SHOW === '1', hidden: false, width: 1400, height: 900 });
  const gpuRun = await gpuMod.confirmOrExit(win);
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code);
  const errors = [];
  wc.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1', perf: '1' } });
  win.showInactive();
  await js(`new Promise((res) => { const t = Date.now(); const w = () => (window.__frameling && window.__framelingEffects ? requestAnimationFrame(() => requestAnimationFrame(res)) : Date.now() - t < 10000 ? setTimeout(w, 5) : res()); w(); })`);
  await sleep(900);
  await js(PRELUDE);

  const results = { env: {}, render: null, live: null };
  const loadAvg = os.loadavg();

  async function render() {
    const sizes = quick ? [[1920, 1080]] : [[1280, 720], [1920, 1080], [3840, 2160]];
    const counts = quick ? [10, 50] : [1, 10, 50, 200];
    const paints = ['solid', 'linear', 'radial', 'angular', 'diamond', 'diamondline'];
    const rows = [];
    for (const [w, h] of sizes) {
      for (const shapes of counts) {
        const row = { canvas: `${w}x${h}`, shapes };
        for (const paint of paints) {
          const spec = { width: w, height: h, shapes, paint };
          const ms = [];
          for (let k = 0; k < reps; k++) ms.push(await js(`window.__framelingEffects.renderMs(window.__g.mkDoc(${JSON.stringify(spec)}), 0, ${shapes >= 200 ? 2 : 4})`));
          row[paint] = stats(ms);
        }
        for (const p of ['linear', 'angular', 'diamond', 'diamondline']) row[p + 'VsRadial'] = r2(row[p].min / row.radial.min);
        rows.push(row);
        process.stdout.write(`  ${row.canvas} x ${shapes}: radial ${row.radial.min} ms, angular ${row.angular.min}, diamond ${row.diamond.min}, diamond line ${row.diamondline.min}\n`);
      }
    }
    return rows;
  }

  // Playback in the real app with a different drawing on every frame, so nothing painted is reused.
  async function live() {
    const rows = [];
    const cases = quick ? [{ w: 1920, h: 1080, shapes: 50 }] : [{ w: 1920, h: 1080, shapes: 20 }, { w: 1920, h: 1080, shapes: 100 }, { w: 1920, h: 1080, shapes: 250 }, { w: 3840, h: 2160, shapes: 50 }, { w: 3840, h: 2160, shapes: 200 }];
    for (const c of cases) {
      const row = { canvas: `${c.w}x${c.h}`, shapes: c.shapes };
      for (const paint of ['radial', 'angular', 'diamond']) {
        const spec = { width: c.w, height: c.h, shapes: c.shapes, paint, frames: 96 };
        await js(`(() => { const f = window.__frameling; f.store().load(window.__g.mkDoc(${JSON.stringify(spec)})); f.store().setUi({ tool: 'brush', playing: false, frame: 0 }); window.__framelingPerf.reset(); })()`);
        await js('window.__g.raf2()');
        await sleep(300);
        await js('window.__framelingPerf.reset(); window.__g.startRaf()');
        await js(`window.__frameling.run('timeline.play')`);
        await sleep(3800);
        await js(`window.__frameling.run('timeline.play')`);
        const raf = await js('window.__g.stopRaf()');
        const bag = await js(`(() => { const b = window.__framelingPerf; return { mainMs: b.mainMs, painted: b.painted, build: b.build }; })()`);
        const painted = bag.painted;
        const skipped = painted.slice(1).reduce((n, p, i) => n + Math.max(0, p.frame - painted[i].frame - 1), 0);
        const dt = raf.slice(1).map((t, i) => t - raf[i]);
        row[paint] = {
          framesPainted: painted.length,
          framesSkipped: skipped,
          paintMs: stats(bag.mainMs),
          // what building one drawing's picture costs the main thread (paint recording only: a card finishes the rest on its own)
          buildPaintMsEach: bag.build.n ? r2(bag.build.paint / bag.build.n) : null,
          builds: bag.build.n,
          rafDeltaMs: stats(dt),
          lateFrames: dt.filter((d) => d > 1000 / 60 * 2.5).length,
        };
      }
      rows.push(row);
      process.stdout.write(`  live ${row.canvas} x ${row.shapes}: build each radial ${row.radial.buildPaintMsEach} ms, angular ${row.angular.buildPaintMsEach}, diamond ${row.diamond.buildPaintMsEach}; late frames ${row.radial.lateFrames}/${row.angular.lateFrames}/${row.diamond.lateFrames}; skipped ${row.radial.framesSkipped}/${row.angular.framesSkipped}/${row.diamond.framesSkipped}\n`);
    }
    return rows;
  }

  const feat = app.getGPUFeatureStatus();
  results.env = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    loadAvgBefore: loadAvg.map((v) => r2(v)),
    gpuRun,
    gpuFeatures: { canvas: feat['2d_canvas'], oop: feat.canvas_oop_rasterization },
    conicGradient: await js(`typeof CanvasRenderingContext2D.prototype.createConicGradient`),
    reps,
    quick,
    when: new Date().toISOString(),
  };
  for (const [name, fn] of Object.entries({ render, live })) {
    if (only && !only.includes(name)) continue;
    process.stdout.write(`${name}...\n`);
    try {
      results[name] = await fn();
    } catch (e) {
      results[name] = { error: String(e && e.stack ? e.stack : e) };
      console.log('FAILED ' + e);
    }
  }
  results.env.loadAvgAfter = os.loadavg().map((v) => r2(v));
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
