// Real mouse drags with the Artboard tool (move, resize, drag out a new one), checking mid-drag and after the drop that
// nothing but the artboards, their names and the tool's own ghost box is painted on the pasteboard: no stale stage-coloured
// rectangle left behind. Runs the built renderer in a hidden window with real input events.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/artboard-drag.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const path = require('node:path');
const { runSteps, sleep, mockMain, makeWindow } = require('../docs/steps.cjs');

const W = 1280;
const H = 800;
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  return !!cond;
};

/** Everything the page says about where the artboards are on screen right now. */
const SCENE = `(() => {
  const s = __frameling.store().get();
  const m = __framelingArtboards.model;
  const root = document.querySelector('.cv-root').getBoundingClientRect();
  const act = m.activeArtboard(s.doc);
  return JSON.stringify({
    root: [root.x, root.y, root.width, root.height],
    boxes: m.boxes(s.doc).map((b) => ({ id: b.id, active: b.id === act.id, x: root.x + s.ui.panX + (b.x - act.x) * s.ui.zoom, y: root.y + s.ui.panY + (b.y - act.y) * s.ui.zoom, w: b.w * s.ui.zoom, h: b.h * s.ui.zoom })),
  });
})()`;

/** Pixels of the pasteboard that should be bare: the canvas area minus every artboard, its name, the drag's own box and the snap chip. */
async function bareCheck(win, label, drag) {
  await sleep(150);
  await win.webContents.capturePage();
  await sleep(150);
  const img = await win.webContents.capturePage();
  const { width, height } = img.getSize();
  const bmp = img.toBitmap();
  const scene = JSON.parse(await win.webContents.executeJavaScript(SCENE));
  const [rx, ry, rw, rh] = scene.root;
  const pad = 28;
  const keep = scene.boxes.map((b) => [b.x - pad, b.y - pad, b.x + b.w + pad, b.y + b.h + pad]);
  if (drag) {
    const x0 = Math.min(drag[0], drag[2]) - pad;
    const y0 = Math.min(drag[1], drag[3]) - pad;
    keep.push([x0, y0, Math.max(drag[0], drag[2]) + pad, Math.max(drag[1], drag[3]) + pad]);
  }
  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return [bmp[i + 2], bmp[i + 1], bmp[i]];
  };
  // The reference pasteboard colour: the canvas area's top-left corner.
  const ref = px(Math.round(rx) + 6, Math.round(ry) + 6);
  let bad = 0;
  let first = null;
  for (let y = Math.round(ry) + 10; y < Math.min(height, ry + rh - 70); y += 6) {
    for (let x = Math.round(rx) + 10; x < Math.min(width, rx + rw - 10); x += 6) {
      if (keep.some((k) => x >= k[0] && x <= k[2] && y >= k[1] && y <= k[3])) continue;
      const c = px(x, y);
      // The stage's soft shadow tints the pasteboard a little: allow it, but not a flat rectangle of another colour.
      if (Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) > 60) {
        bad++;
        first ??= [x, y, c];
      }
    }
  }
  check(bad === 0, `${label}: ${bad} pasteboard points are painted (first at ${JSON.stringify(first)}, bare is ${JSON.stringify(ref)})`);
  console.log(`${bad === 0 ? 'ok' : 'FAIL'} ${label}`);
}

const LOAD = (which, extra = '') => ({ eval: `__framelingArtboards.setChoice('workspace.follow', 'never'); true` });

async function main() {
  mockMain(ipcMain);
  const win = makeWindow(BrowserWindow, W, H);
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  const dist = path.join(__dirname, '../../dist/renderer');
  await win.loadFile(path.join(dist, 'index.html'), { query: { debug: '1' } });
  const prefs = { theme: 'dark', look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, showTips: false };
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true;`);
  await win.loadFile(path.join(dist, 'index.html'), { query: { debug: '1' } });
  await sleep(3000);
  const run = (steps) => runSteps(win, steps, { outDir: '/tmp', width: W, height: H });
  const ev = (js) => ({ eval: js });
  const fit = [ev(`__frameling.run('artboards.fitAll'); true`), { wait: 500 }];
  const setup = (which, tweak = '') => [ev(`__framelingArtboards.load('${which}'); ${tweak} __frameling.store().setUi({ tool: 'artboard' }); true`), { wait: 600 }, ...fit];

  // Where things are, so the drags land on the artboards whatever the layout.
  const where = async () => JSON.parse(await win.webContents.executeJavaScript(SCENE)).boxes;

  await run([ev(`__framelingArtboards.setChoice('workspace.follow', 'never'); true`), { wait: 400 }]);
  const variants = [
    ['shots', ''],
    ['mixed', ''],
    ['sprites', ''],
    ['shots with a blend mode', `__frameling.store().update('look', (d) => { d.layers[0].blend = 'multiply'; });`],
  ];
  for (const [name, tweak] of variants) {
    await run(setup(name.split(' ')[0], tweak));
    let boxes = await where();
    const ctr = (b) => [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)];

    // Move: press on the middle artboard and drag up and to the left, checking part-way and after the drop.
    const mid = boxes[1];
    const [cx, cy] = ctr(mid);
    await run([{ down: [cx, cy] }, { held: [cx - 12, cy - 10] }, { held: [cx - 70, cy - 60] }, { held: [cx - 110, cy - 80] }, { wait: 100 }]);
    await bareCheck(win, `${name}: moving an artboard`, null);
    await run([{ held: [cx - 140, cy - 100] }, { up: [cx - 140, cy - 100] }, { wait: 200 }]);
    await bareCheck(win, `${name}: after the move`, null);

    // Resize: the open artboard's top-left handle, dragged out and up.
    boxes = await where();
    const act = boxes.find((b) => b.active);
    const hx = Math.round(act.x);
    const hy = Math.round(act.y);
    await run([{ down: [hx, hy] }, { held: [hx - 8, hy - 8] }, { held: [hx - 40, hy - 30] }, { wait: 100 }]);
    await bareCheck(win, `${name}: resizing from a corner`, [hx - 40, hy - 30, hx + act.w, hy + act.h]);
    await run([{ up: [hx - 40, hy - 30] }, { wait: 200 }]);
    await bareCheck(win, `${name}: after the resize`, null);

    // New: drag out an artboard on empty pasteboard below the others.
    boxes = await where();
    const low = Math.max(...boxes.map((b) => b.y + b.h));
    const sx = Math.round(boxes[0].x + 20);
    const sy = Math.round(low + 40);
    if (sy + 80 < 700) {
      await run([{ down: [sx, sy] }, { held: [sx + 20, sy + 10] }, { held: [sx + 90, sy + 60] }, { wait: 100 }]);
      await bareCheck(win, `${name}: dragging out a new artboard`, [sx, sy, sx + 90, sy + 60]);
      await run([{ up: [sx + 90, sy + 60] }, { wait: 200 }]);
      await bareCheck(win, `${name}: after the new artboard`, null);
    }
  }
  check(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  win.destroy();
}

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  try {
    await main();
  } catch (err) {
    failures.push(`crashed: ${err.stack || err}`);
  }
  console.log(failures.length ? `\n${failures.length} failed:\n- ${failures.join('\n- ')}` : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
