// A/B pictures of the beta report panel (Preferences > Diagnostics): the panel at rest, the report read before it goes,
// and the moment just after a send. Run it once per build and theme; the build needs an ingest key so Send is there
// (FRAMELING_INGEST_KEY=x FRAMELING_INGEST_URL=https://boards.example.invalid npm run build). Nothing is really sent: the
// desktop side's request is answered here with a pretend "accepted".
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron --no-sandbox scripts/ab/reports.cjs <repoRoot> <outDir> <dark|light> <label>
//
// Writes <outDir>/<label>-<theme>-{panel,preview,sent}.png, each cropped to the panel.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [root, outDir, theme, label] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('reports.cjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ab-')));

process.on('unhandledRejection', (e) => {
  console.error(e);
  app.exit(2);
});

app.whenReady().then(async () => {
  installIpcStubs(ipcMain);
  ipcMain.removeHandler('beta:request');
  ipcMain.handle('beta:request', () => ({ status: 200, type: 'application/json', text: '{"ok":true}' }));
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1400,
    height: 2300,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(root, 'dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=ab'], backgroundThrottling: false },
  });
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(root, 'dist/renderer/index.html');
  await win.loadFile(index, { query: { debug: '1' } });
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, betaReports: true, betaContact: 'ada@example.com', showTips: false };
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); return true;`);
  await win.loadFile(index, { query: { debug: '1' } });
  await sleep(1500);
  await js(`__frameling.template('bouncing-ball'); __frameling.overlays.openPrefs('diagnostics'); return true;`);
  await sleep(1200);

  const crop = async (name) => {
    const r = await js(`const e = document.querySelector('.bt-beta'); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.overflowY !== 'visible' || c.maxHeight !== 'none') { p.style.overflow = 'visible'; p.style.maxHeight = 'none'; p.style.height = 'auto'; } } e.scrollIntoView({ block: 'start' }); await new Promise((r) => setTimeout(r, 200)); const b = e.getBoundingClientRect(); return { x: Math.floor(b.x) - 10, y: Math.floor(b.y) - 10, width: Math.ceil(b.width) + 20, height: Math.ceil(b.height) + 20 };`);
    const clip = { ...r, x: Math.max(0, r.x), y: Math.max(0, r.y) };
    const img = await win.webContents.capturePage(clip);
    fs.writeFileSync(path.join(outDir, `${label}-${theme}-${name}.png`), img.toPNG());
    console.log('shot', `${label}-${theme}-${name}`, clip.width, 'x', clip.height);
  };
  const press = (text) => js(`const b = [...document.querySelectorAll('.bt-beta button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true;`);

  await crop('panel');
  await js(`const t = document.querySelector('.bt-beta textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'The canvas went blank when I opened the timeline.'); t.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
  await sleep(300);
  await press('Show me what you would send');
  await sleep(900);
  await crop('preview');
  await press('Send it');
  await sleep(1200);
  await crop('sent');
  app.exit(0);
});
