// Pictures for the brush-size A/B: a stroke at the old 120 px cap and one at the new top of the slider on a big canvas, the Size
// control at the top of its range, and a bigger size typed into the number box. Both themes.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/brush-size.cjs <outDir> [distDir]
//
// Writes <outDir>/raw-{old,top,mid}-{dark,light}.png (the canvas), raw-slider-*, raw-typing-*, raw-typed-* (the Size control).
// scripts/ab/brush-size-sheets.py joins and captions them.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('brush-size.cjs'));
const DIST = distArg || path.join(__dirname, '../../dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-bsab-')));
fs.mkdirSync(outDir, { recursive: true });
const W = 2000;
const H = 1500;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1400, height: 900, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=ab'] } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const send = (e) => wc.sendInputEvent(e);
  const index = path.join(DIST, 'renderer/index.html');
  const shot = async (name, rect) => fs.writeFileSync(path.join(outDir, `raw-${name}.png`), (await wc.capturePage(rect)).toPNG());
  const rectOf = (sel) => js(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };`);
  for (const mode of ['dark', 'light']) {
    await wc.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: mode, showWelcome: false, onboarded: true }))}); return true`);
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1500);
    for (let i = 0; i < 3; i++) {
      send({ type: 'keyDown', keyCode: 'Escape' });
      send({ type: 'keyUp', keyCode: 'Escape' });
      await sleep(120);
    }
    // A big canvas with nothing on it, then one stroke at a size.
    const stage = (size) => js(`
      const F = window.__frameling;
      const pts = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push({ x: Math.round(260 + t * 1480), y: Math.round(750 + Math.sin(t * Math.PI * 2) * 420), p: 0.5 }); }
      const brush = { size: ${size}, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
      const doc = { format: 'frameling', version: 1, lineage: true, id: 'doc-ab', name: 'ab', width: ${W}, height: ${H}, fps: 24, length: 1, background: '#fffaf0', clips: [], markers: [], swatches: [],
        layers: [{ id: 'l1', name: 'Ink', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 1, drawingId: 'd1' }] }],
        drawings: { d1: { id: 'd1', kind: 'vector', shapes: [{ id: 'sh1', type: 'stroke', points: pts, brush, color: '#d6204a', opacity: 1 }] } } };
      F.store().load(doc);
      const b0 = F.store().get().ui.brush;
      const nb = Object.assign({}, b0, brush);
      delete nb.tip;
      F.store().setUi({ tool: 'brush', activeLayerId: 'l1', frame: 0, selection: [], brush: nb });
      F.run('view.fit');
      return true;`);
    for (const [name, size] of [['old', 120], ['mid', 800], ['top', 2200]]) {
      await stage(size);
      await sleep(900);
      await shot(`${name}-${mode}`, await rectOf('.cv-root'));
      if (name === 'top') {
        await js(`window.__frameling.overlays.closeSheet && window.__frameling.overlays.closeSheet(); return true`);
        await sleep(300);
        await shot(`slider-${mode}`, await rectOf('.cv-options'));
      }
    }
    // Type a bigger number into the box: click the number, type, Enter.
    await stage(2200);
    await sleep(500);
    const b = await js(`const r = document.querySelector('.cv-options .cv-slider-value').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
    send({ type: 'mouseMove', x: b.x, y: b.y });
    await sleep(200);
    send({ type: 'mouseDown', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    send({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(300);
    await wc.insertText('9000');
    await sleep(300);
    await shot(`typing-${mode}`, await rectOf('.cv-options'));
    send({ type: 'keyDown', keyCode: 'Enter' });
    send({ type: 'keyUp', keyCode: 'Enter' });
    await sleep(500);
    const got = await js(`return window.__frameling.store().get().ui.brush.size;`);
    console.log(mode, 'brush size after typing:', got);
    await shot(`typed-${mode}`, await rectOf('.cv-options'));
    console.log(`shot ${mode}`);
  }
  app.exit(0);
});
