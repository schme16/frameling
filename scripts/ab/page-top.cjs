// Pictures for the sticky page header on the other Preferences pages (Keyboard, Menus): the page at the top and
// scrolled well down, in both themes.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/page-top.cjs <outDir> <label> [distDir]
//
// Writes <outDir>/<label>-<page>-{top,scrolled}-{dark,light}.png. PAGES=keyboard,menus picks pages.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, label, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('page-top.cjs'));
const DIST = path.resolve(distArg || path.join(__dirname, '../../dist'));
const PAGES = (process.env.PAGES || 'keyboard,menus').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-pagetop-')));
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1200, height: 640, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=page-top'], backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  for (const mode of ['dark', 'light']) {
    for (const page of PAGES) {
      await wc.loadFile(index, { query: { debug: '1' } });
      await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: mode, showWelcome: false, onboarded: true }))}); return true`);
      await wc.loadFile(index, { query: { debug: '1' } });
      await sleep(1200);
      await js(`__frameling.overlays.openPrefs(${JSON.stringify(page)}); return true`);
      await sleep(900);
      await js(`const st = document.createElement('style'); st.textContent = '.ui-toast, .ui-toasts { display: none !important }'; document.head.appendChild(st); return true`);
      const r = await js(`const r = document.querySelector('.ui-prefs-page').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };`);
      for (const [name, top] of [['top', 0], ['scrolled', 600]]) {
        await js(`document.querySelector('.ui-prefs-page').scrollTop = ${top}; return true`);
        await sleep(400);
        fs.writeFileSync(path.join(outDir, `${label}-${page}-${name}-${mode}.png`), (await wc.capturePage(r)).toPNG());
      }
      console.log(`shot ${label} ${page} ${mode}`);
    }
  }
  app.exit(0);
});
