// The same tooltip in a list of themes, for before/after looks at the tip colours. Each theme gets one picture: a
// rich tip (name, what it does, a shortcut, "Learn more") beside the button it is about, cropped small.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/tip-colours.cjs <outDir> <label> [distDir]
//
// Writes <outDir>/<label>-<theme id>.png. THEMES=id:mode,id:mode picks other built-in themes (default: a pale one, a dark one and
// the high-contrast pair, in both modes). Run it once on a build from before the change and once after, then put the
// pairs side by side.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, label, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('tip-colours.cjs'));
const DIST = path.resolve(distArg || path.join(__dirname, '../../dist'));
const THEMES = (process.env.THEMES || 'midnight-sketchbook:dark,batwing:dark,lantern-night:dark,paper-and-honey:light,ice-camo:light,sunbeam:light').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-tipcol-')));
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 900, height: 520, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=tip-colours'], backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  for (const entry of THEMES) {
    const [id, mode] = entry.split(':');
    await wc.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: mode, darkTheme: id, lightTheme: id, showWelcome: false, onboarded: true }))}); return true`);
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    await js(`
      const st = document.createElement('style'); st.textContent = '.ui-toast, .ui-toasts { display: none !important }'; document.head.appendChild(st);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:300px;top:300px;z-index:50;padding:14px;background:var(--panel);';
      const b = document.createElement('button');
      b.className = 'ui-btn';
      b.id = 'tipcol';
      b.textContent = 'Undo';
      b.setAttribute('data-tip', 'Undo');
      b.setAttribute('data-tip-desc', 'Takes back the last thing you did. Press it again to go further back.');
      b.setAttribute('data-tip-keys', 'Mod+Z');
      b.setAttribute('data-help', 'merge-drawing');
      host.appendChild(b); document.body.appendChild(host);
      return true`);
    const r = await js(`const r = document.getElementById('tipcol').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    wc.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 });
    await sleep(200);
    wc.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x), y: Math.round(r.y) });
    await sleep(1400);
    const box = await js(`const t = document.querySelector('.ui-tip'); const b = document.getElementById('tipcol').getBoundingClientRect(); if (!t) return null; const q = t.getBoundingClientRect(); const x = Math.min(q.left, b.left) - 10, y = Math.min(q.top, b.top) - 10; return { x: Math.max(0, Math.floor(x)), y: Math.max(0, Math.floor(y)), width: Math.ceil(Math.max(q.right, b.right) + 10 - x), height: Math.ceil(Math.max(q.bottom, b.bottom) + 10 - y), vars: ['--tip-bg', '--tip-fg', '--tip-soft', '--tip-line', '--tip-link', '--on-tip', '--on-tip-soft', '--on-tip-link'].map((n) => n + '=' + getComputedStyle(t).getPropertyValue(n).trim()).join(' ') + ' bg=' + getComputedStyle(t).backgroundColor + ' mode=' + document.documentElement.getAttribute('data-theme') };`);
    if (!box) { console.log(`${id}: no tip showed`); continue; }
    const { vars, ...rect } = box;
    fs.writeFileSync(path.join(outDir, `${label}-${id}.png`), (await wc.capturePage(rect)).toPNG());
    console.log(`${id}: ${vars}`);
  }
  app.quit();
});
