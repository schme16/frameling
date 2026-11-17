// Runs the entries of scripts/docs/ab-brush-parity/presets.cjs and keeps every named shot as a PNG, uncompressed (the help
// media runner squeezes its pictures to 256 colours, which is wrong for a brush sheet).
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/brush-parity-presets.cjs <outDir> [group ...]
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('./lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const path = require('node:path');
const { mockMain, makeWindow, runSteps, sleep } = require('./docs/steps.cjs');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('brush-parity-presets.cjs'));
const [outDir, ...only] = argv;
if (!outDir) {
  console.error('usage: electron scripts/brush-parity-presets.cjs <outDir> [group ...]');
  process.exit(2);
}
const entries = require('./docs/ab-brush-parity/presets.cjs').filter((e) => !only.length || only.includes(e.name.replace(/^presets-/, '')));
const js = (win, code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  mockMain(ipcMain);
  fs.mkdirSync(outDir, { recursive: true });
  const win = makeWindow(BrowserWindow, 1400, 1000);
  const rendererDir = path.join(__dirname, '../dist/renderer');
  let failed = 0;
  for (const e of entries) {
    try {
      await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
      const prefs = { theme: 'light', look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, rightSide: 'tabs', ...e.prefs };
      await js(win, `localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); return true;`);
      await win.loadFile(path.join(rendererDir, 'index.html'), { query: { debug: '1' } });
      await sleep(3000);
      await runSteps(win, e.steps, { outDir, width: 1400, height: 1000, name: e.name });
      console.log(`ok ${e.name}`);
    } catch (err) {
      failed++;
      console.log(`FAILED ${e.name}: ${err.message}`);
    }
  }
  win.destroy();
  app.exit(failed ? 1 : 0);
});
