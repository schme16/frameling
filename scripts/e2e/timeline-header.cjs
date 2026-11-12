// Checks the timeline header in the real app at 1280 and 1400 pixels wide: it stays on one row (nothing clipped, no
// wrapping), the everyday buttons are still on it, and the rare ones are in the "more" menu. Run inside xvfb:
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/timeline-header.cjs
//
// Set HEADER_SHOTS=<dir> to also save a screenshot of the header at each size and state (HEADER_SCALE=2 for sharper
// ones, which needs a screen twice as big: -screen 0 3200x2000x24). HEADER_ALL=1 shows the rarely used buttons even when narrow, for the A/B look; the checks then fail on purpose.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

// What a person reaches for all the time: it has to stay on the header at both sizes.
const EVERYDAY = ['Go to the first frame', 'Back one frame', 'Play', 'Forward one frame', 'Go to the last frame', 'Loop', 'Start a new blank drawing', 'Copy this drawing', 'Add a frame', 'Remove a frame', 'Hold', 'See the frames around this one', 'Frames per second'];

// Measured in the page: is each button on the header, and is the header one clean row?
const MEASURE = `(() => {
  const root = document.querySelector('.tl-root');
  const h = document.querySelector('.tl-header');
  const hb = h.getBoundingClientRect();
  const seen = [];
  for (const el of h.querySelectorAll('button, input, label')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden') continue;
    let hidden = false;
    for (let p = el; p && p !== h; p = p.parentElement) if (getComputedStyle(p).display === 'none') hidden = true;
    if (hidden) continue;
    seen.push({ name: (el.getAttribute('aria-label') || el.title || el.textContent || '').trim(), right: r.right, top: r.top, bottom: r.bottom, left: r.left });
  }
  return {
    container: Math.round(root.getBoundingClientRect().width),
    height: Math.round(hb.height),
    clipped: h.scrollWidth > h.clientWidth + 1,
    scroll: h.scrollWidth, client: h.clientWidth,
    // A wrapped header would put buttons at different heights; one row keeps them all inside the first row's band.
    spread: seen.length ? Math.round(Math.max(...seen.map((s) => s.bottom)) - Math.min(...seen.map((s) => s.top))) : 0,
    beyond: seen.filter((s) => s.right > hb.right + 1 || s.left < hb.left - 1).map((s) => s.name),
    names: seen.map((s) => s.name),
  };
})()`;

const STATES = [
  { name: 'plain', setup: '' },
  { name: 'play range', setup: '__frameling.store().update("range", (d) => { d.inOut = { start: 2, end: 9 }; })' },
  { name: 'clean timeline', setup: '__frameling.prefs.set({ cleanTimeline: true })' },
];

async function run(width) {
  const win = new BrowserWindow({
    width,
    height: 800,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=shot'], backgroundThrottling: false },
  });
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  const js = (code) => win.webContents.executeJavaScript(code);
  // Preferences live in localStorage: no Welcome screen, no first-run hello, then load again to pick them up.
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'light', look: 'cosy', showWelcome: false, onboarded: true }))}); true`);
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  await sleep(1500);
  if (process.env.HEADER_ALL) await js(`(() => { const s = document.createElement('style'); s.textContent = '.tl-header .tl-rare { display: inline-flex !important; } .tl-header .tl-overflow { display: none !important; }'; document.head.appendChild(s); })()`);
  for (const st of STATES) {
    await js(`__frameling.store().update("reset", (d) => { delete d.inOut; }); __frameling.prefs.set({ cleanTimeline: false }); true`);
    if (st.setup) await js(st.setup + '; true');
    await sleep(350);
    const m = await js(MEASURE);
    const label = `${width} wide, ${st.name} (timeline ${m.container}px)`;
    check(!m.clipped, `${label}: nothing clipped (${m.scroll} of ${m.client})`);
    check(m.spread <= 40 && m.height <= 44, `${label}: one row (${m.height}px tall)`);
    check(!m.beyond.length, `${label}: every button inside the header${m.beyond.length ? ' (outside: ' + m.beyond.join(', ') + ')' : ''}`);
    {
      for (const want of EVERYDAY) check(m.names.some((n) => n.toLowerCase().includes(want.toLowerCase())), `${label}: "${want}" stays on the header`);
    }
    // The rarely used buttons that are folded away are in the "more" menu, and the ones still showing are not listed twice.
    const menu = await js(`(() => { const o = document.querySelector('.tl-overflow'); if (!o || getComputedStyle(o).display === 'none') return null; o.click(); return new Promise((r) => setTimeout(() => { const t = [...document.querySelectorAll('.tl-menu-item')].map((b) => b.textContent); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); r(t); }, 150)); })()`);
    if (menu) {
      console.log(`     "more" menu: ${menu.join(' | ')}`);
      check(menu.some((t) => /ping-pong|back and forth/i.test(t)) && menu.some((t) => /sound/i.test(t)), `${label}: the more menu has the rarely used buttons`);
      check(!menu.some((t) => /new (blank )?drawing/i.test(t)), `${label}: what still shows on the header is not repeated in the menu`);
    } else check(m.names.some((n) => /ping-pong/i.test(n)) && m.names.some((n) => /sound/i.test(n)), `${label}: no menu needed, everything shows`);
    if (process.env.HEADER_SHOTS) {
      fs.mkdirSync(process.env.HEADER_SHOTS, { recursive: true });
      const r = await js(`(() => { const b = document.querySelector('.tl-header').getBoundingClientRect(); return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()`);
      fs.writeFileSync(path.join(process.env.HEADER_SHOTS, `header-${width}-${st.name.replace(/ /g, '-')}.png`), (await win.webContents.capturePage(r)).toPNG());
    }
    if (st.name === 'plain') console.log(`     on the header at ${width}: ${m.names.join(' | ')}`);
  }
  win.destroy();
}

if (process.env.HEADER_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.HEADER_SCALE);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept', 'library:list']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState', 'library:write', 'library:remove']) ipcMain.handle(ch, () => true);
  ipcMain.handle('library:read', () => null);
  for (const ch of ['app:documentState', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  for (const w of [1280, 1400]) await run(w);
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  app.exit(failed ? 1 : 0);
});
