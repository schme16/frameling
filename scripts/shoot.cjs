// Takes screenshots of the built app for A/B looks, docs and checks, without touching the real main process.
//
//   npx electron scripts/shoot.cjs <outDir> [variant ...]
//
// A variant is `name:look:theme[:steps.json]`, e.g. `cosy-dark:cosy:dark`. The optional steps file is a JSON array
// run in order, with real input events (so pointer capture, pressure-less mouse drawing and shortcuts all behave as
// they do for a person):
//   {"eval": "js"}                      run JavaScript in the page
//   {"click": [x, y]}                   left click at window coordinates
//   {"drag": [[x, y], [x, y], ...], "steps": 6}   press at the first point, move through the rest, release
//   {"key": "g", "mods": ["control"]}   press a key (Electron keyCode names)
//   {"wait": 300}                       wait in ms
//   {"shot": "name"}                    save an extra screenshot mid-way
//   {"down": [x, y]} / {"move": [x, y]} / {"up": [x, y]}   press, move (held if pressed) and release, for shots mid-drag
// SHOT_SCALE=2 shoots at twice the pixel density. SHOT_LOG=1 also prints console errors as they happen (handy when a step hangs). Run `npm run build` first.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { installIpcStubs } = require('./ipc-stubs.cjs');

const [outDir, ...variants] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('shoot.cjs'));
const width = Number(process.env.SHOT_W || 1400);
const height = Number(process.env.SHOT_H || 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSteps(win, steps) {
  const wc = win.webContents;
  const send = (e) => wc.sendInputEvent(e);
  for (const s of steps) {
    if (s.eval) await wc.executeJavaScript(s.eval);
    else if (s.wait) await sleep(s.wait);
    else if (s.click) {
      const [x, y] = s.click;
      send({ type: 'mouseMove', x, y });
      send({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await sleep(30);
      send({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await sleep(80);
    } else if (s.drag) {
      const pts = s.drag;
      const n = s.steps ?? 6;
      send({ type: 'mouseMove', x: pts[0][0], y: pts[0][1] });
      send({ type: 'mouseDown', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
      await sleep(16);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          send({ type: 'mouseMove', x: Math.round(ax + (bx - ax) * t), y: Math.round(ay + (by - ay) * t), modifiers: ['leftButtonDown'] });
          await sleep(8);
        }
      }
      const [lx, ly] = pts[pts.length - 1];
      send({ type: 'mouseUp', x: lx, y: ly, button: 'left', clickCount: 1 });
      await sleep(80);
    } else if (s.key) {
      const modifiers = s.mods ?? [];
      send({ type: 'keyDown', keyCode: s.key, modifiers });
      if (s.key.length === 1) send({ type: 'char', keyCode: s.key, modifiers });
      send({ type: 'keyUp', keyCode: s.key, modifiers });
      await sleep(80);
    } else if (s.down || s.move || s.up) {
      const [x, y] = s.down || s.move || s.up;
      const type = s.down ? 'mouseDown' : s.up ? 'mouseUp' : 'mouseMove';
      send({ type, x, y, button: 'left', clickCount: 1, modifiers: s.move && runSteps.held ? ['leftButtonDown'] : [] });
      if (s.down) runSteps.held = true;
      if (s.up) runSteps.held = false;
      await sleep(40);
    } else if (s.shot) {
      fs.writeFileSync(path.join(outDir, `${s.shot}.png`), (await wc.capturePage()).toPNG());
    }
  }
}

// SHOT_SCALE=2 renders at twice the pixel density, for close-up crops that stay sharp.
if (process.env.SHOT_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', String(process.env.SHOT_SCALE));

// Each variant closes its window before the next opens; without this Electron quits as soon as the first one closes,
// and the next variant's load fails (ERR_FAILED) and the run stalls.
app.on('window-all-closed', () => {});

// A throwaway profile, so what one run left behind (the brush, colours and onion skin are remembered between launches) never shows in the next.
app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'frameling-shoot-')));

app.whenReady().then(async () => {
  // The real main process answers these; for shots there is no file and no history.
  // The real main process answers these; for shots there is no file and no history (stand-ins in scripts/ipc-stubs.cjs).
  // A step can open a real .frameling file: {"eval": "__framelingIo.openPath('/abs/path.frameling')"}.
  installIpcStubs(ipcMain, {
    'files:read': (_e, p) => (typeof p === 'string' && p.endsWith('.frameling') && fs.existsSync(p) ? { bytes: new Uint8Array(fs.readFileSync(p)), path: p } : { error: 'No such file.' }),
  });
  fs.mkdirSync(outDir, { recursive: true });
  for (const v of variants.length ? variants : ['default::']) {
    const [name, look, theme, steps] = v.split(':');
    const win = new BrowserWindow({
      width,
      height,
      // A truly hidden window only gets about one animation frame a second, so the canvas and React lag behind
      // and shots go stale. Park a real, unfocusable window off-screen instead (SHOT_SHOW=1 puts it on screen).
      show: true,
      x: process.env.SHOT_SHOW === '1' ? undefined : -4000,
      y: process.env.SHOT_SHOW === '1' ? undefined : 0,
      focusable: process.env.SHOT_SHOW === '1',
      skipTaskbar: process.env.SHOT_SHOW !== '1',
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: path.join(__dirname, '../dist/preload/preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        additionalArguments: ['--frameling-version=shot'],
        // A hidden window is throttled, so CSS transitions and rAF never finish without this.
        backgroundThrottling: false,
      },
    });
    const logs = [];
    win.webContents.on('console-message', (e) => {
      const m = e.message ?? e;
      if (e.level === 'error' || e.level === 3) { logs.push(String(m)); if (process.env.SHOT_LOG) console.log('LOG', String(m)); }
    });
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'), { query: { debug: '1' } });
    await win.webContents.executeJavaScript(`
      ${look ? `document.documentElement.dataset.look = ${JSON.stringify(look)};` : ''}
      ${theme ? `document.documentElement.dataset.theme = ${JSON.stringify(theme)};` : ''}
      true;
    `);
    await sleep(Number(process.env.SHOT_WAIT || 900));
    if (steps) {
      // A step that throws used to leave the run hanging for ever. Say which one, and carry on to the shot so
      // there is something to look at.
      try {
        await runSteps(win, JSON.parse(fs.readFileSync(steps, 'utf8')));
      } catch (e) {
        logs.push(`step failed: ${e && e.message ? e.message : e}`);
      }
    }
    await sleep(300);
    fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    console.log(`shot ${name}${logs.length ? `\n  console errors:\n  ${logs.join('\n  ')}` : ''}`);
    win.destroy();
  }
  app.quit();
});
