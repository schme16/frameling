// Takes the colours of a big picture and measures how long the page is blocked meanwhile.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/palettepic.cjs [--kind jpeg|png] [--size 4000x3000] [--max 32] [--out file.json]
//
// The picture is made in the page (a photo-like scene with noise, so it has millions of colours). A 4 ms heartbeat and
// the long task observer run from the moment the command opens the dialog until the palette is in. The numbers are the
// longest single block of the page's main thread, and the time each step took. PERF_RENDERER points at another build.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const kind = opt('kind', 'jpeg');
const [W, H] = opt('size', '4000x3000').split('x').map(Number);
const max = Number(opt('max', '0'));
const outFile = opt('out', null);
const rendererDir = process.env.PERF_RENDERER || path.join(__dirname, '../../dist/renderer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
require('../lib/gpu.cjs').use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');

const MAKE = `(async () => {
  const W = ${W}, H = ${H};
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a5db0'); sky.addColorStop(0.55, '#e9b27a'); sky.addColorStop(0.56, '#3d6b3a'); sky.addColorStop(1, '#16301a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  let s = 12345; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 400;
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = 'rgba(' + ((r() * 255) | 0) + ',' + ((r() * 255) | 0) + ',' + ((r() * 255) | 0) + ',';
    rg.addColorStop(0, col + '0.55)'); rg.addColorStop(1, col + '0)');
    g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const n = new OffscreenCanvas(512, 512); const ng = n.getContext('2d'); const id = ng.createImageData(512, 512);
  for (let i = 0; i < id.data.length; i += 4) { const v = (r() * 255) | 0; id.data[i] = v; id.data[i + 1] = (v * 0.9 + r() * 25) | 0; id.data[i + 2] = (v * 0.8 + r() * 50) | 0; id.data[i + 3] = 255; }
  ng.putImageData(id, 0, 0);
  g.globalAlpha = 0.07; g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  const blob = await c.convertToBlob({ type: ${JSON.stringify(kind === 'png' ? 'image/png' : 'image/jpeg')}, quality: 0.9 });
  window.__bytes = new Uint8Array(await blob.arrayBuffer());
  return window.__bytes.length;
})()`;

const MONITOR = `(() => {
  const m = { gaps: [], long: [], last: performance.now(), t0: 0, marks: {} };
  const tick = () => { const n = performance.now(); m.gaps.push([n, n - m.last]); m.last = n; };
  m.timer = setInterval(tick, 4);
  try { m.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) m.long.push([e.startTime, e.duration]); }); m.obs.observe({ entryTypes: ['longtask'] }); } catch {}
  window.__m = m;
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 900, show: false, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=perf'], backgroundThrottling: false },
  });
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e)); });
  const js = (code) => wc.executeJavaScript(code);
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1', perf: '1' } });
  win.showInactive();
  await sleep(1500);
  await js(`__frameling.dock.applyWorkspace('pixel')`);
  await sleep(400);
  const size = await js(MAKE);
  console.log(`picture: ${W}x${H} ${kind}, ${(size / 1e6).toFixed(1)} MB`);
  await js(MONITOR);
  await sleep(300);
  // Start: open the dialog. Then wait for the Go button, press it, and wait until the command says it is done.
  await js(`(() => { const m = window.__m; m.t0 = performance.now(); window.__done = false;
    __framelingPicture.palette(window.__bytes, 'photo').then(() => { window.__done = true; m.tDone = performance.now(); }); 0 })()`);
  let tDialog = 0, tGo = 0, tReady = 0;
  for (let i = 0; i < 4000; i++) {
    const st = await js(`({ dialog: !!document.querySelector('[data-testid="import.go"]'), done: window.__done })`);
    if (st.dialog && !tDialog) {
      tDialog = await js('performance.now()');
      // The new dialog says "working out" and keeps Go off until the colours are ready; the old one has no such wait.
      for (let j = 0; j < 2000; j++) {
        const on = await js(`(() => { const b = document.querySelector('[data-testid="import.go"]'); return !!b && !b.disabled; })()`);
        if (on) break;
        await sleep(25);
      }
      tReady = await js('performance.now()');
      await sleep(300);
      if (max) {
        await js(`(() => { const i = document.querySelector('.im-modal input[data-testid="palette.max"]'); if (i) { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, ${JSON.stringify(String(max))}); i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
        await sleep(600);
      }
      tGo = await js(`(() => { const b = document.querySelector('[data-testid="import.go"]'); const t = performance.now(); b.click(); return t; })()`);
    }
    if (st.done) break;
    await sleep(25);
  }
  await sleep(400);
  const r = await js(`(() => { const m = window.__m; clearInterval(m.timer); const t0 = m.t0;
    return { gaps: m.gaps.filter((g) => g[0] >= t0).map((g) => [Math.round(g[0] - t0), Math.round(g[1])]), long: m.long.filter((l) => l[0] >= t0).map((l) => [Math.round(l[0] - t0), Math.round(l[1])]), total: Math.round(m.tDone - t0), t0 }; })()`);
  const rel = (t) => Math.round(t - r.t0);
  const worstGap = r.gaps.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
  const worstLong = r.long.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
  const over = (ms) => r.gaps.filter((g) => g[1] > ms).length;
  const result = {
    picture: `${W}x${H} ${kind}`, maxColours: max || null, bytes: size,
    dialogShownAtMs: tDialog ? rel(tDialog) : null, readyAtMs: tReady ? rel(tReady) : null, goPressedAtMs: tGo ? rel(tGo) : null, totalMs: r.total,
    longestBlockMs: worstGap[1], longestBlockAtMs: worstGap[0], longestLongTaskMs: worstLong[1],
    gapsOver50ms: over(50), gapsOver100ms: over(100), blocksListed: r.gaps.filter((g) => g[1] > 50),
    paletteColours: await js(`__frameling.store().get().doc.palette?.colors?.length ?? null`),
    pageErrors: errors.filter((e) => !/No handler registered/.test(e)).slice(0, 5),
  };
  console.log(JSON.stringify(result, null, 1));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  app.exit(0);
});
