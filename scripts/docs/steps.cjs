// The step runner shared by record.cjs (one steps file) and help-media.cjs (every help picture and clip, per theme).
// See record.cjs for the list of steps. Needs Electron (it drives a BrowserWindow's webContents).
const fs = require('node:fs');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What would make a picture wrong: a first-time question left open, or something still loading. Null when fine. */
const PROBE = `(() => {
  const out = [];
  const ask = document.querySelector('[data-testid^="choice."], [data-testid^="ask."]');
  if (ask) out.push('question open: ' + ask.getAttribute('data-testid'));
  if (document.querySelector('.ui-help-loading[data-slow], .tpl-loading, .au-loading, [aria-busy="true"]')) out.push('loading state');
  const t = document.body.innerText;
  if (/Loading\\.\\.\\.|Loading help|Getting the sound ready/.test(t)) out.push('loading text');
  return out.join('; ') || null;
})()`;
/** Problems seen while a step list ran (each once), for the caller to print. */
const issues = new Set();
async function probe(wc, where) {
  try {
    const r = await wc.executeJavaScript(PROBE);
    if (r) issues.add(`${where}: ${r}`);
  } catch {
    // the page is busy; the next look will do
  }
}

/** Where a step wants the picture cropped: its own `crop`, or the box of the element its `el` selector finds, with
 *  padding, clamped to the window. Shared by `shot` and `rec` so a clip can follow a panel the same way. */
async function cropOf(wc, s, width, height) {
  if (!s.el) return s.crop;
  const r = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(s.el)})?.getBoundingClientRect(); return b && [b.x, b.y, b.width, b.height]; })()`);
  if (!r) throw new Error(`no element ${s.el}`);
  const pad = s.pad ?? 12;
  const x = Math.max(0, Math.floor(r[0] - pad));
  const y = Math.max(0, Math.floor(r[1] - pad));
  // Even numbers: H.264 can't encode an odd width or height, and a clip can be cropped to an element too.
  const even = (n) => Math.max(2, n - (n % 2));
  return [x, y, even(Math.min(width - x, Math.ceil(r[2] + pad * 2))), even(Math.min(height - y, Math.ceil(r[3] + pad * 2)))];
}

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
      if (n % 12 === 3) await probe(wc, `frame ${n}`);
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
    else if (s.clickOn) {
      // Click the middle of the first element matching a selector (and containing `text`, when given), so a step
      // doesn't depend on where a menu or button happens to sit. `hover: true` only moves there; `dx`, `dy` shift the point.
      const r = await wc.executeJavaScript(`(() => { const t = ${JSON.stringify(s.text ?? null)}; const el = [...document.querySelectorAll(${JSON.stringify(s.clickOn)})].find((e) => !t || e.textContent.trim() === t || e.getAttribute('aria-label') === t || e.textContent.trim().startsWith(t)); const b = el?.getBoundingClientRect(); return b && [Math.round(b.x + b.width / 2) + ${s.dx ?? 0}, Math.round(b.y + b.height / 2) + ${s.dy ?? 0}]; })()`);
      if (!r) throw new Error(`clickOn: nothing for ${s.clickOn} ${s.text ?? ''}`);
      send({ type: 'mouseMove', x: r[0], y: r[1] });
      await sleep(s.pause ?? 0);
      if (s.hover) {
        await sleep(s.after ?? 80);
        continue;
      }
      send({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 });
      await sleep(30);
      send({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 });
      await sleep(s.after ?? 80);
    } else if (s.dragOn) {
      // Drag from the middle of one element to the middle of another ("dragOn" and "to" are selectors, with optional
      // "text" and "toText"), gliding slowly so a clip shows it. "toDx" and "toDy" shift the end point; "hold" waits before letting go.
      const where = (sel, text) => wc.executeJavaScript(`(() => { const t = ${JSON.stringify(text ?? null)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => !t || e.getAttribute('aria-label') === t || e.textContent.trim() === t); const b = el?.getBoundingClientRect(); return b && [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`);
      const a = await where(s.dragOn, s.text);
      const b = await where(s.to, s.toText);
      if (!a || !b) throw new Error(`dragOn: nothing for ${!a ? s.dragOn : s.to}`);
      const bx = b[0] + (s.toDx ?? 0);
      const by = b[1] + (s.toDy ?? 0);
      send({ type: 'mouseMove', x: a[0], y: a[1] });
      await sleep(120);
      send({ type: 'mouseDown', x: a[0], y: a[1], button: 'left', clickCount: 1 });
      await sleep(120);
      const n = s.steps ?? 14;
      for (let k = 1; k <= n; k++) {
        send({ type: 'mouseMove', x: Math.round(a[0] + ((bx - a[0]) * k) / n), y: Math.round(a[1] + ((by - a[1]) * k) / n), modifiers: ['leftButtonDown'] });
        await sleep(s.delay ?? 40);
      }
      await sleep(s.hold ?? 700);
      send({ type: 'mouseUp', x: bx, y: by, button: 'left', clickCount: 1 });
      await sleep(s.after ?? 400);
    } else if (s.click) {
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
    } else if (s.rdrag || s.rclick) {
      // The same with the right mouse button: "rdrag": [[x, y], ...] paints with Back in the Pixel workspace, "rclick": [x, y].
      const pts = s.rdrag || [s.rclick, s.rclick];
      const n = s.steps ?? 6;
      const d = s.delay ?? 8;
      send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
      send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'right', clickCount: 1 });
      await sleep(16);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          send({ type: 'mouseMove', x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t), modifiers: ['rightButtonDown'] });
          await sleep(d);
        }
      }
      const [lx, ly] = pts[pts.length - 1];
      send({ type: 'mouseUp', x: lx, y: ly, button: 'right', clickCount: 1 });
      await sleep(s.after ?? 80);
    } else if (s.wheel || s.pinch) {
      // The mouse wheel at a point: "wheel": [x, y], "dy": -120 (negative = up, which zooms in), "dx", "count" notches
      // sent "delay" ms apart, "mods": ["shift"]. "pinch" is a trackpad pinch, which Chromium delivers as Ctrl + wheel
      // with small deltas: "pinch": [x, y], "dy": -6 (negative = spread = zoom in), "count": 14.
      const [x, y] = s.wheel || s.pinch;
      const pinch = !!s.pinch;
      // dy and dx are the page's own deltaY / deltaX (negative = up). Electron's input events count the other way round.
      const dy = -(s.dy ?? (pinch ? -6 : -120));
      const dx = -(s.dx ?? 0);
      const mods = [...(s.mods ?? []), ...(pinch ? ['control'] : [])];
      send({ type: 'mouseMove', x, y });
      await sleep(30);
      for (let i = 0; i < (s.count ?? (pinch ? 14 : 1)); i++) {
        send({ type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, wheelTicksX: Math.sign(dx), wheelTicksY: pinch ? 0 : Math.sign(dy), hasPreciseScrollingDeltas: pinch, canScroll: true, modifiers: mods });
        await sleep(s.delay ?? (pinch ? 24 : 70));
      }
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
      rec = startRec(outDir, wc, s.rec === '@' ? name : s.rec, await cropOf(wc, s, width, height), s.every ?? 60);
    } else if (s.type) {
      // Types into the focused input in a way React notices.
      await wc.executeJavaScript(`(() => { const el = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(s.type)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(s.after ?? 200);
    } else if (s.shot) {
      const crop = await cropOf(wc, s, width, height);
      // A hidden window paints lazily, so the first capture can hand back the frame before the last step. Take a
      // throwaway one to get it painting, then the real one.
      await wc.capturePage();
      await sleep(150);
      await probe(wc, 'shot');
      const img = await wc.capturePage(crop ? { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } : undefined);
      fs.writeFileSync(path.join(outDir, `${s.shot === '@' ? name : s.shot}.png`), img.toPNG());
    }
  }
}


/** Answers the main process's calls in memory (no real files, recents or autosave), like shoot.cjs does, with the
 * shared stand-ins in scripts/ipc-stubs.cjs. Returns a function that empties the in-memory library (plugins, templates). */
function mockMain(ipcMain) {
  const stubs = installIpcStubs(ipcMain, {
    // Shots of the Export dialog show ProRes as available (the real check looks for FFmpeg).
    'video:probe': () => ({ ok: true }),
  });
  return stubs.clearLibrary;
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

module.exports = { issues, mockMain, makeWindow, runSteps, sleep, stopActiveRec: async () => { if (rec) await stopRec(rec); rec = null; } };
