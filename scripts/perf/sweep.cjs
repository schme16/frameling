// Everyday-action sweep: main-thread time and the hottest functions for the things people do all day, on realistic
// documents. Real app, real mouse and key events, real CPU profile (Chrome DevTools Profiler) around each action.
//
//   npm run build                                 # or PERF_RENDERER=<dir> for a renderer built somewhere else
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/sweep.cjs [options]
//
// Options (all optional):
//   --docs a,b        which documents (default: all). See DOCS below.
//   --actions x,y     which actions (default: all). See ACTIONS below.
//   --reps 3          measured repeats per action (one more, unmeasured, warms it up first)
//   --top 6           how many hottest functions to print under each result (0 = none)
//   --out file.json   write every number (and the top functions) as JSON
//   --profile-dir d   keep one .cpuprofile per document and action (open in Chrome DevTools > Performance)
//   --trace           also record a Chromium trace of each action and print where the page's own (non-JavaScript) time went:
//                     style recalculation, layout, paint and so on (the "(program)" time a CPU profile cannot split)
//   --label name      stored in the JSON
//
// Environment: PERF_RENDERER=dir uses another renderer build (an unminified one gives readable function names:
// `npx vite build --minify false --outDir /somewhere/renderer`); PERF_SOFTWARE_GL=1 for WebGL under xvfb.
//
// "busy" is main-thread time with the page doing anything (JavaScript, layout, paint set-up, GC), idle time left out,
// summed over the whole action including the frames it makes. "per" is busy divided by the action's units (mouse moves,
// undo steps, ...). Compare runs from the same machine only. scripts/perf/compare-sweep.cjs lines two JSON files up.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2).filter((a) => !a.endsWith('sweep.cjs'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const list = (k, all) => { const v = opt(k, ''); return v ? v.split(',') : all; };
const reps = +opt('reps', 3);
const topN = +opt('top', 6);
const outFile = opt('out', '');
const profDir = opt('profile-dir', '');
const label = opt('label', 'sweep');
const trace = args.includes('--trace');
const rendererDir = process.env.PERF_RENDERER || path.join(root, 'dist/renderer');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sweep-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const send = (e) => win.webContents.sendInputEvent(e);
const key = async (k) => { send({ type: 'keyDown', keyCode: k }); send({ type: 'keyUp', keyCode: k }); await sleep(60); };

if (process.env.PERF_SOFTWARE_GL === '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

async function start() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(rendererDir, 'index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  win.setSize(1400, 900);
  for (let i = 0; i < 300; i++) {
    try {
      if (await ev('!!window.__frameling && !!window.__framelingArtboards')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.pixelDocs': 'stay', 'timeline.newKey': 'blank' })); true`);
        await win.loadURL(process.env.FRAMELING_DEV_URL);
        await sleep(2500);
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('page never ready');
}

// ---------------------------------------------------------------- documents (built in the page)

// Shared helpers, installed once per page load as window.__sw.
const HELPERS = `(() => {
  const F = window.__frameling;
  let n = 0;
  const id = (p) => p + (++n).toString(36) + Math.random().toString(36).slice(2, 5);
  const hex = (i) => '#' + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0');
  const BRUSH = { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
  const blob = (cx, cy, r, i) => ({
    id: id('s'), type: 'path', fill: hex(i + 7), stroke: { color: '#1d1b26', width: 3, join: 'round', cap: 'round' }, opacity: 1,
    paths: [{ closed: true, points: Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      return { x, y, c1: { x: x - Math.sin(a) * r * 0.3, y: y + Math.cos(a) * r * 0.3 }, c2: { x: x + Math.sin(a) * r * 0.3, y: y - Math.cos(a) * r * 0.3 } };
    }) }],
  });
  const line = (x, y, i) => ({ id: id('s'), type: 'stroke', color: hex(i + 3), opacity: 1, brush: BRUSH,
    points: Array.from({ length: 24 }, (_, k) => ({ x: x + k * 5, y: y + Math.sin(k / 3 + i) * 14, p: 0.5 })) });
  const vlayer = (name) => ({ id: id('l'), name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] });
  const fresh = (tpl) => { F.template(tpl); return structuredClone(F.store().get().doc); };
  const finish = (d, active) => {
    const S = F.store();
    S.load(d);
    S.setUi({ activeLayerId: active ?? d.layers[d.layers.length - 1].id, frame: 0, selection: [], tool: 'brush' });
    F.run('view.fit');
  };
  const last = () => { const L = F.store().get().doc.layers; for (let i = L.length - 1; i >= 0; i--) if ((L[i].kind === 'vector' && !L[i].rig) || L[i].kind === 'pixel') return L[i]; return L[L.length - 1]; };
  window.__sw = { F, last, id, hex, blob, line, vlayer, fresh, finish };
})()`;

const DOCS = {
  // Built-in templates.
  'bouncing-ball': { kind: 'vector', make: `(() => { window.__sw.F.template('bouncing-ball'); window.__sw.F.run('view.fit'); return true; })()` },
  'puppet': { kind: 'vector', make: `(() => { window.__sw.F.template('puppet'); window.__sw.F.run('view.fit'); return true; })()` },
  'walk-cycle': { kind: 'pixel', make: `(() => { window.__sw.F.template('walk-cycle'); window.__sw.F.run('view.fit'); return true; })()` },
  'hero-sprites': { kind: 'pixel', make: `(() => { window.__sw.F.template('hero-sprites'); window.__sw.F.run('view.fit'); return true; })()` },
  // 40 layers x 240 keys, three shapes each, in nested folders.
  'stress-vector': {
    kind: 'vector',
    make: `(() => {
      const { id, blob, line, vlayer, fresh, finish, F } = window.__sw;
      const d = fresh('blank-vector');
      d.name = 'stress'; d.length = 240; d.layers = []; d.drawings = {}; d.folders = {};
      const order = [0, 4, 1, 5, 2, 6, 3, 7];
      for (let b = 0; b < 8; b++) { const fid = 'fold' + b; d.folders[fid] = { id: fid, name: 'Group ' + b, visible: true, opacity: 1, parent: b >= 4 ? 'fold' + (b - 4) : undefined }; }
      for (const b of order) for (let j = 0; j < 5; j++) {
        const i = b * 5 + j;
        const L = vlayer('Layer ' + (i + 1)); L.folder = 'fold' + b;
        for (let f = 0; f < 240; f++) {
          const x = 100 + ((i * 29) % 900) + 40 * Math.sin(f / 10 + i), y = 80 + ((i * 17) % 500) + 30 * Math.cos(f / 8);
          const dr = { id: id('v'), kind: 'vector', shapes: [blob(x, y, 28, i), line(x - 40, y + 40, i + f), blob(x + 60, y + 20, 14, f)] };
          for (const s of dr.shapes) s.origin = s.id;
          d.drawings[dr.id] = dr;
          L.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
        }
        d.layers.push(L);
      }
      finish(d);
      return d.layers.length;
    })()`,
  },
  // A 2000 x 2000 stage with 100 frames: each frame holds an 800 x 800 painted block of flat 8 x 8 colour cells.
  'stress-pixel': {
    kind: 'pixel',
    make: `(() => {
      const { id, F } = window.__sw;
      F.template('blank-pixel');
      const d = structuredClone(F.store().get().doc);
      d.name = 'stress pixel'; d.width = 2000; d.height = 2000; d.length = 100; d.drawings = {};
      const layer = d.layers.find((l) => l.kind === 'pixel');
      layer.pixelSize = 1; layer.cels = [];
      const PAL = Array.from({ length: 16 }, (_, k) => [(k * 53) & 255, (k * 97) & 255, (k * 29 + 60) & 255]);
      const W = 800, H = 800;
      for (let f = 0; f < 100; f++) {
        const px = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const c = ((x >> 3) + (y >> 3) + f) % 7 === 0 ? -1 : (((x >> 3) * 31 + (y >> 3) * 17 + f) % 16);
          if (c < 0) continue;
          const o = (y * W + x) * 4, p = PAL[c];
          px[o] = p[0]; px[o + 1] = p[1]; px[o + 2] = p[2]; px[o + 3] = 255;
        }
        const dr = { id: id('p'), kind: 'pixel', x: 600 + (f % 5) * 20, y: 600, width: W, height: H, pixels: px };
        d.drawings[dr.id] = dr;
        layer.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
      }
      d.camera = undefined;
      window.__sw.finish(d, layer.id);
      F.store().setUi({ tool: 'pencil', color: '#ff2020' });
      return true;
    })()`,
  },
  // A vector animation with four linked variations (see src/artboards/variations.ts).
  'variations': {
    kind: 'vector',
    make: `(() => {
      const { F } = window.__sw;
      F.template('walk-cycle');
      const S = F.store(), A = window.__framelingArtboards;
      const root = A.model.activeId(S.get().doc);
      const sizes = [null, { width: 400, height: 400 }, { width: 640, height: 360 }, { width: 300, height: 600 }];
      sizes.forEach((size, i) => S.update('Variation', (d) => void A.makeVariation(d, root, size ? { name: 'Var ' + i, size, frame: 'fill' } : { name: 'Var ' + i })));
      F.run('view.fit');
      return S.get().doc.artboards.length;
    })()`,
  },
  // 60 symbols (three layers of shapes each, 12 frames) with 120 instances on the stage over 24 frames.
  'stress-symbols': {
    kind: 'vector',
    make: `(() => {
      const { id, blob, line, vlayer, fresh, finish } = window.__sw;
      const d = fresh('blank-vector');
      d.name = 'symbols'; d.length = 24; d.layers = []; d.drawings = {}; d.symbols = {};
      const syms = [];
      for (let s = 0; s < 60; s++) {
        const sd = { id: id('sym'), name: 'Symbol ' + s, layers: [], length: 12, origin: { x: 0, y: 0 } };
        for (let l = 0; l < 3; l++) {
          const L = vlayer('s' + s + 'l' + l);
          for (let f = 0; f < 12; f++) {
            const dr = { id: id('v'), kind: 'vector', shapes: [blob(f * 2, l * 10, 12 + l * 3, s + l), line(-20, 10 + l * 6, s + f)] };
            d.drawings[dr.id] = dr;
            L.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
          }
          sd.layers.push(L);
        }
        d.symbols[sd.id] = sd; syms.push(sd.id);
      }
      const stage = vlayer('Actors');
      for (let f = 0; f < 24; f++) {
        const shapes = [];
        for (let k = 0; k < 120; k++) {
          const sh = { id: id('i'), type: 'instance', symbolId: syms[k % 60], opacity: 1, play: 'loop', firstFrame: k % 12,
            transform: { x: 60 + (k % 15) * 80 + f * 2, y: 60 + Math.floor(k / 15) * 80, scaleX: 1, scaleY: 1, rotation: f * 3, skew: 0 } };
          sh.origin = sh.id;
          shapes.push(sh);
        }
        const dr = { id: id('v'), kind: 'vector', shapes };
        d.drawings[dr.id] = dr;
        stage.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
      }
      d.layers.push(stage);
      finish(d);
      return syms.length;
    })()`,
  },
};

// ---------------------------------------------------------------- helpers for the actions

const stageBox = () => ev(`(() => {
  const S = window.__frameling.store().get();
  const r = document.querySelector('.cv-root').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, zoom: S.ui.zoom, panX: S.ui.panX, panY: S.ui.panY, dw: S.doc.width, dh: S.doc.height };
})()`);
const toScreen = (b, x, y) => [Math.round(b.x + b.panX + x * b.zoom), Math.round(b.y + b.panY + y * b.zoom)];
const state = () => ev(`(() => { const S = window.__frameling.store(); const s = S.get(); return { undo: S.undoLabel(), canRedo: S.canRedo(), layers: s.doc.layers.length, sel: s.ui.selection.length, frame: s.ui.frame, boards: (s.doc.artboards || []).length, active: s.ui.activeLayerId, playing: s.ui.playing }; })()`);
const run = (id) => ev(`window.__frameling.run(${JSON.stringify(id)}); true`);
const escape = async (n = 2) => { for (let i = 0; i < n; i++) await key('Escape'); };

/** Drags the mouse along points with the left button down (real events), pausing a little between moves. */
async function drag(pts, gap = 12) {
  send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
  send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) { send({ type: 'mouseMove', x: pts[i][0], y: pts[i][1], modifiers: ['leftButtonDown'] }); await sleep(gap); }
  const l = pts[pts.length - 1];
  send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
  await sleep(250);
}

/** A point on a shape of the top-most layer that has one on this frame: layer id and stage position. */
const findShape = () => ev(`(() => {
  const S = window.__frameling.store().get(), d = S.doc;
  for (let i = d.layers.length - 1; i >= 0; i--) {
    const l = d.layers[i];
    if (l.kind !== 'vector' || l.rig) continue;
    const c = l.cels.find((c) => c.start <= S.ui.frame && S.ui.frame < c.start + c.length);
    const dr = c && d.drawings[c.drawingId];
    const sh = dr && dr.shapes && dr.shapes.find((s) => s.type === 'path' || s.type === 'stroke' || s.type === 'instance');
    if (!sh) continue;
    const p = sh.type === 'path' ? sh.paths[0].points[0] : sh.type === 'instance' ? sh.transform : sh.points[0];
    return { layer: l.id, x: p.x, y: p.y };
  }
  return null;
})()`);

// ---------------------------------------------------------------- actions

// Each action: { kinds, units, setup?, act, cleanup? }. `act` is what is profiled; it returns nothing. `units` names the
// thing "per" divides by and how many there are (a number, or a function of what setup returned).
const ACTIONS = {
  'brush-stroke': {
    edits: true,
    kinds: ['vector'], unit: 'moves', units: 60,
    async setup() {
      await ev(`(() => { const S = window.__frameling.store(); S.setUi({ tool: 'brush', frame: 0, selection: [], activeLayerId: window.__sw.last().id }); return true; })()`);
      await escape();
    },
    async act() {
      const b = await stageBox();
      const pts = [];
      for (let i = 0; i < 60; i++) pts.push(toScreen(b, b.dw * 0.2 + i * 6, b.dh * 0.5 + Math.sin(i / 6) * 40));
      await drag(pts);
    },
  },
  'pixel-stroke': {
    edits: true,
    kinds: ['pixel'], unit: 'moves', units: 60,
    async setup() {
      await ev(`(() => { const S = window.__frameling.store(); const l = S.get().doc.layers.find((l) => l.kind === 'pixel'); S.setUi({ tool: 'pencil', frame: 0, selection: [], activeLayerId: l.id, color: '#ff2020' }); return true; })()`);
      await escape();
    },
    async act() {
      const b = await stageBox();
      const pts = [];
      for (let i = 0; i < 60; i++) pts.push(toScreen(b, b.dw * 0.3 + i * (b.dw / 200), b.dh * 0.5 + Math.sin(i / 6) * (b.dh / 20)));
      await drag(pts);
    },
  },
  'scrub': {
    kinds: ['vector', 'pixel'], unit: 'moves', units: 80,
    async setup() { await ev(`window.__frameling.store().setUi({ frame: 0, playing: false }); true`); },
    async act() {
      const r = await ev(`(() => { const e = document.querySelector('[data-region="ruler"]'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const y = Math.round(r.y + r.h / 2);
      const pts = [];
      for (let i = 0; i < 40; i++) pts.push([Math.round(r.x + 24 + (i * (r.w - 48)) / 39), y]);
      for (let i = 38; i >= 0; i--) pts.push([Math.round(r.x + 24 + (i * (r.w - 48)) / 39), y]);
      await drag(pts, 16);
    },
  },
  'play': {
    kinds: ['vector', 'pixel'], unit: 'seconds', units: 1.5,
    async setup() { await ev(`window.__frameling.store().setUi({ frame: 0, playing: false, tool: 'select' }); true`); },
    async act() {
      await run('timeline.play');
      await sleep(1500);
      await run('timeline.play');
      await sleep(100);
    },
  },
  'select-click': {
    kinds: ['vector'], unit: 'clicks', units: 4,
    async setup() {
      const t = await findShape();
      if (!t) throw new Skip('no shape to select');
      await ev(`window.__frameling.store().setUi({ tool: 'select', frame: 0, activeLayerId: ${JSON.stringify(t.layer)}, selection: [] }); true`);
      this.target = t;
    },
    async act() {
      const b = await stageBox();
      const [x, y] = toScreen(b, this.target.x, this.target.y);
      for (let i = 0; i < 4; i++) {
        send({ type: 'mouseMove', x, y });
        send({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        send({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        await sleep(120);
        await escape(1);
      }
    },
  },
  'select-move': {
    edits: true,
    skipIfNoEdit: true,
    kinds: ['vector'], unit: 'moves', units: 30,
    async setup() {
      const t = await findShape();
      if (!t) throw new Skip('no shape to select');
      await ev(`window.__frameling.store().setUi({ tool: 'select', frame: 0, activeLayerId: ${JSON.stringify(t.layer)}, selection: [] }); true`);
      this.target = t;
    },
    async act() {
      const b = await stageBox();
      const [x, y] = toScreen(b, this.target.x, this.target.y);
      const pts = [];
      for (let i = 0; i < 30; i++) pts.push([x + i * 3, y + Math.round(i * 1.5)]);
      await drag(pts);
      this.moved = (await state()).sel;
    },
  },
  'add-layer': {
    edits: true,
    kinds: ['vector', 'pixel'], unit: 'layers', units: 3,
    async act() { for (let i = 0; i < 3; i++) { await run('layers.addVector'); await sleep(80); } },
  },
  'delete-layer': {
    edits: true,
    kinds: ['vector', 'pixel'], unit: 'layers', units: 3,
    async setup() { for (let i = 0; i < 3; i++) { await run('layers.addVector'); await sleep(80); } },
    async act() { for (let i = 0; i < 3; i++) { await run('layers.delete'); await sleep(80); } },
  },
  'add-key': {
    edits: true,
    kinds: ['vector', 'pixel'], unit: 'keys', units: 3,
    async setup() { await ev(`(() => { const S = window.__frameling.store(); const d = S.get().doc; S.setUi({ frame: 3, selection: [], activeLayerId: window.__sw.last().id }); return true; })()`); },
    async act() { for (let i = 0; i < 3; i++) { await run('timeline.duplicateKey'); await sleep(80); } },
  },
  'delete-key': {
    edits: true,
    kinds: ['vector', 'pixel'], unit: 'keys', units: 3,
    async setup() { await ev(`(() => { const S = window.__frameling.store(); const d = S.get().doc; S.setUi({ frame: 3, selection: [], activeLayerId: window.__sw.last().id }); return true; })()`); },
    async act() {
      // Click the key in the timeline (real input), then Delete the picked key.
      for (let i = 0; i < 3; i++) {
        const r = await ev(`(() => {
          const S = window.__frameling.store().get(), l = window.__sw.last();
          const c = l.cels.find((c) => c.start === ${3 + i}) || l.cels[${3 + i}];
          const e = c && document.querySelector('[data-cel="' + c.id + '"]');
          if (!e) return null;
          e.scrollIntoView({ block: 'center', inline: 'center' });
          const b = e.getBoundingClientRect();
          return { x: b.left + Math.min(b.width / 2, 12), y: b.top + b.height / 2 };
        })()`);
        if (!r) throw new Skip('no key to click');
        send({ type: 'mouseMove', x: Math.round(r.x), y: Math.round(r.y) });
        send({ type: 'mouseDown', x: Math.round(r.x), y: Math.round(r.y), button: 'left', clickCount: 1 });
        send({ type: 'mouseUp', x: Math.round(r.x), y: Math.round(r.y), button: 'left', clickCount: 1 });
        await sleep(100);
        await run('timeline.deleteKeys');
        await sleep(80);
      }
    },
  },
  'undo-redo': {
    kinds: ['vector', 'pixel'], unit: 'steps', units: 12,
    async setup() {
      // Six small edits (a layer rename each), so undo and redo have real steps to walk.
      await ev(`(() => { const S = window.__frameling.store(); for (let i = 0; i < 6; i++) S.update('Rename ' + i, (d) => { d.layers[d.layers.length - 1].name = 'Renamed ' + i + Math.random(); }); return true; })()`);
    },
    async act() {
      for (let i = 0; i < 6; i++) { await run('edit.undo'); await sleep(60); }
      for (let i = 0; i < 6; i++) { await run('edit.redo'); await sleep(60); }
    },
  },
  'switch-artboard': {
    kinds: ['vector', 'pixel'], unit: 'switches', units: 6,
    async setup() {
      this.made = false;
      await ev(`(() => { const S = window.__frameling.store(); S.setUi({ tool: 'select', selection: [] }); return true; })()`);
      const n = (await state()).boards;
      if (n < 2) { await ev(`(() => { window.__framelingArtboards.ops.newArtboard({}, false); return true; })()`); this.made = true; }
      this.ids = await ev(`(() => { const d = window.__frameling.store().get().doc; return d.artboards.map((a) => a.id); })()`);
      this.home = await ev(`window.__framelingArtboards.model.activeId(window.__frameling.store().get().doc)`);
    },
    async act() {
      const others = this.ids.filter((i) => i !== this.home);
      for (let i = 0; i < 3; i++) {
        await ev(`window.__framelingArtboards.ops.goToArtboard(${JSON.stringify(others[i % others.length])}); true`);
        await sleep(200);
        await ev(`window.__framelingArtboards.ops.goToArtboard(${JSON.stringify(this.home)}); true`);
        await sleep(200);
      }
    },
    async cleanup() {
      await ev(`window.__framelingArtboards.ops.goToArtboard(${JSON.stringify(this.home)}); true`);
    },
  },
  'export-dialog': {
    kinds: ['vector', 'pixel'], unit: 'opens', units: 1,
    async act() { await run('file.export'); await sleep(900); await escape(1); await sleep(200); },
    async cleanup() { await escape(2); },
  },
  'save-file': {
    kinds: ['vector', 'pixel'], unit: 'saves', units: 1,
    async act() { this.len = await ev(`(window.__framelingArtboards.saveBytesAsync || (async () => window.__framelingArtboards.saveBytes()))().then((b) => b.length)`); },
  },
  'open-file': {
    kinds: ['vector', 'pixel'], unit: 'opens', units: 1,
    async setup() { await ev(`window.__swBytes = window.__framelingArtboards.saveBytes(); true`); },
    // The app opens files through loadFileAsync (pictures decoded on workers); older builds only had the sync hook.
    async act() { await ev(`(async () => { const A = window.__framelingArtboards; await (A.openBytesAsync || (async (b) => A.openBytes(b)))(window.__swBytes); return true; })()`); await sleep(400); },
  },
  'autosave': {
    kinds: ['vector', 'pixel'], unit: 'saves', units: 1,
    async setup() { await ev(`(() => { const S = window.__frameling.store(); S.update('Rename', (d) => { d.layers[d.layers.length - 1].name = 'Auto ' + Math.random(); }); return true; })()`); },
    async act() { await ev(`window.__framelingIo.autosaveNow().then(() => true)`); await sleep(200); },
  },
  'workspaces': {
    kinds: ['vector', 'pixel'], unit: 'switches', units: 6,
    async setup() { await ev(`window.__frameling.dock.applyWorkspace('draw'); true`); await sleep(300); },
    async act() {
      for (const w of ['animate', 'pixel', 'draw', 'animate', 'pixel', 'draw']) { await ev(`window.__frameling.dock.applyWorkspace(${JSON.stringify(w)}); true`); await sleep(250); }
    },
  },
};

// ---------------------------------------------------------------- profiling

/** Busy time (ms) of a profile and per-function self and inclusive time (ms), keyed by name and place. */
function analyse(prof) {
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = prof.timeDeltas;
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const k = (n) => `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url) || ''}:${n.callFrame.lineNumber + 1}`;
  const self = new Map();
  const incl = new Map();
  let busy = 0;
  for (let i = 0; i < prof.samples.length; i++) {
    const t = (dt[i + 1] ?? dt[i] ?? 0) / 1000; // the time up to the next sample belongs to this one
    const n = nodes.get(prof.samples[i]);
    if (n.callFrame.functionName === '(idle)') continue;
    busy += t;
    self.set(k(n), (self.get(k(n)) || 0) + t);
    const seen = new Set();
    for (let c = n.id; c !== undefined; c = parent.get(c)) {
      const kk = k(nodes.get(c));
      if (seen.has(kk) || kk.startsWith('(root)')) continue;
      seen.add(kk);
      incl.set(kk, (incl.get(kk) || 0) + t);
    }
  }
  return { busy, self, incl };
}
const addInto = (a, b) => { for (const [k, v] of b) a.set(k, (a.get(k) || 0) + v); };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const top = (m, n, div) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +(v / div).toFixed(1)]);

/** Undoes (and drops redo of) whatever an action left, back to the history position it started from. */
async function restore(base) {
  for (let i = 0; i < 40; i++) {
    const h = await ev('(() => { const S = window.__frameling.store(); return { u: S.historyIds().undo, can: S.canUndo() }; })()');
    if (h.u === base || !h.can) break;
    await ev('window.__frameling.store().undo(); true');
  }
}

async function measure(name, a, dbg) {
  const base = await ev('window.__frameling.store().historyIds().undo');
  if (a.setup) await a.setup();
  await a.act(); // warm-up, not measured
  if (a.cleanup) await a.cleanup();
  await restore(base);
  const busys = [];
  const self = new Map();
  const incl = new Map();
  let lastProfile = null;
  const rendering = new Map();
  for (let r = 0; r < reps; r++) {
    if (a.setup) await a.setup();
    await sleep(300);
    const before = a.edits ? await ev('window.__frameling.store().historyIds().undo') : null;
    await dbg.sendCommand('Profiler.start');
    if (trace) { const k = await traced(dbg, () => a.act()); for (const [n, v] of k) rendering.set(n, (rendering.get(n) || 0) + v / reps); }
    else await a.act();
    const { profile } = await dbg.sendCommand('Profiler.stop');
    lastProfile = profile;
    if (a.edits) {
      const h = await ev('window.__frameling.store().historyIds().undo');
      if (h === before) throw a.skipIfNoEdit ? new Skip('nothing there to edit') : new Error('the action made no edit (the harness is not driving the app)');
    }
    const an = analyse(profile);
    busys.push(an.busy);
    addInto(self, an.self);
    addInto(incl, an.incl);
    if (a.cleanup) await a.cleanup();
    await restore(base);
  }
  return { busy: median(busys), all: busys, self: top(self, Math.max(topN, 3), reps), incl: top(incl, Math.max(topN * 2, 6), reps), rendering: [...rendering].map(([k, v]) => [k, +v.toFixed(1)]).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]), profile: lastProfile };
}

/** Records a trace while `fn` runs; returns time (ms) in the main thread's rendering work by kind. */
async function traced(dbg, fn) {
  const events = [];
  const on = (_e, method, p) => { if (method === 'Tracing.dataCollected') events.push(...p.value); };
  dbg.on('message', on);
  await dbg.sendCommand('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'], recordMode: 'recordAsMuchAsPossible' } });
  await fn();
  const done = new Promise((r) => dbg.once('message', function f(_e, m) { if (m === 'Tracing.tracingComplete') r(); else dbg.once('message', f); }));
  await dbg.sendCommand('Tracing.end');
  await done;
  dbg.removeListener('message', on);
  const main = events.find((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain');
  const kinds = new Map();
  if (main) for (const e of events) if (e.ph === 'X' && e.tid === main.tid && e.pid === main.pid && /^(UpdateLayoutTree|Layout|PrePaint|Paint|Layerize|Commit|HitTest|UpdateLayer|ParseHTML|Decode Image|ImageDecodeTask|CompositeLayers|FireAnimationFrame|MajorGC|MinorGC|V8\.GC_.*|IntersectionObserverController::computeIntersections)$/.test(e.name)) kinds.set(e.name, (kinds.get(e.name) || 0) + e.dur / 1000);
  return kinds;
}

/** Thrown by an action that cannot run on this document (nothing to select, no key to click): left out, not a failure. */
class Skip extends Error {}

const pad = (s, n) => String(s).padEnd(n);
const num = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)).padStart(8);

(async () => {
  await start();
  const docNames = list('docs', Object.keys(DOCS));
  const actionNames = list('actions', Object.keys(ACTIONS));
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Profiler.enable');
  await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
  if (profDir) fs.mkdirSync(profDir, { recursive: true });
  await ev(HELPERS);
  const results = [];
  for (const dn of docNames) {
    const doc = DOCS[dn];
    if (!doc) { console.error('unknown doc', dn); continue; }
    const t0 = Date.now();
    await ev(HELPERS);
    try { await ev(doc.make); } catch (e) { console.error(`doc ${dn} failed:`, e.message); continue; }
    await sleep(2000);
    await escape();
    // What can be done on it: vector drawing needs a plain vector layer (no bones), pixel drawing a pixel layer.
    doc.kinds = await ev(`(() => { const L = window.__frameling.store().get().doc.layers; const k = []; if (L.some((l) => l.kind === 'vector' && !l.rig)) k.push('vector'); if (L.some((l) => l.kind === 'pixel')) k.push('pixel'); return k; })()`);
    console.error(`doc ${dn} ready (${Date.now() - t0} ms)`);
    for (const an of actionNames) {
      const a = ACTIONS[an];
      if (!a) { console.error('unknown action', an); continue; }
      if (!a.kinds.some((k) => doc.kinds.includes(k))) continue;
      const ctx = Object.create(a);
      try {
        const m = await measure(an, ctx, dbg);
        const units = typeof a.units === 'function' ? a.units(ctx) : a.units;
        const st = await state();
        const row = { doc: dn, action: an, busyMs: +m.busy.toFixed(1), runs: m.all.map((x) => +x.toFixed(1)), unit: a.unit, units, perUnitMs: +(m.busy / units).toFixed(2), topSelf: m.self, topIncl: m.incl, rendering: m.rendering, note: ctx.moved !== undefined ? `selected ${ctx.moved}` : ctx.len ? `${(ctx.len / 1048576).toFixed(1)} MB file` : '' };
        results.push(row);
        console.error(`  ${pad(dn, 15)} ${pad(an, 16)} busy ${num(m.busy)} ms  (${num(row.perUnitMs)} per unit)  [${m.all.map((x) => x.toFixed(0)).join(' ')}]  after: ${st.layers} layers, undo "${st.undo}"`);
        if (profDir && m.profile) fs.writeFileSync(path.join(profDir, `${dn}.${an}.cpuprofile`), JSON.stringify(m.profile));
        if (trace && m.rendering.length) console.error('        page   ' + m.rendering.map(([k, v]) => `${k} ${v}`).join(', '));
        if (topN) {
          for (const [k, v] of m.self.slice(0, topN)) console.error(`        self ${num(v)}  ${k}`);
          for (const [k, v] of m.incl.slice(0, topN * 2)) console.error(`        incl ${num(v)}  ${k}`);
        }
      } catch (e) {
        if (e instanceof Skip) {
          console.error(`  ${pad(dn, 15)} ${pad(an, 16)} skipped: ${e.message}`);
          continue;
        }
        console.error(`  ${pad(dn, 15)} ${pad(an, 16)} FAILED: ${e.message}`);
        results.push({ doc: dn, action: an, error: e.message });
        try { await escape(); await ev(doc.make); await sleep(1500); } catch {}
      }
    }
  }
  console.log('\n' + pad('document', 16) + pad('action', 17) + pad('busy ms', 9) + pad('per unit', 10) + 'unit');
  for (const r of results) {
    if (r.error) { console.log(pad(r.doc, 16) + pad(r.action, 17) + 'FAILED ' + r.error); continue; }
    console.log(pad(r.doc, 16) + pad(r.action, 17) + pad(r.busyMs.toFixed(0), 9) + pad(r.perUnitMs.toFixed(2), 10) + r.unit + (r.note ? '  ' + r.note : ''));
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ label, when: new Date().toISOString(), reps, results }, null, 1));
  app.exit(0);
})().catch((e) => { console.error(e); app.exit(1); });
