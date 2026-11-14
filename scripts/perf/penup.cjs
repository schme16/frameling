// Pen-up cost on a big pixel drawing, with a CPU profile of the release. Real app, real mouse events.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/penup.cjs [--size 4096] [--laps 4] [--profile out.cpuprofile]
//
// Prints, per lap, how long the page took from the mouse-up event to the next task (a setTimeout(0) probe), and with
// --profile the top functions by self time and by inclusive time during the release.
const { app, BrowserWindow } = require('electron');
// A speed claim: the real card, and a failure if it did not come up (scripts/lib/gpu.cjs).
const gpuMod = require('../lib/gpu.cjs');
gpuMod.use('card');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2).filter((a) => !a.endsWith('penup.cjs'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const size = +opt('size', 4096);
const laps = +opt('laps', 4);
const profileOut = opt('profile', '');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-penup-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const send = (e) => win.webContents.sendInputEvent(e);

async function start() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpuMod.confirmOrExit(win);
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
        await win.loadURL(process.env.FRAMELING_DEV_URL);
        await sleep(2500);
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('page never ready');
}

const MAKE = `(() => {
  const F = window.__frameling;
  F.template('blank-pixel');
  const S = F.store();
  const W = ${size}, H = ${size};
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const o = i * 4; px[o] = (i * 7) & 255; px[o + 1] = (i >> 6) & 255; px[o + 2] = 90; px[o + 3] = 255; }
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
  S.setUi({ activeLayerId: layer.id, frame: 0, color: '#ff2020', tool: 'pencil' });
  F.run('view.fit');
  return true;
})()`;

function analyse(prof) {
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = prof.timeDeltas;
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) self.set(prof.samples[i], (self.get(prof.samples[i]) || 0) + (dt[i] || 0));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const bySelf = new Map();
  const byIncl = new Map();
  for (const [id, t] of self) {
    const n = nodes.get(id);
    bySelf.set(key(n), (bySelf.get(key(n)) || 0) + t);
    const seen = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) {
      const k = key(nodes.get(c));
      if (seen.has(k)) continue;
      seen.add(k);
      byIncl.set(k, (byIncl.get(k) || 0) + t);
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)} ms  ${k}`).join('\n');
  console.log('--- self time\n' + top(bySelf, 25));
  console.log('--- inclusive time\n' + top(byIncl, 45));
}

(async () => {
  await start();
  await ev(MAKE);
  await sleep(1500);
  for (let i = 0; i < 2; i++) { send({ type: 'keyDown', keyCode: 'Escape' }); send({ type: 'keyUp', keyCode: 'Escape' }); await sleep(150); }
  const box = await ev(`(() => { const r = document.querySelector('.cv-root').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const results = [];
  for (let lap = 0; lap < laps; lap++) {
    const cx = Math.round(box.x + box.w / 2 + lap * 20);
    const cy = Math.round(box.y + box.h / 2);
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push([cx + i * 3, cy + Math.round(Math.sin(i / 5) * 12)]);
    send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
    send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
    for (let i = 1; i < pts.length; i++) { send({ type: 'mouseMove', x: pts[i][0], y: pts[i][1], modifiers: ['leftButtonDown'] }); await sleep(12); }
    await sleep(300);
    await ev(`(() => {
      window.__pu = { up: 0, done: 0 };
      window.addEventListener('pointerup', (e) => { window.__pu.up = performance.now(); setTimeout(() => { window.__pu.done = performance.now(); }, 0); }, { capture: true, once: true });
      return true;
    })()`);
    const dbg = win.webContents.debugger;
    if (profileOut && lap === laps - 1) {
      dbg.attach('1.3');
      await dbg.sendCommand('Profiler.enable');
      await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 100 });
      await dbg.sendCommand('Profiler.start');
    }
    const l = pts[pts.length - 1];
    send({ type: 'mouseUp', x: l[0], y: l[1], button: 'left', clickCount: 1 });
    await sleep(700);
    if (profileOut && lap === laps - 1) {
      const { profile } = await dbg.sendCommand('Profiler.stop');
      fs.writeFileSync(profileOut, JSON.stringify(profile));
      analyse(profile);
    }
    const r = await ev(`({ handler: window.__pu.done - window.__pu.up })`);
    // first frame after release
    results.push(r.handler);
    console.log(`lap ${lap}: pen-up to next task ${r.handler.toFixed(1)} ms`);
    await ev('window.__frameling.store().undo()');
    await sleep(300);
  }
  console.log('median', [...results].sort((a, b) => a - b)[Math.floor(results.length / 2)].toFixed(1), 'ms');
  app.exit(0);
})().catch((e) => { console.error(e); app.exit(1); });
