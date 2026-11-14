// Runs the REAL built app (dist/main/main.cjs, both windows and the message port between them) inside this process, so a
// harness can open the second window and drive both pages. Shared by popout.cjs (checks, clips, pictures) and
// scripts/perf/popout.cjs (frame rate). Run inside xvfb, never on the desktop.
const electron = require('electron');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];

// The app's own windows, with two changes: the drawing page opens with the ?debug hooks, and nothing is throttled when it is
// not focused (there is no window manager in xvfb, so nothing ever is).
const Orig = electron.BrowserWindow;
class Win extends Orig {
  constructor(o = {}) {
    super({ ...o, webPreferences: { ...(o.webPreferences || {}), backgroundThrottling: false } });
    windows.push(this);
  }
  loadFile(p, opts = {}) {
    if (/renderer[\\/]index\.html$/.test(p)) opts = { ...opts, query: { ...(opts.query || {}), debug: '1', perf: '1' } };
    return super.loadFile(p, opts);
  }
}
const patched = new Proxy(electron, { get: (t, k) => (k === 'BrowserWindow' ? Win : t[k]) });
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron' ? patched : load.call(this, request, ...rest);
};

/** Boots the app with a fresh data folder. Resolves with helpers once the drawing window has loaded. */
async function boot({ theme = 'dark', width = 1000, height = 880 } = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-popout-'));
  electron.app.setPath('userData', data);
  process.env.FRAMELING_CRASH_MARKER = '0';
  require(path.join(root, 'dist/main/main.cjs'));
  await electron.app.whenReady();
  let main = null;
  for (let i = 0; i < 100 && !main; i++) {
    main = windows.find((w) => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL()));
    if (!main) await sleep(100);
  }
  if (!main) throw new Error('the drawing window never opened');
  const wc = main.webContents;
  main.setBounds({ x: 0, y: 0, width, height });
  const js = (code, w = main) => w.webContents.executeJavaScript(code);
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      if (await js('!!window.__frameling && !!document.querySelector(".cv-root")').catch(() => false)) return;
      await sleep(150);
    }
    throw new Error('the page never got ready');
  };
  await ready();
  // Preferences and the two remembered answers, then a reload so they are in force from the start (this also checks that a reload
  // of the drawing window does not break the link, since the picture window is opened after it).
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', lightTheme: 'paper-and-honey', showWelcome: false, showTips: false, firstDrawn: true, showQuill: false };
  const choices = { 'workspace.follow': 'never', 'popout.camera': 'camera', 'popout.marks': 'hide' };
  await js(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify(choices))}); location.reload()`);
  await sleep(500);
  await ready();
  const popWin = () => windows.find((w) => !w.isDestroyed() && /popout\.html/.test(w.webContents.getURL()));
  return { electron, main, js, wc, sleep, windows, popWin, data, ready };
}

/** Waits until the picture window exists and has painted something (its page marks itself ready). */
async function popReady(h, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const w = h.popWin();
    if (w && (await h.js('!!document.querySelector("[data-testid=\\"popout.root\\"][data-ready]")', w).catch(() => false))) return w;
    await sleep(100);
  }
  throw new Error('the picture window never showed a picture');
}

/** A document big enough to be worth playing: frames x layers of strokes. (The same sort the perf harness builds.) */
const MKDOC = `(() => {
  const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let idn = 0; const id = (p) => p + '-' + ++idn;
  const BRUSH = { size: 10, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
  const COLORS = ['#1d1b26', '#ff6f91', '#5ab8ff', '#4fd1a5', '#ffc94a', '#9b7bff'];
  function stroke(r, w, h, n) { let x = r() * w, y = r() * h, a = r() * 6.28; const points = []; for (let i = 0; i < n; i++) { points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, p: 0.25 + 0.6 * r() }); a += (r() - 0.5) * 0.9; const step = 5 + r() * 9; x = Math.min(w - 2, Math.max(2, x + Math.cos(a) * step)); y = Math.min(h - 2, Math.max(2, y + Math.sin(a) * step)); } return { id: id('sh'), type: 'stroke', points, brush: BRUSH, color: COLORS[Math.floor(r() * COLORS.length)], opacity: 1 }; }
  window.__mkDoc = ({ width = 1280, height = 720, fps = 24, frames = 1, layers = 1, strokesPer = 50, pts = 12, seed = 7 }) => {
    const r = prng(seed);
    const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'Popout test', width, height, fps, length: frames, background: '#ffffff', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
    for (let l = 0; l < layers; l++) {
      const layer = { id: id('l'), name: 'L' + l, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
      for (let f = 0; f < frames; f++) { const d = { id: id('dr'), kind: 'vector', shapes: [] }; for (let s = 0; s < strokesPer; s++) d.shapes.push(stroke(r, width, height, pts)); doc.drawings[d.id] = d; layer.cels.push({ id: id('c'), start: f, length: 1, drawingId: d.id }); }
      doc.layers.push(layer);
    }
    return doc;
  };
  return true;
})()`;

module.exports = { boot, popReady, sleep, MKDOC, root };
