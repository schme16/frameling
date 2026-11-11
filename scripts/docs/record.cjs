// Captures the pictures and short videos used in the in-app help, from the built renderer, in a hidden Electron window.
// Modelled on scripts/shoot.cjs (same steps, real input events) with cropping and frame recording added.
//
//   npx electron scripts/docs/record.cjs <outDir> <steps.json> [--renderer <dir>] [--look cosy] [--theme dark]
//
// The renderer defaults to dist/renderer. Pass --renderer to point at a private `vite build --outDir` so a
// capture never races someone else's build. The steps file is a JSON array:
//   {"eval": "js"}  {"log": "js"} (prints the result)  {"wait": ms}  {"click": [x, y]}  {"key": "g", "mods": ["control"]}
//   {"drag": [[x, y], ...], "steps": 6, "delay": 8, "mods": ["shift"]}   delay is the ms between mouse moves, so slow
//                                                       strokes look drawn; mods are held down through the drag
//   {"shot": "name", "crop": [x, y, w, h]}              PNG of the window (cropped if asked), or "el": "css selector", "pad": 12
//   {"type": "text"}                                    sets the focused input's text (then fires input)
//   {"rec": "name", "crop": [x, y, w, h], "every": 60}  start recording frames in the background
//   {"rec": "stop"}                                     stop, and write frames + a timing list into <outDir>/<name>/
// Frames are stamped as they are captured; encode.sh turns each folder into an H.264 MP4 at the real pace.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('record.cjs'));
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const rendererDir = opt('renderer', path.join(__dirname, '../../dist/renderer'));
const look = opt('look', 'cosy');
const theme = opt('theme', 'dark');
// Extra preferences, as JSON, e.g. --prefs '{"showWelcome":false}'. The theme and look above are always set.
const extraPrefs = JSON.parse(opt('prefs', '{}'));
const [outDir, stepsFile] = argv;
const width = Number(process.env.SHOT_W || 1280);
const height = Number(process.env.SHOT_H || 800);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rec = null;
function startRec(wc, name, crop, every) {
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const r = { dir, stamps: [], running: true, t0: Date.now() };
  r.done = (async () => {
    let n = 0;
    while (r.running) {
      const t = Date.now();
      const img = await wc.capturePage(crop ? { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } : undefined);
      fs.writeFileSync(path.join(dir, `f${String(n).padStart(4, '0')}.png`), img.toPNG());
      r.stamps.push(t - r.t0);
      n++;
      const spent = Date.now() - t;
      if (spent < every) await sleep(every - spent);
    }
  })();
  return r;
}
async function stopRec(r) {
  r.running = false;
  await r.done;
  // ffconcat list: each frame lasts until the next one was taken
  const lines = ['ffconcat version 1.0'];
  r.stamps.forEach((t, i) => {
    const next = r.stamps[i + 1] ?? t + 400;
    lines.push(`file f${String(i).padStart(4, '0')}.png`, `duration ${((next - t) / 1000).toFixed(3)}`);
  });
  lines.push(`file f${String(r.stamps.length - 1).padStart(4, '0')}.png`);
  fs.writeFileSync(path.join(r.dir, 'list.txt'), lines.join('\n') + '\n');
}

async function runSteps(win, steps) {
  const wc = win.webContents;
  const send = (e) => wc.sendInputEvent(e);
  for (const s of steps) {
    if (s.eval) await wc.executeJavaScript(s.eval);
    else if (s.log) console.log(JSON.stringify(await wc.executeJavaScript(s.log)));
    else if (s.wait) await sleep(s.wait);
    else if (s.click) {
      const [x, y] = s.click;
      send({ type: 'mouseMove', x, y });
      await sleep(s.pause ?? 0);
      send({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await sleep(30);
      send({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await sleep(s.after ?? 80);
    } else if (s.move) {
      send({ type: 'mouseMove', x: s.move[0], y: s.move[1] });
      await sleep(s.after ?? 80);
    } else if (s.drag) {
      const pts = s.drag;
      const n = s.steps ?? 6;
      const d = s.delay ?? 8;
      // "mods": ["shift"] holds keys down through the whole drag.
      const mods = s.mods ?? [];
      send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1], modifiers: mods });
      send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1, modifiers: mods });
      await sleep(16);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          send({ type: 'mouseMove', x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t), modifiers: [...mods, 'leftButtonDown'] });
          await sleep(d);
        }
      }
      const [lx, ly] = pts[pts.length - 1];
      send({ type: 'mouseUp', x: lx, y: ly, button: 'left', clickCount: 1, modifiers: mods });
      await sleep(s.after ?? 80);
    } else if (s.key) {
      const modifiers = s.mods ?? [];
      send({ type: 'keyDown', keyCode: s.key, modifiers });
      if (s.key.length === 1) send({ type: 'char', keyCode: s.key, modifiers });
      send({ type: 'keyUp', keyCode: s.key, modifiers });
      await sleep(s.after ?? 80);
    } else if (s.rec === 'stop') {
      if (rec) await stopRec(rec);
      rec = null;
    } else if (s.rec) {
      rec = startRec(wc, s.rec, s.crop, s.every ?? 60);
    } else if (s.type) {
      // Types into the focused input in a way React notices.
      await wc.executeJavaScript(`(() => { const el = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(s.type)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(s.after ?? 200);
    } else if (s.shot) {
      let crop = s.crop;
      if (s.el) {
        // Crop to an element's box (a selector), with padding, clamped to the window.
        const r = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(s.el)})?.getBoundingClientRect(); return b && [b.x, b.y, b.width, b.height]; })()`);
        if (!r) throw new Error(`no element ${s.el}`);
        const pad = s.pad ?? 12;
        const x = Math.max(0, Math.floor(r[0] - pad));
        const y = Math.max(0, Math.floor(r[1] - pad));
        crop = [x, y, Math.min(width - x, Math.ceil(r[2] + pad * 2)), Math.min(height - y, Math.ceil(r[3] + pad * 2))];
      }
      // A hidden window paints lazily, so the first capture can hand back the frame before the last step. Take a
      // throwaway one to get it painting, then the real one.
      await wc.capturePage();
      await sleep(150);
      const img = await wc.capturePage(crop ? { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } : undefined);
      fs.writeFileSync(path.join(outDir, `${s.shot}.png`), img.toPNG());
    }
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('app:launchFile', () => null);
  ipcMain.handle('recent:list', () => []);
  for (const c of ['autosave:read', 'autosave:clear', 'autosave:write', 'autosave:keep', 'autosave:readKept', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear']) ipcMain.handle(c, () => null);
  ipcMain.handle('autosave:listKept', () => []);
  // Plugins and templates live in memory for the run.
  const lib = new Map();
  ipcMain.handle('library:list', (_e, kind) => [...lib.keys()].filter((k) => k.startsWith(kind + '/')).map((k) => ({ id: k.slice(kind.length + 1), size: lib.get(k).length, modified: 0 })));
  ipcMain.handle('library:read', (_e, kind, id) => lib.get(`${kind}/${id}`) ?? null);
  ipcMain.handle('library:write', (_e, kind, id, bytes) => void lib.set(`${kind}/${id}`, bytes));
  ipcMain.handle('library:remove', (_e, kind, id) => void lib.delete(`${kind}/${id}`));
  ipcMain.handle('app:askSaveChanges', () => 'discard');
  // Shots of the Export dialog show ProRes as available (the real check looks for FFmpeg).
  ipcMain.handle('video:probe', () => ({ ok: true }));
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '../../dist/preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: ['--frameling-version=docs'],
      backgroundThrottling: false,
    },
  });
  const logs = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) logs.push(String(e.message ?? e));
  });
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  // Preferences live in localStorage, so write them and load again for the app to pick them up.
  const prefs = { theme, look, darkTheme: 'midnight-sketchbook', ...extraPrefs };
  await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true;`);
  await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
  await sleep(Number(process.env.SHOT_WAIT || 3000));
  try {
    await runSteps(win, JSON.parse(fs.readFileSync(stepsFile, 'utf8')));
  } catch (err) {
    console.log(`step failed: ${err.message}`);
    process.exitCode = 1;
  }
  if (rec) await stopRec(rec);
  console.log(`done ${path.basename(stepsFile)}${logs.length ? `\n  console errors:\n  ${logs.join('\n  ')}` : ''}`);
  win.destroy();
  app.quit();
});
