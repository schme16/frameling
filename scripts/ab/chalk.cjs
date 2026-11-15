// Pictures for the chalk and charcoal investigation: each starter brush that leans on the chalk or charcoal tip, drawn as
// four test marks in one strip: a firm stroke, a light stroke, a pressure ramp, and three overlapping passes. Both themes.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/chalk.cjs <outDir> <brushesJson> <label> [distDir]
//
// <brushesJson> is a list of { id, name, brush } (the brush settings, tip included). Writes <outDir>/raw-<label>-<id>-<theme>.png.
// scripts/ab/chalk-sheets.py joins and captions them. A brush's `ink` field, when it has one, overrides the pencil colour.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, brushesFile, label, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('chalk.cjs'));
const DIST = distArg || path.join(__dirname, '../../dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-chalk-')));
fs.mkdirSync(outDir, { recursive: true });
const brushes = JSON.parse(fs.readFileSync(brushesFile, 'utf8'));
const W = 1200;
const H = 190;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1600, height: 900, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=ab'] } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const send = (e) => wc.sendInputEvent(e);
  const index = path.join(DIST, 'renderer/index.html');
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
    await js(`window.__frameling.run('view.hidePanels'); return true`);
    await sleep(500);
    const paper = mode === 'dark' ? '#1b1b22' : '#fffaf0';
    const defaultInk = mode === 'dark' ? '#ece8e0' : '#26242c';
    for (const b of brushes) {
      const ink = (b.ink && (mode === 'dark' ? b.ink.dark : b.ink.light)) || defaultInk;
      await js(`
        const F = window.__frameling;
        const brush = ${JSON.stringify(b.brush)};
        const wave = (x0, x1, y, amp, pf) => { const pts = []; for (let i = 0; i <= 36; i++) { const t = i / 36; pts.push({ x: Math.round(x0 + t * (x1 - x0)), y: Math.round(y + Math.sin(t * Math.PI * 2) * amp), p: pf(t) }); } return pts; };
        const mk = (id, points) => ({ id, type: 'stroke', points, brush, color: ${JSON.stringify(ink)}, opacity: 1 });
        const shapes = [
          mk('s1', wave(25, 275, 95, 14, () => 0.9)),
          mk('s2', wave(325, 575, 95, 14, () => 0.25)),
          mk('s3', wave(625, 875, 95, 14, (t) => 0.05 + 0.95 * t)),
          // three passes on the same patch: two crossing, then back over the first
          mk('s4', wave(925, 1175, 70, 6, () => 0.5)),
          mk('s5', Array.from({ length: 25 }, (_, k) => ({ x: Math.round(985 + k * 5), y: Math.round(38 + k * 4.6), p: 0.5 }))),
          mk('s6', wave(925, 1175, 70, 6, () => 0.5)),
        ];
        const doc = { format: 'frameling', version: 1, lineage: true, id: 'doc-ab', name: 'ab', width: ${W}, height: ${H}, fps: 24, length: 1, background: ${JSON.stringify(paper)}, clips: [], markers: [], swatches: [],
          layers: [{ id: 'l1', name: 'Ink', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'c1', start: 0, length: 1, drawingId: 'd1' }] }],
          drawings: { d1: { id: 'd1', kind: 'vector', shapes } } };
        F.store().load(doc);
        F.store().setUi({ tool: 'select', activeLayerId: 'l1', frame: 0, selection: [], zoom: 1, panX: 30, panY: 30 });
        return true;`);
      await sleep(700);
      const r = await js(`const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };`);
      const img = (await wc.capturePage({ x: r.x + 30, y: r.y + 30, width: W, height: H })).toPNG();
      fs.writeFileSync(path.join(outDir, `raw-${label}-${b.id}-${mode}.png`), img);
    }
    console.log('shot', mode);
  }
  app.exit(0);
});
