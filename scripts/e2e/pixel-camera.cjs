// End-to-end check of pixel drawing through a turned and zoomed camera, in the real app with real mouse events.
// Every shape and stroke is aimed at the middle of art pixels (worked out through the camera), and the pixels that
// land in the layer must be exactly the cells the same drawing makes with no camera. It also reads the screen back
// at those cells to prove the picture and the pointer agree, and does the same on a layer at another depth.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixel-camera.cjs [outDir]
//
// Exits non-zero when anything fails.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('pixel-camera.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-pxcam-')));
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

let win;
const pageErrors = [];
const ev = (js) => win.webContents.executeJavaScript(js, true).catch((e) => { throw new Error(String(e.message) + ' in: ' + js.slice(0, 160).replace(/\s+/g, ' ')); });
const send = (e) => win.webContents.sendInputEvent(e);

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
      if (await ev('!!window.__frameling')) {
        // No welcome sheet and no workspace question.
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.pixelDocs': 'stay' })); true`);
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

// Page helpers: where a stage point is on the window (through the camera for a layer), and the pixel cells now filled.
const PAGE = `(() => {
  const F = window.__frameling;
  const S = F.store();
  const RAD = Math.PI / 180;
  const matrix = (view, factor, doc) => {
    const cx = doc.width / 2, cy = doc.height / 2;
    const z = Math.pow(view.zoom, factor);
    const px = cx + (view.x - cx) * factor, py = cy + (view.y - cy) * factor;
    const r = -view.rotation * RAD, c = Math.cos(r) * z, s = Math.sin(r) * z;
    return [c, s, -s, c, cx - (c * px - s * py), cy - (s * px + c * py)];
  };
  window.__px = {
    // Window coordinates of a stage point on the active layer (its depth decides the camera speed).
    toWindow(x, y) {
      const { doc, ui } = S.get();
      const cam = doc.layers.find((l) => l.kind === 'camera');
      const layer = doc.layers.find((l) => l.id === ui.activeLayerId);
      const cel = cam.cels[0];
      const view = doc.drawings[cel.drawingId].view;
      const factor = 1 / (1 + Math.max(-0.9, layer && layer.depth ? layer.depth : 0));
      const m = matrix(view, factor, doc);
      const sx = m[0] * x + m[2] * y + m[4], sy = m[1] * x + m[3] * y + m[5];
      const b = document.querySelector('.cv-root').getBoundingClientRect();
      return [Math.round(b.left + ui.panX + sx * ui.zoom), Math.round(b.top + ui.panY + sy * ui.zoom)];
    },
    cells(layerName) {
      const { doc } = S.get();
      const layer = doc.layers.find((l) => l.name === layerName);
      const d = doc.drawings[layer.cels[0].drawingId];
      const out = [];
      for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (d.pixels[(y * d.width + x) * 4 + 3]) out.push(x + ',' + y);
      return out;
    },
  };
  return true;
})()`;

const camera = (view, depth) =>
  ev(`(() => {
    const F = window.__frameling, S = F.store();
    F.template('blank-pixel');
    const layer = S.get().doc.layers.find((l) => l.kind === 'pixel');
    S.update('depth', (d) => { d.layers.find((l) => l.id === layer.id).depth = ${depth}; });
    S.setUi({ activeLayerId: layer.id });
    F.run('camera.add');
    const cam = S.get().doc.layers.find((l) => l.kind === 'camera');
    S.update('view', (d) => { Object.assign(d.drawings[cam.cels[0].drawingId].view, ${JSON.stringify(view)}); });
    S.setUi({ activeLayerId: layer.id, tool: 'rect', color: '#d6204a', fillColor: '#2060e0', strokeOn: true, frame: 0 });
    F.anim.view({ throughCamera: true });
    F.run('view.fit');
    return S.get().doc.layers.find((l) => l.kind === 'pixel').name;
  })()`);

const cellMid = (cx, cy, ps = 8) => [(cx + 0.5) * ps, (cy + 0.5) * ps];

async function drag(tool, cellsList) {
  await ev(`window.__frameling.store().setUi({ tool: ${JSON.stringify(tool)} })`);
  await sleep(100);
  const pts = [];
  for (const [cx, cy] of cellsList) pts.push(await ev(`window.__px.toWindow(...${JSON.stringify(cellMid(cx, cy))})`));
  send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
  send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
  await sleep(20);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let k = 1; k <= 6; k++) {
      send({ type: 'mouseMove', x: Math.round(ax + ((bx - ax) * k) / 6), y: Math.round(ay + ((by - ay) * k) / 6), modifiers: ['leftButtonDown'] });
      await sleep(8);
    }
  }
  const [lx, ly] = pts[pts.length - 1];
  send({ type: 'mouseUp', x: lx, y: ly, button: 'left', clickCount: 1 });
  await sleep(150);
}

// Cells near the middle of the camera's view, so every one is on screen.
const SHAPES = [
  ['rect', [[11, 11], [18, 16]]],
  ['ellipse', [[15, 15], [22, 21]]],
  ['line', [[10, 22], [20, 12]]],
  ['star', [[11, 17], [21, 23]]],
  ['pencil', [[10, 20], [18, 20], [18, 14]]],
];

async function readScreen(cell, ps = 8) {
  // The colour on the window at the middle of a cell (capture is in device pixels, same as window pixels here).
  const [x, y] = await ev(`window.__px.toWindow(...${JSON.stringify(cellMid(cell[0], cell[1], ps))})`);
  const img = await win.webContents.capturePage({ x, y, width: 1, height: 1 });
  const [b, g, r, a] = img.toBitmap();
  return { r, g, b, a };
}

async function scenario(name, view, depth) {
  begin(name);
  const layerName = await camera(view, depth);
  await ev(PAGE);
  await sleep(400);
  // The same shapes with no camera: what each shape should make.
  for (const [tool, pts] of SHAPES) {
    await ev(`window.__frameling.store().setUi({ tool: ${JSON.stringify(tool)} })`);
    const before = new Set(await ev(`window.__px.cells(${JSON.stringify(layerName)})`));
    await drag(tool, pts);
    const after = new Set(await ev(`window.__px.cells(${JSON.stringify(layerName)})`));
    const made = [...after].filter((c) => !before.has(c));
    // Undo, so the next shape starts from the same picture, then redo it with the camera off to get the reference.
    await ev(`window.__frameling.run('edit.undo')`);
    await ev(`window.__frameling.anim.view({ throughCamera: false })`);
    await sleep(150);
    const flat = await refShape(layerName, tool, pts);
    await ev(`window.__frameling.run('edit.undo')`);
    await ev(`window.__frameling.anim.view({ throughCamera: true })`);
    await sleep(150);
    const missing = flat.filter((c) => !made.includes(c));
    const extra = made.filter((c) => !flat.includes(c));
    check(missing.length === 0 && extra.length === 0, `${tool}: through the camera ${made.length} cells, flat ${flat.length}; missing ${missing.slice(0, 6)} extra ${extra.slice(0, 6)}`);
    // Draw it once more and read the screen at its cells.
    await drag(tool, pts);
    const cells = await ev(`window.__px.cells(${JSON.stringify(layerName)})`);
    await sleep(300);
    fs.writeFileSync(path.join(outDir, `${name.replace(/\W+/g, '-')}-${tool}.png`), (await win.webContents.capturePage()).toPNG());
    let blank = 0;
    for (const c of cells.slice(0, 40)) {
      const [x, y] = c.split(',').map(Number);
      const px = await readScreen([x, y]);
      if (px.r < 40 && px.g < 40 && px.b < 40) blank++;
    }
    check(blank === 0 || cells.length === 0, `${tool}: ${blank} of ${Math.min(40, cells.length)} drawn cells read back dark/empty on screen`);
    note(`${tool}: ${made.length} cells`);
    await ev(`window.__frameling.run('edit.undo')`);
  }
  // The pixel grid turns with the picture: the cells it draws are the cells you paint.
  await ev(`window.__frameling.anim.view({ pixelGrid: true })`);
  await drag('rect', [[11, 11], [18, 16]]);
  await sleep(300);
  fs.writeFileSync(path.join(outDir, `${name.replace(/\W+/g, '-')}-grid.png`), (await win.webContents.capturePage()).toPNG());
  await ev(`window.__frameling.anim.view({ pixelGrid: false })`);
  fs.writeFileSync(path.join(outDir, `${name.replace(/\W+/g, '-')}.png`), (await win.webContents.capturePage()).toPNG());
}

// The reference: the same drag with the camera off (plain pixel grid, same cells).
async function refShape(layerName, tool, pts) {
  const before = new Set(await ev(`window.__px.cells(${JSON.stringify(layerName)})`));
  // Flat means stage = view, so the pointer position is simply the stage position: use the first/last as the grid does.
  await ev(`window.__frameling.store().setUi({ tool: ${JSON.stringify(tool)} })`);
  const cam = await ev(`window.__frameling.store().get().ui`);
  const info = await ev(`(() => { const b = document.querySelector('.cv-root').getBoundingClientRect(); const u = window.__frameling.store().get().ui; return [b.left + u.panX, b.top + u.panY, u.zoom]; })()`);
  void cam;
  const pt = (c) => {
    const [mx, my] = cellMid(c[0], c[1]);
    return [Math.round(info[0] + mx * info[2]), Math.round(info[1] + my * info[2])];
  };
  const win0 = pts.map(pt);
  send({ type: 'mouseMove', x: win0[0][0], y: win0[0][1] });
  send({ type: 'mouseDown', x: win0[0][0], y: win0[0][1], button: 'left', clickCount: 1 });
  await sleep(20);
  for (let i = 1; i < win0.length; i++) {
    const [ax, ay] = win0[i - 1];
    const [bx, by] = win0[i];
    for (let k = 1; k <= 6; k++) {
      send({ type: 'mouseMove', x: Math.round(ax + ((bx - ax) * k) / 6), y: Math.round(ay + ((by - ay) * k) / 6), modifiers: ['leftButtonDown'] });
      await sleep(8);
    }
  }
  send({ type: 'mouseUp', x: win0[win0.length - 1][0], y: win0[win0.length - 1][1], button: 'left', clickCount: 1 });
  await sleep(150);
  const after = await ev(`window.__px.cells(${JSON.stringify(layerName)})`);
  return after.filter((c) => !before.has(c));
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 10 * 60 * 1000);
  try {
    await startApp();
    await scenario('turned 30 degrees and zoomed 1.5', { x: 128, y: 128, zoom: 1.5, rotation: 30 }, 0);
    await scenario('turned 90 degrees', { x: 128, y: 128, zoom: 1, rotation: 90 }, 0);
    await scenario('turned 25 degrees on a far layer (depth 1)', { x: 140, y: 120, zoom: 2, rotation: 25 }, 1);
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const n of r.notes) console.log(`       . ${n}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`console errors: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
  console.log(`${results.length - bad.length} of ${results.length} passed. Output: ${outDir}`);
  process.exit(bad.length ? 1 : 0);
})();
