// Pictures for the theme-both-badge A/B: a grid of a dozen theme cards (two used by day, two at night, two for both,
// the rest plain), in the dark app theme, the light one, and Strawberry Milk (the pale pink the tick problem showed on).
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/theme-both-badge.cjs <outDir> <label> [distDir] [style]
//
// <style> is label | words | preview (what the build offers). Writes <outDir>/<label>-<app theme>.png, cropped to the grid.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, label, distArg, style] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('theme-both-badge.cjs'));
const DIST = distArg || path.join(__dirname, '../../dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-tbb-')));
fs.mkdirSync(outDir, { recursive: true });

const USE = {
  'paper-and-honey': { day: true, night: false },
  'ice-camo': { day: true, night: false },
  'midnight-sketchbook': { day: false, night: true },
  'strawberry-night': { day: false, night: true },
  'strawberry-milk': { day: true, night: true },
  'glacier-grid': { day: true, night: true },
};
// The app theme each picture is taken in.
const APPS = [
  { name: 'dark', prefs: { theme: 'dark', darkTheme: 'midnight-sketchbook' } },
  { name: 'light', prefs: { theme: 'light', lightTheme: 'paper-and-honey' } },
  { name: 'pink', prefs: { theme: 'light', lightTheme: 'strawberry-milk' } },
];

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1400, height: 1000, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  for (const a of APPS) {
    const prefs = { showWelcome: false, onboarded: true, ...a.prefs };
    await wc.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); return true`);
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    await js(`window.__framelingThemeUse = ${JSON.stringify(USE)}; ${style ? `window.__framelingBothStyle = ${JSON.stringify(style)};` : ''} const st = document.createElement('style'); st.textContent = '.th-card:nth-child(n+13){display:none}'; document.head.appendChild(st); __frameling.overlays.openPrefs('themes'); return true`);
    await sleep(1200);
    const r = await js(`const g = document.querySelector('.th-grid'); g.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise((r) => setTimeout(r, 1000)); const b = g.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }`);
    const crop = { x: Math.max(0, Math.round(r.x - 10)), y: Math.max(0, Math.round(r.y - 10)), width: Math.round(r.w + 20), height: Math.round(r.h + 20) };
    fs.writeFileSync(path.join(outDir, `${label}-${a.name}.png`), (await wc.capturePage(crop)).toPNG());
    console.log(`shot ${label} ${a.name}`, JSON.stringify(crop));
  }
  app.exit(0);
});
