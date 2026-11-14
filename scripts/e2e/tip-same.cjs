// Same picture, two builds: renders grainy lines (chalk, charcoal at everyday and huge sizes, short and long strokes),
// other tips, and plain fills and outlined paths through the single renderer in a real Chromium canvas, and compares every
// pixel with what another build drew. A faster way of drawing must not change a single one. A page of one build is
// loaded per run (a second page in the same run fails to load), so it is two steps: save the pictures of the build to
// match, then check this build against them.
//
//   npx vite build --outDir /tmp/dev-renderer            (a build of the code to match, for example `development`)
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron --no-sandbox scripts/e2e/tip-same.cjs --build /tmp/dev-renderer --save /tmp/tip-pictures
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron --no-sandbox scripts/e2e/tip-same.cjs --build dist/renderer --against /tmp/tip-pictures
//
// Software canvas, so the answer is the same on any machine. Exits non-zero when anything differs.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const build = path.resolve(opt('build', path.join(__dirname, '../../dist/renderer')));
const saveDir = opt('save', '');
const againstDir = opt('against', '');
if (!saveDir && !againstDir) {
  console.error('Give --save <folder> (keep this build\'s pictures) or --against <folder> (check this build against saved ones)');
  process.exit(2);
}

const defaultTip = (kind) => (kind === 'chalk' ? { kind: 'chalk', amount: 0.6, grain: 1 } : kind === 'charcoal' ? { kind: 'charcoal', amount: 0.75, grain: 1.2 } : kind === 'watercolour' ? { kind: 'watercolour', amount: 0.6 } : { kind: 'stamp', shape: 'leaf', spacing: 1.1, jitter: 0.25, angle: 'follow', scatter: 0.15 });

function wavy(n, w, h) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: Math.round(w * (0.08 + 0.84 * t) * 10) / 10, y: Math.round(h * (0.5 + 0.3 * Math.sin(t * Math.PI * 3)) * 10) / 10, p: 0.5 };
  });
}
const stroke = (id, w, h, n, size, tip, extra = {}) => ({
  id,
  type: 'stroke',
  points: wavy(n, w, h),
  brush: { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true, ...(tip ? { tip: defaultTip(tip) } : {}) },
  color: '#1d1b26',
  opacity: 1,
  ...extra,
});
const ring = (cx, cy, r, n = 12, closed = true) => ({ closed, points: Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * 6.283) * r, y: cy + Math.sin((i / n) * 6.283) * r })) });

function doc(w, h, shapes) {
  return { format: 'frameling', version: 1, lineage: true, id: 'd', name: 't', width: w, height: h, fps: 12, length: 1, background: '#ffffff', layers: [{ id: 'l', name: 'L', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c', start: 0, length: 1, drawingId: 'dr' }] }], drawings: { dr: { id: 'dr', kind: 'vector', shapes } }, clips: [], markers: [], swatches: [] };
}

const cases = [];
const add = (name, w, h, shapes, scale = 1) => cases.push({ name, d: doc(w, h, shapes), scale });
for (const tip of ['chalk', 'charcoal']) {
  add(`${tip} 120 px, 40 points`, 1000, 700, [stroke('a', 1000, 700, 40, 120, tip)]);
  add(`${tip} 120 px, 150 points`, 1000, 700, [stroke('a', 1000, 700, 150, 120, tip)]);
  add(`${tip} 120 px, 400 points`, 1000, 700, [stroke('a', 1000, 700, 400, 120, tip)]);
  add(`${tip} 24 px, 400 points, half see-through`, 1000, 700, [stroke('a', 1000, 700, 400, 24, tip, { opacity: 0.5, color: '#d6204a' })]);
  add(`${tip} 4400 px on 4000 x 3000`, 4000, 3000, [stroke('a', 4000, 3000, 40, 4400, tip)], 0.25);
  add(`${tip} 20000 px on 4000 x 3000`, 4000, 3000, [stroke('a', 4000, 3000, 40, 20000, tip)], 0.25);
  add(`${tip} 120 px, 400 points on 4000 x 3000`, 4000, 3000, [stroke('a', 4000, 3000, 400, 120, tip)], 0.25);
}
add('watercolour 80 px', 1000, 700, [stroke('a', 1000, 700, 60, 80, 'watercolour')]);
add('leaf stamps 40 px', 1000, 700, [stroke('a', 1000, 700, 60, 40, 'stamp')]);
add('plain line', 1000, 700, [stroke('a', 1000, 700, 60, 30, null)]);
// Plain shapes: fills with holes, outlined paths (their corners are joined at the start, so the close matters), open lines.
const holes = [ring(200, 200, 150, 24), ...Array.from({ length: 30 }, (_, i) => ring(80 + (i % 6) * 50, 120 + Math.floor(i / 6) * 40, 14, 5 + (i % 3)))];
add('fill with holes', 400, 400, [{ id: 'f', type: 'fill', paths: holes, color: '#2a6fdb', opacity: 1 }]);
add('path, fill only', 400, 400, [{ id: 'p', type: 'path', paths: holes, fill: '#2a6fdb', stroke: null, opacity: 1 }]);
add('path, outline only, mitre joins', 400, 400, [{ id: 'p', type: 'path', paths: holes, fill: null, stroke: { color: '#d6204a', width: 7, join: 'miter', cap: 'butt' }, opacity: 1 }]);
add('path, fill and thick outline', 400, 400, [{ id: 'p', type: 'path', paths: holes, fill: '#ffc94a', stroke: { color: '#1d1b26', width: 9, join: 'round', cap: 'round' }, opacity: 1 }]);
add('path, open lines', 400, 400, [{ id: 'p', type: 'path', paths: [ring(200, 200, 120, 9, false), ring(200, 200, 60, 7, false)], fill: '#9b7bff', stroke: { color: '#1d1b26', width: 5, join: 'round', cap: 'round' }, opacity: 1 }]);
const curvy = { closed: true, points: [{ x: 60, y: 200 }, { x: 200, y: 60, c1: { x: 60, y: 100 }, c2: { x: 120, y: 60 } }, { x: 340, y: 200, c1: { x: 280, y: 60 }, c2: { x: 340, y: 100 } }, { x: 200, y: 340, c1: { x: 340, y: 300 }, c2: { x: 280, y: 340 } }, { x: 60, y: 200, c1: { x: 120, y: 340 }, c2: { x: 60, y: 300 } }] };
add('closed curve, fill and outline', 400, 400, [{ id: 'p', type: 'path', paths: [curvy], fill: '#4fd1a5', stroke: { color: '#1d1b26', width: 6, join: 'miter', cap: 'butt' }, opacity: 1 }]);
add('closed curve, fill only', 400, 400, [{ id: 'f', type: 'fill', paths: [curvy, ring(200, 200, 40, 8)], color: '#ff6f91', opacity: 0.7 }]);

async function render(dir) {
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(dir, 'index.html'), { query: { debug: '1' } });
  await win.webContents.executeJavaScript(`new Promise((ok, no) => { const t0 = Date.now(); const t = () => (window.__framelingEffects ? ok() : Date.now() - t0 > 20000 ? no(new Error('debug hooks never appeared')) : setTimeout(t, 50)); t(); })`);
  const out = [];
  for (const c of cases) {
    const data = await win.webContents.executeJavaScript(`window.__framelingEffects.pixels(${JSON.stringify(c.d)}, 0, ${c.scale})`);
    const buf = Buffer.from(Uint8Array.from(data));
    let ink = 0;
    for (let i = 0; i < buf.length; i += 4) if (buf[i] !== 255 || buf[i + 1] !== 255 || buf[i + 2] !== 255) ink++;
    out.push({ buf, ink });
  }
  win.destroy();
  return out;
}

process.on('unhandledRejection', (e) => {
  console.error('FAIL harness error:', e && e.stack ? e.stack : e);
  app.exit(1);
});
setTimeout(() => {
  console.error('FAIL harness timed out');
  app.exit(1);
}, 900000).unref();

const file = (dir, i) => path.join(dir, `case-${String(i).padStart(2, '0')}.rgba`);

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const got = await render(build);
  if (saveDir) {
    fs.mkdirSync(saveDir, { recursive: true });
    got.forEach((g, i) => fs.writeFileSync(file(saveDir, i), g.buf));
    console.log(`saved ${got.length} pictures from ${build}`);
    return app.exit(0);
  }
  let bad = 0;
  cases.forEach((c, i) => {
    const want = fs.readFileSync(file(againstDir, i));
    let off = 0;
    const n = Math.max(want.length, got[i].buf.length);
    for (let k = 0; k < n; k++) if (want[k] !== got[i].buf[k]) off++;
    if (off) bad++;
    console.log(`${off ? 'FAIL' : 'ok  '} ${c.name}: ${got[i].ink} inked pixels, ${off ? off + ' bytes differ' : 'every byte the same'}`);
  });
  console.log(bad ? `FAIL ${bad} of ${cases.length} differ` : `ok ${cases.length} of ${cases.length} pictures are byte for byte the same`);
  app.exit(bad ? 1 : 0);
});
