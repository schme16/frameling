// Cost of paper tooth on chalk and charcoal lines (vector-charcoal). Draws the same busy page three ways: plain lines, the older
// grain made of tiny shapes, and paper tooth, at several line counts, cold (every line worked out) and warm (held drawing).
//
//   npm run build
//   __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/tooth.cjs --out scripts/perf/results/tooth.json
const { app } = require('electron');
const { startRealApp } = require('./realapp.cjs');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const gpuMod = require('../lib/gpu.cjs');
gpuMod.use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const PAGE = `
window.__t = (() => {
  const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const BRUSH = { size: 22, thinning: 0.4, smoothing: 0.4, streamline: 0.4, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
  const TIPS = { plain: undefined, holes: { kind: 'charcoal', amount: 0.75, grain: 1.2 }, tooth: { kind: 'charcoal', amount: 0.75, grain: 1, dry: 'compressed-charcoal' } };
  function mk(mode, n, w = 1280, h = 720) {
    const r = prng(11);
    const shapes = [];
    for (let s = 0; s < n; s++) {
      let x = r() * w, y = r() * h, a = r() * 6.28;
      const points = [];
      for (let i = 0; i < 40; i++) { points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: 0.3 + 0.5 * r() }); a += (r() - 0.5) * 0.5; x = Math.min(w - 2, Math.max(2, x + Math.cos(a) * 7)); y = Math.min(h - 2, Math.max(2, y + Math.sin(a) * 7)); }
      const sh = { id: 's' + s, type: 'stroke', points, brush: { ...BRUSH, ...(TIPS[mode] ? { tip: TIPS[mode] } : {}) }, color: '#1d1b26', opacity: 1 };
      if (mode === 'tooth') sh.effects = [{ id: 'e' + s, kind: 'tooth', values: { press: 80, tooth: 100, edge: 30, soft: 42, cover: 98, streak: 35, paper: 2, grain: 1, seed: s } }];
      shapes.push(sh);
    }
    const d = { id: 'd1', kind: 'vector', shapes };
    return { format: 'frameling', version: 1, lineage: true, id: 'doc', name: 'perf', width: w, height: h, fps: 24, length: 1, background: '#ffffff', layers: [{ id: 'l1', name: 'L', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 1, drawingId: 'd1' }] }], drawings: { d1: d }, clips: [], markers: [], swatches: [] };
  }
  return { mk };
})(); true;`;

(async () => {
  const win = await startRealApp({ rendererDir: path.join(__dirname, '../../dist/renderer'), onScreen: process.env.PERF_SHOW === '1', width: 1400, height: 900 });
  const gpuRun = await gpuMod.confirmOrExit(win);
  const wc = win.webContents;
  const js = (c) => wc.executeJavaScript(c);
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  win.showInactive();
  await js(`new Promise((res) => { const w = () => (window.__framelingEffects ? res() : setTimeout(w, 20)); w(); })`);
  await new Promise((r) => setTimeout(r, 1200));
  await js(PAGE);
  const out = { gpuRun, results: [] };
  for (const n of [50, 150, 400]) {
    for (const scale of [1, 2]) {
      const row = { strokes: n, scale };
      for (const mode of ['plain', 'holes', 'tooth']) {
        const doc = await js(`JSON.stringify(window.__t.mk(${JSON.stringify(mode)}, ${n}))`);
        const cold = await js(`(() => { const d = JSON.parse(${JSON.stringify(doc)}); return window.__framelingEffects.renderMs(d, 0, 3, ${scale}, true); })()`);
        const warm = await js(`(() => { const d = JSON.parse(${JSON.stringify(doc)}); window.__framelingEffects.renderMs(d, 0, 1, ${scale}); return window.__framelingEffects.renderMs(d, 0, 5, ${scale}); })()`);
        row[mode] = { coldMs: Math.round(cold * 10) / 10, warmMs: Math.round(warm * 10) / 10 };
      }
      out.results.push(row);
      console.log(JSON.stringify(row));
    }
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  app.exit(0);
})().catch((e) => { console.error(e); app.exit(1); });
