// End-to-end check of the sparse live preview of a pixel stroke, in the real app with real mouse events. While a stroke is
// held down the canvas shows the old drawing with only the touched 128 x 128 tiles drawn live; once it is let go the
// normal picture is drawn. The two must be the same, pixel for pixel, at every zoom (including ones that put tile edges
// between screen pixels), for painting and for erasing (which lowers alpha: the live tile has to replace the old picture,
// not lie over it). The far-out zooms that land exactly on screen pixel middles (30%, 15%) are in the list and held to the same standard (see src/canvas/livePixels.ts), and so is the Gradient tool, which paints through the same live preview. Undo and redo are exact at every zoom.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixel-live.cjs [outDir]
//
// Exits non-zero when anything differs.
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
const argv = process.argv.slice(2).filter((a) => !a.endsWith('pixel-live.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-pxlive-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const send = (e) => win.webContents.sendInputEvent(e);
const failures = [];

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(process.env.PIXEL_LIVE_RENDERER || path.join(root, 'dist/renderer'), 'index.html')).href + '?debug=1';
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
      if (await ev('!!window.__frameling')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
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

/** A 600 x 420 pixel drawing that fills the grid, half see-through in places, so painting and erasing both show. */
const MAKE = `(() => {
  const F = window.__frameling;
  F.template('blank-pixel');
  const S = F.store();
  const W = 600, H = 420;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    px[o] = (x * 5) & 255; px[o + 1] = (y * 3) & 255; px[o + 2] = ((x ^ y) * 7) & 255;
    px[o + 3] = ((x >> 3) + (y >> 3)) % 5 === 0 ? 90 : 255;
  }
  S.update('big', (d) => {
    d.width = W; d.height = H;
    const layer = d.layers.find((l) => l.kind === 'pixel');
    layer.pixelSize = 1;
    const dr = { id: 'live-full', kind: 'pixel', width: W, height: H, pixels: px };
    d.drawings[dr.id] = dr;
    layer.cels = [{ id: 'live-cel', start: 0, length: 1, drawingId: dr.id }];
    d.camera = undefined;
  });
  const layer = S.get().doc.layers.find((l) => l.kind === 'pixel');
  S.setUi({ activeLayerId: layer.id, frame: 0, color: '#ff2020' });
  F.run('view.fit');
  return true;
})()`;

async function shotPng(name) {
  const r = await ev(`(() => { const b = document.querySelector('.cv-root').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }; })()`);
  fs.writeFileSync(path.join(outDir, name), (await win.webContents.capturePage(r)).toPNG());
}

async function shot() {
  // The canvas area only, as raw bytes.
  const r = await ev(`(() => { const b = document.querySelector('.cv-root').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }; })()`);
  const img = await win.webContents.capturePage(r);
  return img.toBitmap();
}

async function stroke(tool, zoom, label) {
  const box = await ev(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  // Zooming out keeps the pan, which leaves a small drawing in the corner and the stroke (made round the middle of the view)
  // off it altogether. So from there the drawing is put in the middle, on a whole-pixel pan like the zoomed-in runs.
  const centre = zoom < 1 ? `, panX: ${Math.round((box.w - 600 * zoom) / 2)}, panY: ${Math.round((box.h - 420 * zoom) / 2)}` : '';
  // The gradient runs from Paint to Back, so give it a Back colour that differs from the paint.
  await ev(`window.__frameling.store().setUi({ tool: ${JSON.stringify(tool)}, zoom: ${zoom}${centre}${tool === 'gradient' ? ", fillColor: '#2030ff'" : ''} })`);
  await sleep(300);
  const before = await shot();
  const cx = Math.round(box.x + box.w / 2);
  const cy = Math.round(box.y + box.h / 2);
  // A stroke across several tiles (a tile is 128 art pixels), going over the old picture.
  const span = Math.min(box.w / 2 - 30, 128 * zoom * 1.8);
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([Math.round(cx - span + (2 * span * i) / 40), Math.round(cy + Math.sin(i / 6) * Math.min(box.h / 3, 90 * zoom))]);
  send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
  send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) {
    send({ type: 'mouseMove', x: pts[i][0], y: pts[i][1], modifiers: ['leftButtonDown'] });
    await sleep(12);
  }
  await sleep(250);
  const held = await shot();
  if (process.env.PIXEL_LIVE_PNG) await shotPng(`${label.replace(/\W+/g, '-')}-held.png`);
  const l = pts[pts.length - 1];
  send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
  await sleep(400);
  const done = await shot();
  if (process.env.PIXEL_LIVE_PNG) await shotPng(`${label.replace(/\W+/g, '-')}-done.png`);
  // The finished picture is made from the old one plus the touched tiles; a copy of the pixels (a new array) is drawn the plain way, from scratch. They must be the same.
  await ev(`window.__frameling.store().update('rebuild', (d) => { for (const k of Object.keys(d.drawings)) { const x = d.drawings[k]; if (x.kind === 'pixel' && x.pixels.length) x.pixels = new Uint8ClampedArray(x.pixels); } })`);
  await sleep(400);
  const scratch = await shot();
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(200);
  let penUp = 0;
  for (let i = 0; i < scratch.length; i += 4) if (scratch[i] !== done[i] || scratch[i + 1] !== done[i + 1] || scratch[i + 2] !== done[i + 2]) penUp++;
  console.log(`${penUp ? 'FAIL' : 'ok  '} ${label}: ${penUp} screen pixels differ between the finished picture and one rebuilt from the pixels`);
  if (penUp) failures.push(label + ' (rebuild)');
  // The stroke has to have drawn something, or every comparison below is of two blank edits.
  let drew = 0;
  for (let i = 0; i < done.length; i += 4) if (done[i] !== before[i] || done[i + 1] !== before[i + 1] || done[i + 2] !== before[i + 2]) drew++;
  console.log(`${drew ? 'ok  ' : 'FAIL'} ${label}: the stroke changed ${drew} screen pixels`);
  if (!drew) failures.push(label + ' (nothing drawn)');
  // The Gradient tool draws its guide line and two handles over the picture while it is held; they are not the picture, so
  // the screen pixels within 14 of the drag line (the handles are about 10 across) are left out of the comparison.
  const w0 = Math.round(box.w);
  const a = { x: pts[0][0] - box.x, y: pts[0][1] - box.y };
  const z = { x: l[0] - box.x, y: l[1] - box.y };
  const guide = (px, py) => {
    if (tool !== 'gradient') return false;
    const dx = z.x - a.x, dy = z.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)) < 14;
  };
  let diff = 0;
  let first = -1;
  for (let i = 0; i < held.length; i += 4) {
    if (held[i] !== done[i] || held[i + 1] !== done[i + 1] || held[i + 2] !== done[i + 2]) {
      const p = i / 4;
      if (guide(p % w0, Math.floor(p / w0))) continue;
      diff++;
      if (first < 0) first = p;
    }
  }
  // Held and finished must be the same pixels at every zoom, the far-out ones that land exactly on screen pixel middles (30%, 15%) included.
  const ok = diff === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${diff} screen pixels differ between the held stroke and the finished one${first >= 0 ? ` (first at ${first})` : ''}`);
  if (!ok || diff) {
    if (!ok) failures.push(label);
    // Where they differ: the box round the differing screen pixels, and both pictures saved for a look.
    const w = Math.round(box.w);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < held.length; i += 4) {
      if (held[i] !== done[i] || held[i + 1] !== done[i + 1] || held[i + 2] !== done[i + 2]) {
        const p = i / 4, x = p % w, y = Math.floor(p / w);
        if (guide(x, y)) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    console.log(`     differing box: x ${x0}..${x1}, y ${y0}..${y1}`);
  }
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(300);
  // Undo gives back the old picture (the cached picture of the new drawing was made from it, so it has to be made again).
  const undone = await shot();
  let back = 0;
  for (let i = 0; i < undone.length; i += 4) if (undone[i] !== before[i] || undone[i + 1] !== before[i + 1] || undone[i + 2] !== before[i + 2]) back++;
  const strict = true;
  console.log(`${back && strict ? 'FAIL' : 'ok  '} ${label}: ${back} screen pixels differ between before the stroke and after undo`);
  if (back && strict) failures.push(label + ' (undo)');
  await ev(`window.__frameling.run('edit.redo')`);
  await sleep(300);
  const redone = await shot();
  let again = 0;
  for (let i = 0; i < redone.length; i += 4) if (redone[i] !== done[i] || redone[i + 1] !== done[i + 1] || redone[i + 2] !== done[i + 2]) again++;
  console.log(`${again && strict ? 'FAIL' : 'ok  '} ${label}: ${again} screen pixels differ between the finished stroke and after redo`);
  if (again && strict) failures.push(label + ' (redo)');
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(200);
}

(async () => {
  await startApp();
  await ev(MAKE);
  // Every drawing tool starts with a gentle stabilizer (12%), which keeps the brush a few screen pixels behind the pointer
  // until the pen is lifted, so a held stroke is rightly shorter than the finished one. This harness compares the two
  // exactly, so it turns the stabilizer off for the tools it draws with.
  for (const t of ['pencil', 'eraser']) await ev(`__frameling.pen.setTool(${JSON.stringify(t)}, { stabilizer: 0 })`);
  await sleep(600);
  // The pencil paints; the eraser takes alpha away (the live tile must replace the old picture there).
  // PIXEL_LIVE_ZOOMS=0.3,0.15 and PIXEL_LIVE_TOOLS=pencil narrow a run to what is being looked at.
  const zooms = process.env.PIXEL_LIVE_ZOOMS ? process.env.PIXEL_LIVE_ZOOMS.split(',').map(Number) : [1, 1.5, 1.25, 1.3719, 2.7, 4.5, 0.683712345, 0.5, 0.35, 0.2837, 0.1234, 0.3, 0.15, 0.25, 0.125];
  const tools = process.env.PIXEL_LIVE_TOOLS ? process.env.PIXEL_LIVE_TOOLS.split(',') : ['pencil', 'eraser', 'gradient'];
  for (const zoom of zooms) {
    for (const tool of tools) await stroke(tool, zoom, `${tool} at ${Math.round(zoom * 100)}%`);
  }
  console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'all the same');
  app.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
