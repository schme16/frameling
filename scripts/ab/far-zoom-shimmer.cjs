// Records the pen-up shimmer at a far-out zoom that lands exactly on screen pixel middles (30%): a pencil stroke is held,
// then let go, and the canvas is captured the whole time. Run it once per renderer (before = the old build, after = the
// fix) and per theme, inside xvfb; far-zoom-shimmer.sh does all four and encodes them.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/far-zoom-shimmer.cjs <outDir> --renderer <dir> --theme dark [--zoom 0.3]
//
// Writes <outDir>/f0000.png... (the drawing and a margin, 300 x 246) with list.txt (for ffmpeg's concat), phases.json (when
// the stroke was held and when it was let go), and held.png / done.png (the last frame held and the first after pen-up).
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('far-zoom-shimmer.cjs'));
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const rendererDir = path.resolve(opt('renderer', path.join(__dirname, '../../dist/renderer')));
const theme = opt('theme', 'dark');
const zoom = Number(opt('zoom', '0.3'));
const outDir = path.resolve(argv[0]);
const { sleep, mockMain, makeWindow } = require('../docs/steps.cjs');

const MAKE = `(() => {
  const F = window.__frameling;
  F.template('blank-pixel');
  const S = F.store();
  const W = 600, H = 420;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    px[o] = (x * 5) & 255; px[o + 1] = (y * 3) & 255; px[o + 2] = ((x ^ y) * 7) & 255;
    px[o + 3] = 255;
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
  S.setUi({ activeLayerId: layer.id, frame: 0, color: '#ffffff' });
  F.run('view.fit');
  return true;
})()`;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  mockMain(ipcMain);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const win = makeWindow(BrowserWindow, 1280, 800);
  const ev = (js) => win.webContents.executeJavaScript(js, true);
  const send = (e) => win.webContents.sendInputEvent(e);
  const url = { query: { debug: '1' } };
  await win.loadFile(path.join(rendererDir, 'index.html'), url);
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, showTips: false, onboarded: true };
  await ev(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true;`);
  await win.loadFile(path.join(rendererDir, 'index.html'), url);
  await sleep(3000);
  await ev(MAKE);
  await ev(`__frameling.pen.setTool('pencil', { stabilizer: 0 })`);
  // A thick pencil, so the stroke shows up in a picture shrunk to 30%.
  await ev(`window.__frameling.store().setUi({ brush: { ...window.__frameling.store().get().ui.brush, size: 14 } })`);
  await sleep(500);
  const box = await ev(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  // The drawing in the middle of the view on a whole-pixel pan, as the pixel-live harness does.
  const panX = Math.round((box.w - 600 * zoom) / 2);
  const panY = Math.round((box.h - 420 * zoom) / 2);
  await ev(`window.__frameling.store().setUi({ tool: 'pencil', zoom: ${zoom}, panX: ${panX}, panY: ${panY} })`);
  await sleep(500);
  // A crop of the drawing with a margin, in window coordinates, made even.
  const dw = Math.round(600 * zoom), dh = Math.round(420 * zoom);
  const crop = { x: Math.round(box.x + panX - 60), y: Math.round(box.y + panY - 60), width: dw + 120, height: dh + 120 };
  crop.width += crop.width % 2;
  crop.height += crop.height % 2;

  const frames = [];
  let live = true;
  const t0 = Date.now();
  const grab = (async () => {
    while (live) {
      const img = await win.webContents.capturePage(crop);
      frames.push({ t: Date.now() - t0, png: img.toPNG() });
    }
  })();
  const mark = {};
  await sleep(1000);
  // A stroke across several tiles (a tile is 128 art pixels), going over the picture.
  const cx = Math.round(box.x + box.w / 2), cy = Math.round(box.y + box.h / 2);
  const span = 128 * zoom * 1.8;
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([Math.round(cx - span + (2 * span * i) / 40), Math.round(cy + Math.sin(i / 6) * 90 * zoom)]);
  mark.down = Date.now() - t0;
  send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
  send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) {
    send({ type: 'mouseMove', x: pts[i][0], y: pts[i][1], modifiers: ['leftButtonDown'] });
    await sleep(40);
  }
  await sleep(1200);
  mark.up = Date.now() - t0;
  const l = pts[pts.length - 1];
  send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
  await sleep(1500);
  mark.end = Date.now() - t0;
  live = false;
  await grab;

  // Frames, with how long each stays on screen. The last frame before pen-up and the first one after it are kept apart.
  let list = '';
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, '0')}.png`;
    fs.writeFileSync(path.join(outDir, name), f.png);
    const dur = ((frames[i + 1] ? frames[i + 1].t : mark.end) - f.t) / 1000;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(3)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, '0')}.png'\n`;
  fs.writeFileSync(path.join(outDir, 'list.txt'), list);
  const lastHeld = [...frames].reverse().find((f) => f.t < mark.up - 100);
  const firstDone = frames.find((f) => f.t > mark.up + 300);
  fs.writeFileSync(path.join(outDir, 'held.png'), lastHeld.png);
  fs.writeFileSync(path.join(outDir, 'done.png'), firstDone.png);
  fs.writeFileSync(path.join(outDir, 'phases.json'), JSON.stringify({ ...mark, frames: frames.length, crop, zoom, theme }));
  console.log(`recorded ${frames.length} frames, pen up at ${mark.up} ms, ${theme}`);
  win.destroy();
  app.quit();
});
