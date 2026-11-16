// What snapping the pen, pencil and brush costs while you draw, on a drawing with many strokes. Real app, real mouse events.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/snapdraw.cjs [--out file.json] [--label after]
//   PERF_RENDERER=/some/renderer PERF_DIST=/some/dist for another build (the before).
//
// For each drawing size it draws one long wiggle with the brush, with the options set three ways, and prints how long each
// pointer event took to show (event to overlay draw), plus the first event of a stroke on its own (that is where the index of
// stroke ends is built) and the first event of a second stroke (the drawing just changed, so it is rebuilt).
//   off      Snapping master switch off.
//   draw-off Snapping on, but the pen, pencil and brush ticked off (the usual before-state of those tools).
//   on       The new usual: start and end of a stroke pulled onto line ends, guides, grid, page.
const { app } = require('electron');
const { startRealApp } = require('./realapp.cjs');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const outFile = opt('out', null);
const label = opt('label', 'run');
const rendererDir = process.env.PERF_RENDERER || path.join(__dirname, '../../dist/renderer');
const WIN_W = 1400;
const WIN_H = 900;
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
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


const MODES = {
  off: { snap: false },
  'draw-off': { snap: true, snapDraw: false },
  on: { snap: true, snapDraw: true },
};

async function main() {
  const win = await startRealApp({ rendererDir, onScreen: process.env.PERF_SHOW === '1', width: WIN_W, height: WIN_H });
  const gpuRun = await gpuMod.confirmOrExit(win);
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code);
  const send = (e) => wc.sendInputEvent(e);

  async function load(mode) {
    await js(`localStorage.setItem('frameling.view', JSON.stringify(${JSON.stringify(MODES[mode])}))`);
    await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1', perf: '1' } });
    win.showInactive();
    await js(`new Promise((res) => { const t = Date.now(); const w = () => (window.__frameling ? requestAnimationFrame(() => requestAnimationFrame(res)) : Date.now() - t < 10000 ? setTimeout(w, 5) : res()); w(); })`);
    await sleep(900);
    await js(PRELUDE);
    await js(`(() => { const f = window.__frameling; f.store().load(window.__h.mkDoc({ strokesPer: 0, frames: 1 })); f.store().setUi({ tool: 'brush' }); })()`);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      send({ type: 'keyDown', keyCode: 'Escape' });
      send({ type: 'keyUp', keyCode: 'Escape' });
      await sleep(150);
    }
  }
  async function setDoc(spec) {
    await js(`(() => { const f = window.__frameling; f.store().load(window.__h.mkDoc(${JSON.stringify(spec)})); f.store().setUi({ tool: 'brush', playing: false, frame: 0 }); window.__framelingPerf.reset(); })()`);
    await js('window.__h.raf2()');
    await sleep(200);
  }
  const canvasBox = () => js(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  function wiggle(box, n, margin = 40, phase = 0) {
    const pts = [];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const rx = box.w / 2 - margin, ry = box.h / 2 - margin;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = t * Math.PI * 2 * 5 + phase;
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
  const latency = () => js('window.__framelingPerf.latency.slice()');

  const results = {};
  for (const mode of Object.keys(MODES)) {
    await load(mode);
    results[mode] = {};
    for (const n of [300, 3000, 20000]) {
      await setDoc({ frames: 1, layers: 1, strokesPer: n, pts: 12 });
      const box = await canvasBox();
      // First stroke: the first event has to build whatever is built per drawing.
      await js('window.__framelingPerf.reset()');
      await strokeThrough(wiggle(box, 1200));
      await sleep(250);
      const a = await latency();
      // Second stroke straight after: the drawing changed, so the index is rebuilt for it.
      await js('window.__framelingPerf.reset()');
      await strokeThrough(wiggle(box, 1200, 60, 0.7));
      await sleep(250);
      const b = await latency();
      results[mode]['strokes' + n] = { first: { firstEvents: a.slice(0, 3).map((x) => Math.round(x * 100) / 100), rest: stats(a.slice(3)) }, second: { firstEvents: b.slice(0, 3).map((x) => Math.round(x * 100) / 100), rest: stats(b.slice(3)) } };
      console.log(mode, n, JSON.stringify(results[mode]['strokes' + n]));
    }
  }
  const out = { label, gpuRun, results };
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  else console.log(JSON.stringify(out, null, 2));
  app.exit(0);
}
main().catch((e) => { console.error(e); app.exit(1); });
