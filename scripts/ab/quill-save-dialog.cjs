// Checks and shoots Quill's "Save changes?" dialog in the real built app (real main process, so the real window close,
// the real Quit and the real system fallback box). Run inside xvfb, after `npm run build`:
//   xvfb-run -a -s "-screen 0 1280x800x24" npx electron scripts/ab/quill-save-dialog.cjs <mode> <dark|light> <outdir>
// Modes:
//   dialog    draw, close the window: the dialog; Escape cancels; Quit asks again; Don't save lets the quit finish.
//             Writes the dialog crop (dialog-<theme>.png) and, with CLIP=1, a screen recording (dialog-<theme>.mp4).
//   fallback  freeze the page, close the window: after the wait the old system box shows (system-<theme>.png).
// Exits 0 when every check held, 1 otherwise.
const electron = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2).filter((a) => !a.endsWith('quill-save-dialog.cjs') && !a.startsWith('-'));
const [mode = 'dialog', theme = 'dark', outDir = os.tmpdir()] = args;
const W = 1280;
const H = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-sqd-'));
electron.app.setPath('userData', data);
require('../../dist/main/main.cjs');
fs.mkdirSync(outDir, { recursive: true });

const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};

electron.app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) {
    await sleep(100);
    win = electron.BrowserWindow.getAllWindows()[0];
  }
  await gpu.confirmOrExit(win);
  const js = (code) => win.webContents.executeJavaScript(code);
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, showTips: false };
  await js(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true`);
  win.setBounds({ x: 0, y: 0, width: W, height: H });
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(2500);
  win.setBounds({ x: 0, y: 0, width: W, height: H });
  await sleep(500);

  const center = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const mouse = (type, x, y, extra = {}) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const key = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(80);
  };
  const asking = () => js(`!!document.querySelector('[data-testid="save.save"]')`);
  const waitFor = async (fn, ms = 6000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await fn()) return true;
      await sleep(100);
    }
    return false;
  };

  let ff = null;
  const stopRecording = async () => {
    if (!ff) return;
    ff.stdin.write('q');
    await new Promise((r) => ff.on('close', r));
    ff = null;
  };
  if (process.env.CLIP === '1' && mode === 'dialog') {
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-framerate', '15', '-video_size', `${W}x${H}`, '-i', process.env.DISPLAY, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart', path.join(outDir, `dialog-${theme}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
    await sleep(1200);
  }

  // Unsaved work: three strokes.
  const c = await center('main.ui-canvas canvas');
  const x0 = c.x - 160;
  const y0 = c.y - 40;
  for (let s = 0; s < 3; s++) {
    mouse('mouseMove', x0, y0 + s * 50);
    await sleep(60);
    mouse('mouseDown', x0, y0 + s * 50);
    for (let i = 1; i <= 24; i++) {
      mouse('mouseMove', x0 + i * 14, y0 + s * 50 + Math.round(Math.sin(i / 3) * 22), { modifiers: ['leftButtonDown'] });
      await sleep(25);
    }
    mouse('mouseUp', x0 + 24 * 14, y0 + s * 50);
    await sleep(150);
  }
  await sleep(900);
  check(await js(`document.title.startsWith('\\u25cf')`), 'the drawing is marked unsaved');

  let closed = false;
  win.on('closed', () => (closed = true));

  if (mode === 'fallback') {
    // A page that is stuck: it cannot put its dialog up, so after the wait the system's own box must ask instead.
    void js(`(() => { const t = Date.now(); while (Date.now() - t < 9000); return 1; })()`);
    await sleep(300);
    const t0 = Date.now();
    win.close();
    check(!closed, 'the window did not close without asking');
    let box = null;
    for (let i = 0; i < 80 && !box; i++) {
      await sleep(150);
      try {
        const ids = execFileSync('xdotool', ['search', '--onlyvisible', '--class', '.'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        for (const id of ids) {
          const g = execFileSync('xdotool', ['getwindowgeometry', '--shell', id], { encoding: 'utf8' });
          const v = Object.fromEntries(g.trim().split('\n').map((l) => l.split('=')));
          if (Number(v.WIDTH) < W - 100 && Number(v.WIDTH) > 150) box = { id, x: +v.X, y: +v.Y, w: +v.WIDTH, h: +v.HEIGHT };
        }
      } catch {
        // not there yet
      }
    }
    const waited = Date.now() - t0;
    check(!!box, `the system box asked instead (after ${waited} ms)`);
    check(waited >= 2400, 'it waited the full dialog-within time first');
    if (box) {
      box.x = Math.round((W - box.w) / 2);
      box.y = Math.round(H / 2 - box.h / 2);
      execFileSync('xdotool', ['windowmove', box.id, String(box.x), String(box.y)]);
      await sleep(900);
      execFileSync('import', ['-window', 'root', '-crop', `${box.w + 40}x${box.h + 40}+${box.x - 20}+${box.y - 20}`, '+repage', path.join(outDir, `system-${theme}.png`)]);
      console.log('system box', JSON.stringify(box));
    }
    check(!closed, 'still open while the box is up');
    process.exitCode = fails.length ? 1 : 0;
    electron.app.exit(process.exitCode);
    return;
  }

  // 1. The window button.
  win.close();
  check(await waitFor(asking, 2000), 'closing the window shows Quill\'s dialog in the page');
  check(!closed, 'the close is held while it asks');
  await sleep(1200);
  check(await js(`document.activeElement && document.activeElement.getAttribute('data-testid') === 'save.save'`), 'Save is where the keyboard starts');
  check(await js(`(() => { const d = document.querySelector('[role=dialog]'); return d.getAttribute('aria-modal') === 'true' && d.getAttribute('aria-label') === 'Save changes?' && !!document.getElementById(d.getAttribute('aria-describedby')); })()`), 'it is a named, described modal dialog');
  check(await js(`document.querySelector('.sq-q').textContent.includes('Untitled') || document.querySelector('.sq-q').textContent.includes('Save changes to')`), 'the drawing\'s name is in the question');
  const r = await js(`(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`);
  const pad = 24;
  const img = await win.webContents.capturePage({ x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 });
  fs.writeFileSync(path.join(outDir, `dialog-${theme}.png`), img.toPNG());
  // Tab goes round inside it.
  for (let i = 0; i < 4; i++) await key('Tab');
  check(await js(`!!document.activeElement.closest('[role=dialog]')`), 'Tab stays inside the dialog');
  await sleep(1500);

  // 2. Escape is Cancel: the window stays and nothing is lost.
  await key('Escape');
  await sleep(500);
  check(!(await asking()), 'Escape takes the dialog down');
  check(!closed && !win.isDestroyed(), 'Cancel kept the window open');
  check(await js(`document.title.startsWith('\\u25cf')`), 'the work is still there and still unsaved');

  // 3. Quit: the same dialog, and the quit waits for it.
  let willQuit = false;
  let final = false;
  // The app really quits at the end, so the last checks are made as it goes.
  electron.app.on('will-quit', (e) => {
    willQuit = true;
    if (!final) return;
    if (ff) {
      // Let the recording finish properly before the app goes.
      e.preventDefault();
      void sleep(900).then(stopRecording).then(() => electron.app.exit(fails.length ? 1 : 0));
    }
    check(closed, "Don't save let the window go");
    check(true, 'and the quit carried on');
    process.exitCode = fails.length ? 1 : 0;
  });
  electron.app.quit();
  check(await waitFor(asking, 2000), 'Quit shows the same dialog');
  check(!closed && !willQuit, 'the quit is held while it asks');
  await sleep(900);
  await key('Escape');
  await sleep(500);
  check(!closed && !willQuit && !win.isDestroyed(), 'Cancel on a Quit cancels the quit');

  // 4. Quit again, and say Don't save: the window goes and the app quits.
  electron.app.quit();
  check(await waitFor(asking, 2000), 'Quit asks again');
  await sleep(700);
  const p = await center('[data-testid="save.discard"]');
  mouse('mouseMove', p.x, p.y);
  await sleep(500);
  if (ff) {
    // Let the clip show the hover before the press.
    await sleep(600);
  }
  final = true;
  mouse('mouseDown', p.x, p.y);
  await sleep(60);
  mouse('mouseUp', p.x, p.y);
  // The clip is stopped by whoever ends the run: the quit above ends this process, so give ffmpeg its own quiet exit first.
  await waitFor(() => willQuit, 12000);
  if (!willQuit) check(false, 'the quit never carried on');
  process.exitCode = fails.length ? 1 : 0;
  electron.app.exit(process.exitCode);
});
