// End-to-end check of the selection in the real app: pick shapes with the mouse, scrub across keys (the selection follows
// the same shapes by lineage), switch artboards with Undo and Redo (the selection is kept where it exists), open an old
// file (no lineage flag) and see it upgraded, and time a scrub over a 2000-frame timeline.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/selection.cjs [outDir]
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir. Prints the timings it measured.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('selection.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sel-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let current = null;
const begin = (name) => (current = results[results.push({ name, failures: [], notes: [] }) - 1]);
const check = (cond, msg) => {
  if (!cond) current.failures.push(msg);
  return !!cond;
};
const note = (m) => current.notes.push(m);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let win;
const pageErrors = [];
const ev = (js) => win.webContents.executeJavaScript(js, true);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.webContents.on('console-message', (e) => {
      const lvl = e.level ?? e.severity;
      if (lvl === 'error' || lvl === 3) pageErrors.push(String(e.message ?? e));
    });
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__framelingArtboards && window.__framelingFeatures && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

// Helpers that live in the page. `sel()` says what is selected as lineage names (the id each shape's line started with).
const PAGE = `(() => {
  const F = window.__frameling, S = () => F.store();
  const lineageOf = (s) => s.origin ?? s.id;
  const vec = (d, frame, layerId) => {
    const l = layerId ? d.layers.find((x) => x.id === layerId) : d.layers[0];
    const c = l.cels.find((k) => frame >= k.start && frame < k.start + k.length);
    return c ? d.drawings[c.drawingId] : null;
  };
  window.__sel = {
    sel() {
      const { doc, ui } = S().get();
      const here = new Map();
      for (const l of doc.layers) {
        const c = l.cels.find((k) => ui.frame >= k.start && ui.frame < k.start + k.length);
        const d = c && doc.drawings[c.drawingId];
        if (d && d.kind === 'vector') for (const s of d.shapes) here.set(s.id, lineageOf(s));
      }
      return { frame: ui.frame, ids: ui.selection, lines: ui.selection.map((id) => here.get(id) ?? '(not here)'), artboard: doc.activeArtboard ?? null };
    },
    frame: (f) => S().setUi({ frame: f }),
    setSel: (ids) => S().setUi({ selection: ids }),
    view() { const u = S().get().ui; const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left + u.panX, y: r.top + u.panY, zoom: u.zoom }; },
    lineageOf,
    vec,
  };
  return true;
})()`;

// A 600 x 400 document: one layer, one key of 6 frames with four boxes (their lineage names s1 to s4).
const SETUP = `(async () => {
  const E = window.__framelingExport, S = window.__frameling.store();
  await E.load('blank-vector');
  const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
  S.update('setup', (d) => {
    d.name = 'Selection'; d.width = 600; d.height = 400; d.background = '#ffffff'; d.length = 6; d.fps = 12; d.clips = []; d.markers = [];
    d.drawings = { dA: { id: 'dA', kind: 'vector', shapes: [rect('s1', 40, 120, 80, 80, '#ff6f91'), rect('s2', 160, 120, 80, 80, '#5ab8ff'), rect('s3', 280, 120, 80, 80, '#4fd1a5'), rect('s4', 400, 120, 80, 80, '#ffc94a')] } };
    d.layers = [{ id: 'L1', name: 'Layer 1', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c0', start: 0, length: 6, drawingId: 'dA' }] }];
  });
  S.setUi({ activeLayerId: 'L1', frame: 0, selection: [], tool: 'select', zoom: 1, panX: 60, panY: 60 });
  return window.__frameling.store().get().doc.lineage === true;
})()`;

const click = async (p, shift) => {
  const mods = shift ? ['shift'] : [];
  win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
  win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers: mods });
  await sleep(40);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers: mods });
  await sleep(250);
};
const sel = () => ev('window.__sel.sel()');
/** Where a point of the stage is on screen right now. */
const at = async (x, y) => {
  const v = await ev('window.__sel.view()');
  return { x: Math.round(v.x + x * v.zoom), y: Math.round(v.y + y * v.zoom) };
};

// ---------------------------------------------------------------- following across keys

async function followSection() {
  await ev(PAGE);
  begin('a new document has lineage, and new keys come from the Duplicate key command');
  check(await ev(SETUP), 'the starting document has no lineage flag');
  await ev(`window.__frameling.overlays.closeSheet()`);
  await sleep(300);
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'L1', frame: 0, tool: 'select', zoom: 1, panX: 60, panY: 60 })`);
  // Keys at frames 0 to 4, each a copy of the one before (the real command), then each moved a little so they differ.
  await ev(`(() => { const F = window.__frameling; for (let f = 0; f < 4; f++) { F.store().setUi({ frame: f }); F.run('timeline.duplicateKey'); } F.store().setUi({ frame: 0 }); return true; })()`);
  const keys = await ev(`window.__frameling.store().get().doc.layers[0].cels.map((c) => c.start)`);
  check(same(keys, [0, 1, 2, 3, 4]), `keys at ${JSON.stringify(keys)}`);
  await ev(`(() => { const S = window.__frameling.store(); S.update('spread', (d) => { d.layers[0].cels.forEach((c, i) => { for (const s of d.drawings[c.drawingId].shapes) for (const p of s.paths[0].points) p.y += i * 30; }); }); return true; })()`);

  begin('the mouse picks a shape, and the selection follows it while the playhead moves');
  await ev(`window.__frameling.store().setUi({ tool: 'select', frame: 0, selection: [] })`);
  await sleep(200);
  await click(await at(200, 160)); // the second box, first key
  let s = await sel();
  check(same(s.lines, ['s2']), `picked ${JSON.stringify(s.lines)}`);
  const first = s.ids[0];
  for (const f of [1, 2, 3]) {
    await ev(`window.__sel.frame(${f})`);
    s = await sel();
    check(same(s.lines, ['s2']) && s.ids[0] !== first, `frame ${f}: ${JSON.stringify(s)}`);
  }
  await ev(`window.__sel.frame(0)`);
  s = await sel();
  check(same(s.ids, [first]), `back at frame 0: ${JSON.stringify(s)}`);
  // Two shapes, picked with Shift, then a jump over the keys in between.
  await click(await at(80, 160), true);
  s = await sel();
  check(s.ids.length === 2 && same(s.lines.slice().sort(), ['s1', 's2']), `two picked: ${JSON.stringify(s.lines)}`);
  await ev(`window.__sel.frame(3)`);
  s = await sel();
  check(s.ids.length === 2 && same(s.lines.slice().sort(), ['s1', 's2']), `jumped to frame 3: ${JSON.stringify(s.lines)}`);

  begin('picking in a later key and scrubbing back finds the same shape');
  await ev(`window.__sel.setSel([])`);
  const p3 = await at(320, 160 + 3 * 30); // the third box at frame 3 (moved 90 down)
  await click(p3);
  s = await sel();
  check(s.frame === 3 && same(s.lines, ['s3']), `picked ${JSON.stringify(s)}`);
  await ev(`window.__sel.frame(1)`);
  s = await sel();
  check(same(s.lines, ['s3']), `frame 1: ${JSON.stringify(s)}`);
  await ev(`window.__sel.frame(0)`);
  s = await sel();
  check(same(s.lines, ['s3']) && s.ids[0] === 's3', `frame 0: ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------- an old file

async function oldFileSection() {
  begin('an old file (no lineage flag, no origins) is upgraded when it opens, with no undo step');
  await ev(`(() => { const S = window.__frameling.store(); S.update('strip', (d) => { delete d.lineage; for (const dr of Object.values(d.drawings)) if (dr.kind === 'vector') for (const s of dr.shapes) delete s.origin; }); return true; })()`);
  check(!(await ev(`window.__frameling.store().get().doc.lineage`)), 'the flag was not removed for the test');
  await ev(`window.__framelingFeatures.reopen()`);
  await sleep(500);
  const r = await ev(`(() => { const st = window.__frameling.store(); const d = st.get().doc; const dr = d.layers[0].cels.map((c) => d.drawings[c.drawingId]);
    return { lineage: d.lineage === true, origins: dr.map((x) => x.shapes.map((s) => s.origin ?? null)), ids: dr.map((x) => x.shapes.map((s) => s.id)), canUndo: st.canUndo(), dirty: st.get().ui.dirty }; })()`);
  check(r.lineage, 'the opened document has no lineage flag');
  check(r.origins[0].every((o) => o === null) && r.origins.slice(1).every((o, i) => same(o, r.ids[0])), `origins ${JSON.stringify(r.origins)}`);
  check(!r.canUndo && !r.dirty, `canUndo ${r.canUndo}, dirty ${r.dirty}`);
  // And the selection follows in it.
  await ev(`window.__sel.frame(0); window.__sel.setSel([window.__frameling.store().get().doc.layers[0].cels[0] && Object.values(window.__frameling.store().get().doc.drawings)[0].shapes[1].id])`);
  await ev(`window.__sel.frame(2)`);
  const s = await sel();
  check(s.ids.length === 1 && s.lines[0] === r.ids[0][1], `followed to ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------- artboards with undo and redo

async function artboardSection() {
  await ev(SETUP);
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'L1', frame: 0, tool: 'select', selection: [], zoom: 1, panX: 60, panY: 60 })`);
  await ev(`(() => { const S = window.__frameling.store(), A = window.__framelingArtboards;
    const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
    S.update('second artboard', (d) => {
      const id = A.model.addArtboard(d, { name: 'Other', width: 300, height: 300, length: 3, background: '#eeeeee' });
      d.drawings.dB = { id: 'dB', kind: 'vector', shapes: [rect('t1', 60, 60, 100, 100, '#9b7bff')] };
      d.artboards.find((a) => a.id === id).content.layers = [{ id: 'LB', name: 'Layer B', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'cb', start: 0, length: 3, drawingId: 'dB' }] }];
    });
    return true; })()`);
  const [a, b] = await ev(`window.__frameling.store().get().doc.artboards.map((x) => x.id)`);
  const go = (id) => ev(`window.__framelingArtboards.ops.goToArtboard(${JSON.stringify(id)})`);
  const undo = () => ev(`window.__frameling.run('edit.undo')`);
  const redo = () => ev(`window.__frameling.run('edit.redo')`);

  begin('Undo and Redo keep the selected shapes that still exist');
  await go(a);
  await sleep(200);
  await ev(`window.__frameling.store().setUi({ tool: 'select', zoom: 1, panX: 60, panY: 60, frame: 0, activeLayerId: 'L1' })`);
  await click(await at(200, 160));
  await click(await at(320, 160), true);
  let s = await sel();
  check(same(s.lines.slice().sort(), ['s2', 's3']), `picked ${JSON.stringify(s)}`);
  const pick = s.ids;
  // A shape added and selected with them: Undo takes it away, and only it leaves the selection. Redo does not select it again.
  await ev(`(() => { const S = window.__frameling.store(); S.update('Add a box', (d) => void d.drawings.dA.shapes.push({ id: 'extra', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], fill: '#000', stroke: null, opacity: 1 })); S.setUi({ selection: [...S.get().ui.selection, 'extra'] }); return true; })()`);
  s = await sel();
  check(s.ids.length === 3, `three selected: ${JSON.stringify(s)}`);
  await undo();
  s = await sel();
  check(same(s.ids, pick), `undo the add: ${JSON.stringify(s)}`);
  await redo();
  s = await sel();
  check(same(s.ids, pick), `redo the add: ${JSON.stringify(s)}`);

  begin('switching artboards and Undo or Redo of the switch leave no stale selection');
  await go(b);
  s = await sel();
  check(s.artboard === b, `open artboard ${s.artboard}`);
  check(s.ids.length === 0, `the selection after opening the other artboard: ${JSON.stringify(s)}`);
  await undo();
  s = await sel();
  check(s.artboard === a && s.lines.every((l) => l !== '(not here)'), `undo: ${JSON.stringify(s)}`);
  note(`selection after undoing the switch: ${JSON.stringify(s.lines)}`);
  await redo();
  s = await sel();
  check(s.artboard === b && s.lines.every((l) => l !== '(not here)'), `redo: ${JSON.stringify(s)}`);
  // Pick the other artboard's shape with the mouse, then undo and redo the switch.
  await ev(`window.__frameling.store().setUi({ tool: 'select', frame: 0, activeLayerId: 'LB' })`);
  await click(await at(110, 110));
  s = await sel();
  check(same(s.lines, ['t1']), `picked on the second artboard ${JSON.stringify(s)}`);
  await undo();
  s = await sel();
  check(s.artboard === a && s.lines.every((l) => l !== '(not here)'), `undo to the first artboard: ${JSON.stringify(s)}`);
  await redo();
  s = await sel();
  check(s.artboard === b && s.lines.every((l) => l !== '(not here)'), `redo to the second: ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------- a long timeline

async function longSection() {
  begin('a 2000-frame timeline: the selection follows every step, and scrubbing stays fast');
  await ev(`(async () => { await window.__framelingExport.load('blank-vector'); return true; })()`);
  // One layer, 2000 keys: built with the real Duplicate key command so every key is a copy with lineage.
  const built = await ev(`(() => {
    const F = window.__frameling, S = F.store();
    const rect = (id, x, y) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }] }], fill: '#ff6f91', stroke: null, opacity: 1 });
    const shapes = []; for (let i = 0; i < 30; i++) shapes.push(rect('q' + i, 10 + (i % 10) * 30, 10 + Math.floor(i / 10) * 30));
    S.update('setup', (d) => { d.length = 2000; d.width = 600; d.height = 400; d.drawings = { dL: { id: 'dL', kind: 'vector', shapes } }; d.layers = [{ id: 'LL', name: 'Long', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'cl', start: 0, length: 2000, drawingId: 'dL' }] }]; });
    S.setUi({ activeLayerId: 'LL', frame: 0, selection: [], zoom: 1, panX: 60, panY: 60, tool: 'select' });
    const t0 = performance.now();
    for (let f = 0; f < 1999; f++) { S.setUi({ frame: f }); F.run('timeline.duplicateKey'); }
    const ms = performance.now() - t0;
    S.setUi({ frame: 0 });
    return { keys: S.get().doc.layers[0].cels.length, ms };
  })()`);
  check(built.keys === 2000, `${built.keys} keys`);
  note(`built ${built.keys} keys with the command in ${Math.round(built.ms)} ms`);
  await ev(`window.__sel.setSel(['q3', 'q14', 'q27'])`);

  // 1. Every frame in order, no painting in between: what the selection follow itself costs.
  const sync = await ev(`(() => {
    const S = window.__frameling.store(), { lineageOf, vec } = window.__sel;
    const want = ['q3', 'q14', 'q27'];
    let worst = 0, bad = 0;
    const t0 = performance.now();
    for (let f = 1; f < 2000; f++) {
      const a = performance.now();
      S.setUi({ frame: f });
      const dt = performance.now() - a; if (dt > worst) worst = dt;
    }
    const total = performance.now() - t0;
    for (const f of [1, 2, 500, 1000, 1500, 1999]) { /* checked below after the walk */ }
    const { doc, ui } = S.get();
    const d = vec(doc, 1999, 'LL');
    const lines = ui.selection.map((id) => { const s = d.shapes.find((x) => x.id === id); return s ? lineageOf(s) : null; });
    return { total, worst, lines, at: ui.frame };
  })()`);
  note(`every frame 1 to 1999 in order, no painting: ${sync.total.toFixed(0)} ms total, ${(sync.total / 1999).toFixed(3)} ms a step, worst ${sync.worst.toFixed(2)} ms`);
  check(same(sync.lines, ['q3', 'q14', 'q27']), `after the walk: ${JSON.stringify(sync.lines)}`);
  check(sync.total < 2000, `walking 2000 frames took ${sync.total.toFixed(0)} ms`);

  // 2. Big jumps, both ways, and the shapes are right each time.
  const jumps = await ev(`(() => {
    const S = window.__frameling.store(), { lineageOf, vec } = window.__sel;
    const out = []; let worst = 0;
    for (const f of [0, 1999, 1000, 3, 1998, 0, 1500, 1]) {
      const a = performance.now(); S.setUi({ frame: f }); const dt = performance.now() - a; if (dt > worst) worst = dt;
      const { doc, ui } = S.get(); const d = vec(doc, f, 'LL');
      out.push(ui.selection.map((id) => { const s = d.shapes.find((x) => x.id === id); return s ? lineageOf(s) : null; }).join(','));
    }
    return { out, worst };
  })()`);
  check(jumps.out.every((x) => x === 'q3,q14,q27'), `jumps: ${JSON.stringify(jumps.out)}`);
  note(`eight long jumps: worst ${jumps.worst.toFixed(2)} ms`);

  // 3. The same walk with the stage and timeline painting after every step (one animation frame each).
  const painted = await ev(`(async () => {
    const S = window.__frameling.store();
    S.setUi({ frame: 0 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const steps = 600, times = [];
    const t0 = performance.now();
    for (let f = 1; f <= steps; f++) {
      const a = performance.now();
      S.setUi({ frame: f });
      await new Promise((r) => requestAnimationFrame(r));
      times.push(performance.now() - a);
    }
    const total = performance.now() - t0;
    times.sort((x, y) => x - y);
    return { steps, total, median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)], worst: times[times.length - 1] };
  })()`);
  note(`${painted.steps} frames painted one by one: ${painted.total.toFixed(0)} ms, median ${painted.median.toFixed(1)} ms, p95 ${painted.p95.toFixed(1)} ms, worst ${painted.worst.toFixed(1)} ms`);
  check(painted.p95 < 100, `painted steps p95 ${painted.p95.toFixed(1)} ms`);
  const s = await sel();
  check(same(s.lines, ['q3', 'q14', 'q27']), `after the painted walk: ${JSON.stringify(s.lines)}`);
}

function report() {
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const n of r.notes) console.log(`       . ${n}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed. Output: ${outDir}`);
  return bad.length === 0;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 10 * 60 * 1000);
  try {
    await startApp();
    await followSection();
    await oldFileSection();
    await artboardSection();
    await longSection();
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
