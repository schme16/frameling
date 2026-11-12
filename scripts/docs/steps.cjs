// The step runner shared by record.cjs (one steps file) and help-media.cjs (every help picture and clip, per theme).
// See record.cjs for the list of steps. Needs Electron (it drives a BrowserWindow's webContents).
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rec = null;
function startRec(outDir, wc, name, crop, every) {
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

async function runSteps(win, steps, { outDir, width, height, name }) {
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
    } else if (s.down || s.held || s.up) {
      // Hold the button over several steps, for a shot in the middle of a drag: down, then held moves, then up.
      const [x, y] = s.down || s.held || s.up;
      if (s.down) send({ type: 'mouseMove', x, y });
      send({ type: s.down ? 'mouseDown' : s.up ? 'mouseUp' : 'mouseMove', x, y, button: 'left', clickCount: 1, modifiers: s.held ? ['leftButtonDown'] : [] });
      await sleep(s.after ?? 60);
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
      rec = startRec(outDir, wc, s.rec === '@' ? name : s.rec, s.crop, s.every ?? 60);
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
      fs.writeFileSync(path.join(outDir, `${s.shot === '@' ? name : s.shot}.png`), img.toPNG());
    }
  }
}


/** Answers the main process's calls in memory (no real files, recents or autosave), like shoot.cjs does. Returns a
 * function that empties the in-memory library (plugins, templates). */
function mockMain(ipcMain) {
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
  return () => lib.clear();
}

/** A window that paints while hidden, for capturePage. */
function makeWindow(BrowserWindow, width, height) {
  return new BrowserWindow({
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
}

module.exports = { mockMain, makeWindow, runSteps, sleep, stopActiveRec: async () => { if (rec) await stopRec(rec); rec = null; } };
