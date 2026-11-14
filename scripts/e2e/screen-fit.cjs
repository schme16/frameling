// Measures the Draw workspace at the screen sizes people really have, in the real app: how much room the canvas gets, whether
// anything runs off the window or scrolls sideways, and whether the timeline and panels keep a usable size. It is the check
// behind the small-screen fit (src/ui/screenFit.ts): the thresholds there come from numbers this prints.
//
//   npm run build && SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1920x1200x24" npx electron scripts/e2e/screen-fit.cjs
//
// FIT_SIZES=1280x720,1536x864  the screens to check, in interface units (default: a spread from 1024x640 to 2560x1440)
// FIT_FIT=auto|off             auto: the screen is as big as the window, and the app fits it; off: a roomy screen, so the layout stays the old one (the "before")
// FIT_DIST=<dir>               check another copy of dist/ (a copy made before a change)
// FIT_WS=draw|animate|pixel    the workspace (default draw)
// FIT_SHOTS=<dir>              save a picture of each size, dark and light
// FIT_EVAL=<js>                run in the page after the drawing opens (to try a change before building it)
// FIT_JSON=<file>              save every row
// Exits 1 for a screen of 1280x720 or more where the canvas keeps under its share, something runs off the window, a rail scrolls, the timeline's rows are cut off, or the page scrolls sideways.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`screen-fit run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), 10 * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-fit-')));

const DIST = process.env.FIT_DIST || path.join(__dirname, '../../dist');
const SIZES = (process.env.FIT_SIZES || '1024x640,1280x720,1366x768,1440x810,1536x864,1600x900,1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
const MODE = process.env.FIT_FIT || 'auto';
const WS = process.env.FIT_WS || 'draw';
const shots = process.env.FIT_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

// Runs in the page.
const MEASURE = `(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cv = r('.ui-canvas');
  const vw = window.innerWidth, vh = window.innerHeight;
  // Inside a box that scrolls or clips is not off the window: the box is what shows.
  const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p); if (o.overflowX !== 'visible' || o.overflowY !== 'visible') return true; } return false; };
  // Anything whose box leaves the window (menus and popups that are closed do not count).
  const off = [...document.querySelectorAll('.ui-root *, #root *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.right > vw + 1 || b.bottom > vh + 1) && !e.closest('[hidden], [aria-hidden="true"], .ui-menu, .ui-popover, .ui-toast, .ui-quill, .ui-mascot') && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).position !== 'absolute' && !clipped(e); }).slice(0, 5).map((e) => e.className || e.tagName);
  // Boxes that scroll sideways on their own (not the timeline's frames, which are meant to).
  const sideways = [...document.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 2 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.clientWidth > 0).map((e) => (e.className || e.tagName).toString().slice(0, 40));
  return {
    vw, vh, canvas: cv, share: cv ? Math.round((cv.w * cv.h) / (vw * vh) * 100) : 0,
    left: r('.ui-zone-left'), right: r('.ui-zone-right'), bottom: r('.ui-zone-bottom'), tools: r('nav.ui-tools'), menu: r('.ui-menubar') || r('header'), status: r('.ui-statusbar') || r('footer'),
    pageSideways: document.documentElement.scrollWidth > vw + 1, pageDown: document.documentElement.scrollHeight > vh + 1,
    toolsScroll: (() => { const n = document.querySelector('nav.ui-tools'); return !!n && n.scrollHeight > n.clientHeight + 1; })(), railRight: (() => { const n = document.querySelector('.rd-rail'); return n ? [n.scrollHeight, n.clientHeight] : null; })(), tl: (() => { const n = document.querySelector('.tl-body'); return n ? [n.scrollWidth, n.clientWidth, n.scrollHeight, n.clientHeight] : null; })(), toolsNeed: (() => { const n = document.querySelector('nav.ui-tools'); return n ? [n.scrollHeight, n.clientHeight] : null; })(),
    off, sideways, fit: document.documentElement.dataset.fit || '', scale: window.devicePixelRatio,
  };
})()`;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({
    width: 1280, height: 720, useContentSize: true, show: true, x: 0, y: 0, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=screen-fit'], backgroundThrottling: false },
  });
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const index = path.join(DIST, 'renderer/index.html');
  const rows = [];
  let bad = 0;
  for (const [w, h] of SIZES) {
    // A fresh start at each size, the way a person on that screen meets it.
    await win.loadFile(index, { query: { debug: '1' } });
    await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'dark', showWelcome: false, onboarded: true, ...JSON.parse(process.env.FIT_PREFS || '{}'),  }))}); return true`);
    win.setContentSize(w, h);
    await win.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    // The harness's window is not the screen: say which screen this is (off = a roomy one, so the layout is the old one).
    const screenW = MODE === 'off' ? 3840 : w;
    const screenH = MODE === 'off' ? 2160 : h;
    await js(`__frameling.fit.consider({ id: 1, width: ${screenW}, height: ${screenH}, scaleFactor: 1, workWidth: ${screenW}, workHeight: ${screenH} }); return true`);
    await js(`__frameling.dock.applyWorkspace('${WS}'); __frameling.template('bouncing-ball'); return true`);
    if (process.env.FIT_EVAL) await js(process.env.FIT_EVAL + '; return true');
    await sleep(700);
    const m = await js(`return ${MEASURE}`);
    rows.push({ w, h, ...m });
    const roomy = w >= 1280 && h >= 720;
    const problems = [];
    if (roomy && m.share < 30) problems.push(`canvas only ${m.share}%`);
    if (m.pageSideways) problems.push('page scrolls sideways');
    if (m.off.length) problems.push(`runs off: ${m.off.join(', ')}`);
    if (roomy && m.tl && m.tl[2] > m.tl[3] + 1) problems.push(`timeline rows cut off (${m.tl[2]}/${m.tl[3]})`);
    if (roomy && m.toolsScroll) problems.push('tool rail scrolls');
    if (roomy && m.railRight && m.railRight[0] > m.railRight[1] + 1) problems.push(`right rail scrolls (${m.railRight})`);
    if (roomy && problems.length) bad++;
    console.log(`${w}x${h}: canvas ${m.canvas?.w}x${m.canvas?.h} (${m.share}%), left ${m.left?.w ?? '-'}, right ${m.right?.w ?? '-'}, bottom ${m.bottom?.h ?? '-'}, fit "${m.fit}"${m.railRight && m.railRight[0] > m.railRight[1] + 1 ? `, right rail scrolls (${m.railRight})` : ''}${m.tl ? `, timeline ${m.tl[0]}/${m.tl[1]} across, ${m.tl[2]}/${m.tl[3]} down` : ''}${m.toolsScroll ? `, rail scrolls (${m.toolsNeed})` : ''}${m.sideways.length ? `, sideways: ${[...new Set(m.sideways)].join('|')}` : ''}${problems.length ? '  !! ' + problems.join('; ') : ''}`);
    if (shots) {
      for (const theme of ['dark', 'light']) {
        await js(`__frameling.prefs.set({ theme: '${theme}' }); return true`);
        await sleep(300);
        fs.writeFileSync(path.join(shots, `${w}x${h}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
  }
  if (process.env.FIT_JSON) fs.writeFileSync(process.env.FIT_JSON, JSON.stringify(rows, null, 1));
  app.exit(bad ? 1 : 0);
});
