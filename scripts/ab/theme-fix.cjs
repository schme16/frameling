// Pictures for the theme-fix A/B: the Themes grid with a card pointed at, and the menu after pressing a card (a real press).
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/theme-fix.cjs <outDir> <label> [distDir]
//
// Writes <outDir>/<label>-grid-{dark,light}.png and <label>-menu-{dark,light}.png, cropped to the cards.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, label, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('theme-fix.cjs'));
const DIST = distArg || path.join(__dirname, '../../dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-tfab-')));
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1400, height: 900, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=theme-fix'], backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const send = (e) => wc.sendInputEvent(e);
  const index = path.join(DIST, 'renderer/index.html');
  const shot = async (name, rect) => fs.writeFileSync(path.join(outDir, `${label}-${name}.png`), (await wc.capturePage(rect)).toPNG());
  for (const mode of ['dark', 'light']) {
    await wc.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: mode, showWelcome: false, onboarded: true }))}); return true`);
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    await js(`__frameling.overlays.openPrefs('themes'); return true`);
    await sleep(1000);
    // Scroll so the card grid fills the view, and point at the second card of the second row, near its foot.
    const c = await js(`document.querySelector('.th-section h4').scrollIntoView({ block: 'start' }); await new Promise((r) => setTimeout(r, 200)); const b = document.querySelectorAll('.th-card-pick')[6].getBoundingClientRect(); const g = document.querySelector('.th-grid').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height * 0.8), top: Math.round(g.top), left: Math.round(g.left), w: Math.round(g.width), by: Math.round(b.top + b.height * 0.2) }`);
    send({ type: 'mouseMove', x: c.x, y: c.y });
    await sleep(500);
    const crop = { x: c.left - 12, y: Math.max(0, c.top - 40), width: c.w + 24, height: 380 };
    await shot(`grid-${mode}`, crop);
    // A real press near the top of the card (the art).
    send({ type: 'mouseMove', x: c.x, y: c.by });
    await sleep(250);
    send({ type: 'mouseDown', x: c.x, y: c.by, button: 'left', clickCount: 1 });
    await sleep(40);
    send({ type: 'mouseUp', x: c.x, y: c.by, button: 'left', clickCount: 1 });
    await sleep(500);
    await shot(`menu-${mode}`, { x: c.left - 12, y: Math.max(0, c.top - 40), width: c.w + 24, height: 520 });
    console.log(`shot ${label} ${mode}`);
  }
  app.exit(0);
});
