// What it costs to have Quill's room open, with and without your work in it. Real app, real panel, Chromium's own
// counters (script time, task time, layouts, style recalculations, heap) read over a stretch of idle seconds, plus what
// it costs to make the picture at save time and how much room the kept pictures take.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/quillroom.cjs [--seconds 20] [--rounds 3]
//
// Three states, taken in turn each round: the panel closed, the room open and empty, the room open with three
// drawings on the wall and a sprite on the floor. Pottering is left ON (it is the whole cost of the room), with focus
// forced on so the clock runs as it does when you are looking at the window.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
require('../lib/gpu.cjs').use('software');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2).filter((a) => !a.endsWith('quillroom.cjs'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const seconds = +opt('seconds', 20);
const rounds = +opt('rounds', 3);
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-quillroom-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const Q = 'window.__framelingQuillPet';

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
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false, showQuill: true })); localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never' })); true`);
        await win.loadURL(process.env.FRAMELING_DEV_URL);
        await sleep(2500);
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('the app did not come up');
}

const dbg = () => win.webContents.debugger;
const metrics = async () => Object.fromEntries((await dbg().sendCommand('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure() {
  const a = await metrics();
  await sleep(seconds * 1000);
  const b = await metrics();
  const d = (k) => b[k] - a[k];
  return { scriptMs: d('ScriptDuration') * 1000, taskMs: d('TaskDuration') * 1000, layouts: d('LayoutCount'), recalcs: d('RecalcStyleCount'), heapKB: (b.JSHeapUsedSize - a.JSHeapUsedSize) / 1024 };
}

(async () => {
  await start();
  dbg().attach('1.3');
  await dbg().sendCommand('Performance.enable');
  // As if the window has focus, so the room's clock runs as it does when you look at it.
  await dbg().sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await ev(`__frameling.template('bouncing-ball'); true`);
  await sleep(800);

  const states = {
    // Another tab on the same rail on top, so his room is not on screen at all.
    'panel closed': async () => { await ev(`${Q}.made.clear(); __frameling.showPanel('quests'); true`); },
    'room open, empty': async () => { await ev(`${Q}.made.clear(); __frameling.showPanel('quill-pet'); true`); },
    'room open, your work in it': async () => {
      await ev(`${Q}.made.clear(); __frameling.showPanel('quill-pet'); true`);
      for (const f of [0, 6, 12]) await ev(`${Q}.made.fromOpen('Drawing ${f}', ${f})`);
      await ev(`__frameling.template('hero-sprites'); true`);
      await sleep(600);
      await ev(`${Q}.made.fromOpen('Hero', 0)`);
      await ev(`__frameling.template('bouncing-ball'); true`);
    },
  };
  const results = {};
  for (let r = 0; r < rounds; r++) {
    for (const [name, set] of Object.entries(states)) {
      await set();
      await sleep(1500);
      (results[name] ||= []).push(await measure());
    }
  }
  console.log(`\nIdle for ${seconds} s, median of ${rounds} rounds (Chromium counters, pottering on, focus forced on)\n`);
  for (const [name, runs] of Object.entries(results)) {
    const m = (k) => median(runs.map((x) => x[k]));
    console.log(`${name.padEnd(28)} script ${m('scriptMs').toFixed(1).padStart(7)} ms   tasks ${m('taskMs').toFixed(1).padStart(7)} ms   layouts ${String(m('layouts')).padStart(4)}   style recalcs ${String(m('recalcs')).padStart(4)}   heap ${m('heapKB').toFixed(0).padStart(6)} KB`);
  }

  // What the room is made of, and what it keeps.
  await states['room open, your work in it']();
  await sleep(1000);
  const dom = await ev(`(() => { const r = document.querySelector('.qp-room'); return { nodes: r ? r.querySelectorAll('*').length : 0, images: r ? r.querySelectorAll('img').length : 0, timers: 0 }; })()`);
  console.log('\nThe room in the DOM:', JSON.stringify(dom));
  const save = await ev(`(async () => { const t = []; for (let i = 0; i < 10; i++) { const a = performance.now(); await ${Q}.made.fromOpen('t' + i, 6); t.push(performance.now() - a); } t.sort((x, y) => x - y); return { medianMs: t[5], maxMs: t[9] }; })()`);
  console.log('Making one picture at save time (96 px):', JSON.stringify(save));
  const keep = await ev(`(() => { const raw = localStorage.getItem('frameling.quill.made.v1') || ''; const n = JSON.parse(raw || '[]').length; return { items: n, bytes: raw.length, bytesEach: n ? Math.round(raw.length / n) : 0 }; })()`);
  console.log('What is kept (localStorage):', JSON.stringify(keep));
  app.quit();
})().catch((e) => { console.error(e); app.exit(1); });
