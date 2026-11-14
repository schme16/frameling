// Looks for "Open recent shows a picture of each drawing" and "a restart restarts", in the REAL app (the real main
// process, a real profile on disk, real .frameling files), so what shows is what a person gets.
//
//   npm run build
//   RR_MODE=recent  RR_OUT=brand/ab/recent-pictures  xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/restart-recent.cjs
//   RR_MODE=restart (asks, then comes back saved) or RR_MODE=carry (unsaved work carried across, nothing asked) RR_OUT=brand/ab/real-restart     xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/restart-recent.cjs
//
// RR_ROOT points at another checkout's built app (the build from before the change, for the "before" stills).
// recent:  saves a few drawings from the templates, makes one look like an older file (no picture inside) and one go
//          missing, then shoots Open recent in both themes (dialog.png per theme, plus a small window and 200%).
// restart: the relaunched copy runs this same script again, so the two halves are told apart by a marker file. First
//          half: a saved drawing at frame 5, an unsaved change, then the Restart command, which asks the usual question;
//          Save. Second half (after it really came back): reads the file, frame and window back and writes result.json.
//          Record the screen around it with RR_REC=1 (ffmpeg on the xvfb display, see the wrapper in docs/testing.md).
const { app, BrowserWindow } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zipSync, unzipSync } = require('fflate');

const root = path.resolve(process.env.RR_ROOT || path.join(__dirname, '../..'));
const mode = process.env.RR_MODE || 'recent';
const out = path.resolve(process.env.RR_OUT || '/tmp/frameling-rr');
const work = path.resolve(process.env.RR_WORK || path.join(out, '.work'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const url = () => pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';

async function ready() {
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling && !!window.__framelingIo')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('the page never came up');
}

async function start(size) {
  app.setPath('userData', path.join(work, 'userdata'));
  process.env.FRAMELING_DEV_URL = url();
  process.env.FRAMELING_AUTOMATION_DIR = path.join(work, 'drawings');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  if (size) win.setContentSize(size[0], size[1]);
  await ready();
  await sleep(800);
}

const setTheme = async (mode, extra = {}) => {
  const prefs = { theme: mode, look: 'cosy', darkTheme: 'midnight-sketchbook', lightTheme: 'paper-and-honey', showWelcome: false, onboarded: true, ...extra };
  await ev(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); true`);
  await win.loadURL(url());
  await ready();
  await sleep(1200);
};

async function shoot(file, selector, pad = 20) {
  const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, z: window.devicePixelRatio }; })()`);
  const rect = { x: Math.max(0, Math.round(r.x - pad)), y: Math.max(0, Math.round(r.y - pad)), width: Math.round(r.width + pad * 2), height: Math.round(r.height + pad * 2) };
  const img = await win.webContents.capturePage(rect);
  fs.writeFileSync(file, img.toPNG());
}

async function recent() {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  await start([1100, 800]);
  const saved = {};
  for (const id of ['title-card', 'loading-spinner', 'walk-cycle', 'flour-sack-hop', 'hero-sprites', 'bouncing-ball']) {
    await ev(`__frameling.template(${JSON.stringify(id)})`);
    await sleep(500);
    await ev(`__framelingIo.saveDocument()`);
    await sleep(900);
  }
  const dir = process.env.FRAMELING_AUTOMATION_DIR;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.frameling'));
  console.log('saved', files.join(', '));
  // One looks like a file from an older Frameling: no picture inside. One has gone.
  const strip = (f) => {
    const p = path.join(dir, f);
    const z = unzipSync(fs.readFileSync(p));
    delete z['preview.png'];
    fs.writeFileSync(p, zipSync(z));
  };
  const withPic = files.filter((f) => !!unzipSync(fs.readFileSync(path.join(dir, f)))['preview.png']);
  console.log('with a picture inside:', withPic.length, 'of', files.length);
  if (files.length > 4) {
    strip(files.find((f) => /flour/i.test(f)) || files[2]);
    fs.rmSync(path.join(dir, files.find((f) => /hero/i.test(f)) || files[4]));
  }
  for (const m of ['dark', 'light']) {
    await setTheme(m);
    await ev(`__frameling.run('file.openRecent')`);
    await sleep(1500);
    await shoot(path.join(out, `dialog-${m}.png`), '.io-modal');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.io-modal')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(300);
  }
  // The start screen's own list of recent drawings.
  for (const m of ['dark', 'light']) {
    await setTheme(m, { showWelcome: true });
    await sleep(1500);
    await shoot(path.join(out, `welcome-${m}.png`), '.ui-recent', 12);
  }
  // A small window, and the interface at 200%: the rows must still fit and scroll.
  await setTheme('dark');
  win.setContentSize(800, 560);
  await sleep(500);
  await ev(`__frameling.prefs.set({ uiScale: 2 })`);
  await sleep(800);
  await ev(`__frameling.run('file.openRecent')`);
  await sleep(1500);
  const full = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, 'small-200-dark.png'), full.toPNG());
  console.log('done');
  app.quit();
}

// Times (epoch ms) of the moments in the clip, so the recording can be cut to them.
const mark = (name) => fs.appendFileSync(path.join(work, 'marks.txt'), `${name} ${Date.now()}\n`);

async function restart(carry = false) {
  const marker = path.join(work, 'came-back.json');
  const first = !fs.existsSync(path.join(work, 'started'));
  if (first) {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(work, 'started'), '1');
  }
  await start(first ? [1200, 800] : null);
  await setThemeOnce();
  if (first) {
    // Somewhere other than the middle, so the window coming back to the same spot means something.
    win.setPosition(180, 60);
    await sleep(2500);
    await ev(`__frameling.template('bouncing-ball')`);
    await sleep(600);
    await ev(`__framelingIo.saveDocument()`);
    await sleep(1200);
    await ev(`__frameling.store().setUi({ frame: 5 })`);
    if (carry) {
      // A real unsaved change: a thick brush stroke across the picture, with real mouse events.
      await ev(`__frameling.run('tools.brush'); __frameling.store().setUi((u) => ({ color: '#e0245e', brush: { ...u.brush, size: 22 } })); true`);
      await sleep(400);
      const m = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...(type === 'mouseMove' && down ? { modifiers: ['leftButtonDown'] } : {}) });
      let down = false;
      m('mouseMove', 330, 220);
      await sleep(80);
      m('mouseDown', 330, 220);
      down = true;
      for (let i = 1; i <= 24; i++) {
        m('mouseMove', 330 + i * 12, 220 + Math.sin(i / 3) * 50);
        await sleep(30);
      }
      m('mouseUp', 618, 220);
      down = false;
      await sleep(900);
    } else {
      // An unsaved change, so the usual question is asked.
      await ev(`(() => { const s = __frameling.store(); s.setUi({ dirty: true }); })()`);
    }
    await sleep(1500);
    const before = { bounds: win.getBounds(), file: await ev(`__frameling.store().get().ui.filePath`), frame: await ev(`__frameling.store().get().ui.frame`), dirty: await ev(`__frameling.store().get().ui.dirty`), drawing: await ev(`JSON.stringify(__frameling.store().get().doc.drawings).length`) };
    fs.writeFileSync(path.join(work, 'before.json'), JSON.stringify(before));
    console.log('before', JSON.stringify(before));
    mark('asked');
    await ev(`__frameling.run('app.restart')`);
    await sleep(2200);
    if (carry) {
      if (process.env.RR_DEBUG_SHOT) fs.writeFileSync(process.env.RR_DEBUG_SHOT, (await win.webContents.capturePage()).toPNG());
      // The first restart with Undo steps says so and asks once (a remembered choice); answer it like a person would.
      await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^ok$/i.test(x.textContent.trim())); if (!b) throw new Error('no OK button'); b.click(); return true; })()`);
      fs.writeFileSync(path.join(work, 'question-shown'), 'false');
      mark('clicked-restart');
      // No question about saving: look for one while the window is still going (a window already gone means none).
      let asked = false;
      for (let i = 0; i < 6; i++) {
        await sleep(150);
        try {
          if (win.isDestroyed()) break;
          asked = asked || (await ev(`[...document.querySelectorAll('button')].some((x) => /^save$/i.test(x.textContent.trim()))`));
        } catch {
          break;
        }
      }
      if (asked) fs.writeFileSync(path.join(work, 'question-shown'), 'true');
      await sleep(15000);
      console.log('still here: the restart did not happen');
      process.exitCode = 1;
      app.exit(1);
      return;
    }
    // Quill's question is on screen: press Save, like a person would.
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^save$/i.test(x.textContent.trim())); if (!b) throw new Error('no Save button'); b.click(); return true; })()`);
    mark('clicked-save');
    await sleep(15000);
    console.log('still here: the restart did not happen');
    process.exitCode = 1;
    app.exit(1);
    return;
  }
  mark('back');
  await sleep(2500);
  const after = { bounds: win.getBounds(), file: await ev(`__frameling.store().get().ui.filePath`), frame: await ev(`__frameling.store().get().ui.frame`), dirty: await ev(`__frameling.store().get().ui.dirty`), drawing: await ev(`JSON.stringify(__frameling.store().get().doc.drawings).length`) };
  const before = JSON.parse(fs.readFileSync(path.join(work, 'before.json'), 'utf8'));
  const where = before.file === after.file && before.frame === after.frame && before.bounds.x === after.bounds.x && before.bounds.y === after.bounds.y && before.bounds.width === after.bounds.width;
  // Carried work: the very same drawing, and still marked unsaved. Otherwise it was saved first, so it comes back saved.
  const same = carry ? where && after.dirty === true && after.drawing === before.drawing && fs.readFileSync(path.join(work, 'question-shown'), 'utf8') === 'false' : where;
  fs.writeFileSync(path.join(work, 'came-back.json'), JSON.stringify({ carry, questionShown: carry ? fs.readFileSync(path.join(work, 'question-shown'), 'utf8') === 'true' : true, before, after, same }, null, 2));
  console.log('after', JSON.stringify(after), same ? 'SAME' : 'DIFFERENT');
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(work, 'marks.txt'), path.join(out, 'marks.txt'));
  fs.copyFileSync(marker, path.join(out, 'result.json'));
  await sleep(2500);
  app.quit();
}

const setThemeOnce = async () => {
  if (fs.existsSync(path.join(work, 'themed'))) return;
  fs.writeFileSync(path.join(work, 'themed'), '1');
  await setTheme(process.env.RR_THEME || 'dark');
};

(mode === 'recent' ? recent : () => restart(mode === 'carry'))().catch((e) => {
  console.error(e);
  app.exit(1);
});
