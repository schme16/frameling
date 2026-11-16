// Pictures for the theme editor's chrome: the row of buttons at rest and on hover, and the editor scrolled down in a
// short window, for a pale theme and a dark one (each is copied, so the editor paints the app in that theme).
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/theme-chrome.cjs <outDir> <label> [distDir]
//
// Writes <outDir>/<label>-<theme>-{row,row-hover-delete,row-hover-duplicate,scrolled}.png. THEMES=a,b picks others;
// SET="line:#2a3a40,raised:#8fa6ad" types those colours into the editor first, to make a theme that fights its buttons.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const [outDir, label, distArg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('theme-chrome.cjs'));
const DIST = path.resolve(distArg || path.join(__dirname, '../../dist'));
const THEMES = (process.env.THEMES || 'Ice Camo,Midnight Sketchbook').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-tchrome-')));
fs.mkdirSync(outDir, { recursive: true });

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({ width: 1200, height: 640, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=theme-chrome'], backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  const shot = async (name, rect) => fs.writeFileSync(path.join(outDir, `${label}-${name}.png`), (await wc.capturePage(rect)).toPNG());
  const rectOf = (sel) => js(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };`);
  const btnRect = (text) => js(`const b = [...document.querySelectorAll('.th-tools button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);

  for (const name of THEMES) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
    await wc.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'light', showWelcome: false, onboarded: true }))}); return true`);
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    await js(`__frameling.overlays.openPrefs('themes'); return true`);
    await sleep(800);
    // Press the card, then "Make a copy to change": that opens the editor on the copy and switches the app to it.
    await js(`[...document.querySelectorAll('.th-card-pick')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(name)})).click(); return true`);
    await sleep(400);
    await js(`[...document.querySelectorAll('button, [role=menuitem], .ui-menu-item')].find((b) => b.textContent.includes('Make a copy to change')).click(); return true`);
    await sleep(900);
    // SET="line:#2a3a40,raised:#8fa6ad" types colours into the hex boxes, to make a theme that fights its own buttons.
    for (const pair of (process.env.SET || '').split(',').filter(Boolean)) {
      const [token, hex] = pair.split(':');
      await js(`const i = document.querySelector('input.th-hex[data-token=' + ${JSON.stringify(JSON.stringify(token))} + ']'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(hex)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true`);
      await sleep(1000);
    }
    // Toasts would sit over the pictures; the page is the scroller, so bring the tools into view before measuring.
    await js(`const st = document.createElement('style'); st.textContent = '.ui-toast, .ui-toasts { display: none !important }'; document.head.appendChild(st); document.querySelector('.th-tools').scrollIntoView({ block: 'center' }); return true`);
    await sleep(300);
    const page = await rectOf('.ui-prefs-page');
    const tools = await rectOf('.th-tools');
    const pad = 8;
    const toolsCrop = { x: Math.max(0, tools.x - pad), y: Math.max(0, tools.y - pad), width: tools.width + pad * 2, height: tools.height + pad * 2 };
    await js(`document.activeElement && document.activeElement.blur(); return true`);
    await wc.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
    await sleep(300);
    await shot(`${slug}-row`, toolsCrop);
    for (const b of ['Delete', 'Duplicate', 'Undo']) {
      const c = await btnRect(b);
      wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
      await sleep(350);
      await shot(`${slug}-row-hover-${b.toLowerCase()}`, toolsCrop);
    }
    wc.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
    await sleep(200);
    // Scrolled: a short window, scrolled well down the colours.
    await js(`document.querySelector('.ui-prefs-page').scrollTop = 0; return true`);
    await sleep(300);
    await shot(`${slug}-top`, page);
    await js(`document.querySelector('.ui-prefs-page').scrollTop = 520; return true`);
    await sleep(500);
    await shot(`${slug}-scrolled`, page);
    console.log(`shot ${label} ${name}`);
  }
  app.exit(0);
});
