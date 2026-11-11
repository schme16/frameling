// Takes screenshots of the built app for A/B looks and docs, without touching the real main process.
//
//   npx electron scripts/shoot.cjs <outDir> [variant ...]
//
// A variant is `name:look:theme[:script]`, e.g. `cosy-dark:cosy:dark`. The optional script is a file of JavaScript
// run in the page before the shot (to open a panel or draw something). Run `npm run build` first.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [outDir, ...variants] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('shoot.cjs'));
const width = Number(process.env.SHOT_W || 1400);
const height = Number(process.env.SHOT_H || 900);

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const v of variants.length ? variants : ['default::']) {
    const [name, look, theme, script] = v.split(':');
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: path.join(__dirname, '../dist/preload/preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        additionalArguments: ['--frameling-version=shot'],
      },
    });
    await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
    await win.webContents.executeJavaScript(`
      try { localStorage.clear(); } catch {}
      ${look ? `document.documentElement.dataset.look = ${JSON.stringify(look)};` : ''}
      ${theme ? `document.documentElement.dataset.theme = ${JSON.stringify(theme)};` : ''}
      true;
    `);
    if (script) await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf8'));
    await new Promise((r) => setTimeout(r, Number(process.env.SHOT_WAIT || 900)));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    console.log(`shot ${name}`);
    win.destroy();
  }
  app.quit();
});
