// Proves that the layer bitmap cache's cropping (a layer's bitmap is only as big as its drawing, see src/canvas/inkBox.ts)
// changes no pixel. Every starter template, the kitchen sink, a 40 layer stress document and a document of awkward
// shapes (thick miter strokes, pressure-thinned brushes, curves off the stage edge, gradients, square caps, faded
// shapes) are drawn on the real editor canvas at several frames, zooms and onion skin settings, once with cropped
// bitmaps and once with full-stage bitmaps (the old way), and compared byte for byte. It also compares the bitmap
// that grows when a stroke is added, and prints how much bitmap memory the cropping saves.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/layer-cache.cjs [outDir]     (ONLY=morphing-shapes,awkward narrows it)
//
// Exits non-zero when any pixel differs.
const { app, BrowserWindow } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('layer-cache.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-lcache-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(process.env.LAYER_CACHE_RENDERER || path.join(root, 'dist/renderer'), 'index.html')).href + '?debug=1&perf';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  if (!win) throw new Error('The app never opened a window');
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling && !!window.__framelingExport')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.pixelDoc': 'stay' }))`);
        await win.loadURL(process.env.FRAMELING_DEV_URL);
        await sleep(2500);
        return;
      }
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

// Runs in the page. Documents are made there, and compared there (a frame is megabytes, not worth sending out).
const PAGE = () => `(() => {
  const F = window.__frameling;
  const S = F.store();
  const X = window.__framelingExport;
  const SELF = ${JSON.stringify(!!process.env.SELF)};
  const painter = () => window.__framelingPerf.painter;
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // A zoom change keeps showing the old bitmaps for 160 ms (a wheel tick must not rebuild them), so wait that out.
  const settle = async (ms = 90) => { await raf(); await new Promise((r) => setTimeout(r, ms)); await raf(); };
  const canvas = () => document.querySelector('canvas.cv-layer:not(.cv-overlay):not(.ab-underlay)');
  const grab = () => { const c = canvas(); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const id = (p) => p + Math.floor(rnd() * 1e9).toString(36) + Math.floor(rnd() * 1e9).toString(36);

  // Awkward shapes: everything that can reach beyond the points that define it.
  const awkward = () => {
    F.template('blank-vector');
    const d = structuredClone(S.get().doc);
    d.name = 'awkward'; d.width = 640; d.height = 400; d.length = 6; d.layers = []; d.drawings = {}; d.folders = {};
    const hex = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
    const joins = ['round', 'miter', 'bevel'], caps = ['round', 'butt', 'square'];
    for (let l = 0; l < 6; l++) {
      const L = { id: id('l'), name: 'L' + l, kind: 'vector', visible: true, locked: false, opacity: l % 3 === 1 ? 0.6 : 1, cels: [] };
      for (let f = 0; f < 6; f++) {
        const shapes = [];
        const n = 4 + Math.floor(rnd() * 5);
        for (let i = 0; i < n; i++) {
          const kind = Math.floor(rnd() * 4);
          const small = l % 2 === 0;
          const cx = small ? 120 + rnd() * 220 : rnd() * 700 - 30, cy = small ? 90 + rnd() * 160 : rnd() * 460 - 30;
          if (kind === 0) {
            shapes.push({ id: id('s'), type: 'stroke', color: hex(), opacity: rnd() < 0.3 ? 0.5 : 1,
              brush: { size: 1 + rnd() * (small ? 18 : 60), thinning: rnd() * 2 - 1, smoothing: rnd(), streamline: rnd(), taperStart: rnd() < 0.5 ? 0 : rnd() * 40, taperEnd: rnd() < 0.5 ? 0 : rnd() * 40, capStart: rnd() < 0.5, capEnd: rnd() < 0.5 },
              points: Array.from({ length: 1 + Math.floor(rnd() * 30) }, (_, k) => ({ x: cx + k * (rnd() * 12 - 3), y: cy + Math.sin(k / 2) * 25 * rnd(), p: rnd() < 0.4 ? 0.5 : rnd() })) });
          } else {
            const m = 3 + Math.floor(rnd() * 5), r = 5 + rnd() * (small ? 30 : 90);
            const pts = Array.from({ length: m }, (_, k) => {
              const a = (k / m) * Math.PI * 2 + rnd() * 0.5, rr = r * (0.2 + rnd() * 1.2), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
              return rnd() < 0.6 ? { x, y, c1: { x: x - 40 + rnd() * 80, y: y - 40 + rnd() * 80 }, c2: { x: x - 40 + rnd() * 80, y: y - 40 + rnd() * 80 } } : { x, y };
            });
            const grad = () => ({ kind: rnd() < 0.5 ? 'linear' : 'radial', stops: [{ at: 0, color: hex() }, { at: 1, color: hex() }], from: { x: cx - 30, y: cy }, to: { x: cx + 60, y: cy + 40 } });
            if (kind === 1) shapes.push({ id: id('s'), type: 'fill', color: hex(), opacity: 1, gradient: rnd() < 0.4 ? grad() : undefined, paths: [{ closed: true, points: pts }] });
            else shapes.push({ id: id('s'), type: 'path', opacity: rnd() < 0.3 ? 0.4 : 1, fill: rnd() < 0.6 ? hex() : null, fillGradient: rnd() < 0.2 ? grad() : undefined,
              stroke: rnd() < 0.85 ? { color: hex(), width: rnd() < 0.2 ? 0.3 : 1 + rnd() * 40, join: joins[Math.floor(rnd() * 3)], cap: caps[Math.floor(rnd() * 3)] } : null,
              strokeGradient: rnd() < 0.1 ? grad() : undefined, paths: [{ closed: rnd() < 0.7, points: pts }] });
          }
        }
        // A sharp spike (the miter case): a thin triangle with a thick miter stroke.
        if (f % 2 === 0) shapes.push({ id: id('s'), type: 'path', opacity: 1, fill: null, stroke: { color: '#222222', width: 14, join: 'miter', cap: 'butt' },
          paths: [{ closed: true, points: [{ x: 100 + l * 80, y: 100 }, { x: 140 + l * 80, y: 105 }, { x: 100 + l * 80, y: 110 }] }] });
        const dr = { id: id('d'), kind: 'vector', shapes };
        d.drawings[dr.id] = dr;
        L.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
      }
      d.layers.push(L);
    }
    return d;
  };

  // 40 layers in folders (the perf sweep's stress-vector).
  const stress = () => {
    F.template('blank-vector');
    const d = structuredClone(S.get().doc);
    d.name = 'stress'; d.length = 30; d.layers = []; d.drawings = {}; d.folders = {};
    const hex = (i) => '#' + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0');
    for (let b = 0; b < 8; b++) { const fid = 'fold' + b; d.folders[fid] = { id: fid, name: 'G' + b, visible: true, opacity: b === 2 ? 0.7 : 1, parent: b >= 4 ? 'fold' + (b - 4) : undefined }; }
    for (let b = 0; b < 8; b++) for (let j = 0; j < 5; j++) {
      const i = b * 5 + j;
      const L = { id: id('l'), name: 'Layer ' + i, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [], folder: 'fold' + b };
      for (let f = 0; f < 30; f++) {
        const x = 100 + ((i * 29) % 900) + 40 * Math.sin(f / 10 + i), y = 80 + ((i * 17) % 500) + 30 * Math.cos(f / 8);
        const blob = { id: id('s'), type: 'path', fill: hex(i + 7), stroke: { color: '#1d1b26', width: 3, join: 'round', cap: 'round' }, opacity: 1,
          paths: [{ closed: true, points: Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2, px = x + Math.cos(a) * 28, py = y + Math.sin(a) * 28; return { x: px, y: py, c1: { x: px - Math.sin(a) * 8, y: py + Math.cos(a) * 8 }, c2: { x: px + Math.sin(a) * 8, y: py - Math.cos(a) * 8 } }; }) }] };
        const line = { id: id('s'), type: 'stroke', color: hex(i + 3), opacity: 1, brush: { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true },
          points: Array.from({ length: 24 }, (_, k) => ({ x: x - 40 + k * 5, y: y + 40 + Math.sin(k / 3 + i) * 14, p: 0.5 })) };
        const dr = { id: id('d'), kind: 'vector', shapes: [blob, line] };
        d.drawings[dr.id] = dr;
        L.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
      }
      d.layers.push(L);
    }
    return d;
  };

  const loaders = {
    awkward: () => S.load(awkward(), null),
    stress: () => S.load(stress(), null),
    kitchen: () => X.loadKitchenSink(),
  };

  // Frames to look at: a spread across the length, always the first and last.
  const framesOf = (len) => { const out = new Set([0, len - 1, Math.floor(len / 2), Math.floor(len / 3), Math.floor((2 * len) / 3), 1, 3, 7].filter((f) => f >= 0 && f < len)); return [...out].sort((a, b) => a - b).slice(0, 8); };

  const compare = (a, b) => {
    if (a.width !== b.width || a.height !== b.height) return { diff: -1, max: 0, at: null, size: [a.width, b.width, a.height, b.height] };
    let diff = 0, max = 0, at = null;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]));
      if (d) { diff++; if (d > max) max = d; if (!at) at = [(i / 4) % a.width, Math.floor(i / 4 / a.width)]; }
    }
    return { diff, max, at };
  };

  // One document, many views. Returns one row per view with the pixel difference and the bitmap memory of each way.
  const check = async (name, opts) => {
    const rows = [];
    const len = S.get().doc.length;
    const views = [];
    for (const zoom of ['fit', 0.8, 1.31]) for (const f of framesOf(len)) for (const onion of [false, true]) {
      if (onion && (f === 0 || zoom === 0.8)) continue;
      views.push({ f, onion, zoom });
    }
    const P = painter();
    const snaps = new Map();
    const mem = { cropped: { entries: 0, mpx: 0, builds: 0 }, full: { entries: 0, mpx: 0, builds: 0 } };
    for (const mode of SELF ? ['cropped', 'full'] : ['cropped', 'full']) {
      P.cache.crop = mode === 'cropped' || SELF;
      P.clear();
      const b0 = P.cache.builds;
      for (const v of views) {
        S.setUi({ onion: { ...S.get().ui.onion, enabled: v.onion }, frame: v.f });
        const z0 = S.get().ui.zoom;
        if (v.zoom === 'fit') F.run('view.fit'); else S.setUi({ zoom: v.zoom });
        await settle(S.get().ui.zoom !== z0 ? 420 : 90);
        const key = JSON.stringify(v);
        const img = grab();
        if (mode === 'cropped') snaps.set(key, img);
        else {
          const r = { view: key, ...compare(snaps.get(key), img) };
          // The two pictures, to look at, for the first differences.
          if (r.diff && rows.filter((x) => x.pics).length < 2) {
            const png = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0); return c.toDataURL('image/png'); };
            r.pics = [png(snaps.get(key)), png(img)];
          }
          rows.push(r);
        }
      }
      mem[mode] = { entries: P.cache.size.entries, mpx: +(P.cache.size.pixels / 1e6).toFixed(2), builds: P.cache.builds - b0, evictions: P.cache.evictions };
    }
    P.cache.crop = true;
    S.setUi({ onion: { ...S.get().ui.onion, enabled: false } });
    return { name, views: rows.length, bad: rows.filter((r) => r.diff !== 0), mem };
  };

  // A stroke added to the layer being drawn on: the new bitmap grows from the old one.
  const growth = async () => {
    const P = painter();
    const out = [];
    const doc = awkward();
    for (const mode of ['cropped', 'full']) {
      P.cache.crop = mode === 'cropped';
      P.clear();
      S.load(structuredClone(doc), null);
      const d0 = S.get().doc;
      const layer = d0.layers[0];
      S.setUi({ frame: 2, activeLayerId: layer.id, tool: 'select', onion: { ...S.get().ui.onion, enabled: false } });
      F.run('view.fit');
      await settle(420);
      const shots = [grab()];
      for (let k = 0; k < 4; k++) {
        S.update('Add a stroke', (d) => {
          const l = d.layers[0];
          const dr = d.drawings[l.cels.find((c) => c.start <= 2 && c.start + c.length > 2).drawingId];
          dr.shapes.push({ id: 'grown' + k, type: 'stroke', color: '#ff2060', opacity: 0.8, brush: { size: 8 + k * 9, thinning: 0.5, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true },
            points: Array.from({ length: 14 }, (_, i) => ({ x: 20 + k * 150 + i * 9, y: 300 - k * 60 + Math.sin(i / 2) * 30, p: 0.5 })) });
        });
        await settle();
        shots.push(grab());
      }
      out.push({ mode, shots, appends: P.cache.appends });
    }
    P.cache.crop = true;
    const rows = out[0].shots.map((s, i) => compare(s, out[1].shots[i]));
    return { name: 'a growing drawing', views: rows.length, bad: rows.filter((r) => r.diff !== 0), mem: { appends: out[0].appends } };
  };

  window.__lc = { check, growth, loaders, templates: () => X.templates(), load: (id) => X.load(id) };
  return true;
})()`;

(async () => {
  await startApp();
  await ev(PAGE());
  const results = [];
  const run = async (label, loadJs, extra) => {
    await ev(loadJs);
    await sleep(500);
    const r = await ev(`window.__lc.check(${JSON.stringify(label)})`);
    results.push(r);
    const saved = r.mem.full.mpx ? (100 - (100 * r.mem.cropped.mpx) / r.mem.full.mpx).toFixed(0) : '0';
    console.log(`${r.bad.length ? 'FAIL' : 'ok  '} ${label.padEnd(18)} ${String(r.views).padStart(3)} views  bitmaps ${String(r.mem.cropped.entries).padStart(4)} (${r.mem.cropped.mpx} Mpx) vs ${String(r.mem.full.entries).padStart(4)} (${r.mem.full.mpx} Mpx)  ${saved}% less memory`);
    for (const b of r.bad.slice(0, 3)) console.log(`     ${b.view}: ${b.diff} pixels differ (max ${b.max}) first at ${JSON.stringify(b.at)}`);
    for (const b of r.bad.filter((x) => x.pics)) {
      const base = path.join(outDir, `${label.replace(/\W+/g, '-')}-${b.view.replace(/\W+/g, '_')}`);
      fs.writeFileSync(base + '-cropped.png', Buffer.from(b.pics[0].split(',')[1], 'base64'));
      fs.writeFileSync(base + '-full.png', Buffer.from(b.pics[1].split(',')[1], 'base64'));
      console.log('     pictures: ' + base + '-{cropped,full}.png');
    }
  };
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const want = (n) => !only.length || only.includes(n);
  const tpls = await ev('window.__lc.templates()');
  for (const t of tpls) if (want(t)) await run(t, `window.__lc.load(${JSON.stringify(t)})`);
  if (want('kitchen')) await run('kitchen sink', 'window.__lc.loaders.kitchen()');
  if (want('stress')) await run('40 layer stress', 'window.__lc.loaders.stress()');
  if (want('awkward')) for (let i = 0; i < 4; i++) await run('awkward shapes ' + (i + 1), `window.__lc.loaders.awkward()`);
  if (want('growth')) {
    const g = await ev('window.__lc.growth()');
    results.push(g);
    console.log(`${g.bad.length ? 'FAIL' : 'ok  '} ${g.name.padEnd(18)} ${String(g.views).padStart(3)} views  (${g.mem.appends} bitmaps grown from the last one)`);
    for (const b of g.bad.slice(0, 3)) console.log(`     ${b.diff} pixels differ (max ${b.max}) first at ${JSON.stringify(b.at)}`);
  }
  const bad = results.filter((r) => r.bad.length).length;
  const views = results.reduce((n, r) => n + r.views, 0);
  console.log(`\n${views} views compared, ${bad ? bad + ' document(s) differ' : 'every pixel identical'}`);
  app.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
