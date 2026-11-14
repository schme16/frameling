// Walks every page of Quill's first-run hello in the real app, at the sizes people use, in both themes, and checks that
// nothing in the sheet is cut off, scrolls, or runs out of its box. It also saves a picture of every page, so each one
// can be opened and looked at (the checks do not replace looking).
//
//   npm run build && xvfb-run -a -s "-screen 0 1700x1000x24" npx electron scripts/e2e/hello-fit.cjs
//
// HELLOFIT_DIST=<dir> checks another copy of dist/. HELLOFIT_OUT=<dir> where the pictures go (default: none are saved). HELLOFIT_SIZES=1280x720,1600x900 the window sizes
// (content size). HELLOFIT_SCALES=1,1.5,2 the interface size slider. HELLOFIT_THEMES=dark,light.
// In every page it reports an element that:
//   scrolls         has a scrollbar (a welcome sheet with a scrollbar looks broken),
//   clipped         has a child that sticks out of a box that hides overflow (text or a bubble cut off at an edge),
//   spills          has words wider than the box they are in (a card's sentence running past the card),
//   outside         sticks out of the sheet itself.
// Exits 1 when anything is found.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`hello-fit run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), 25 * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-hellofit-')));

const SIZES = (process.env.HELLOFIT_SIZES || '1280x720,1600x900').split(',').map((s) => s.split('x').map(Number));
const SCALES = (process.env.HELLOFIT_SCALES || '1').split(',').map(Number);
const THEMES = (process.env.HELLOFIT_THEMES || 'dark,light').split(',');
const OUT = process.env.HELLOFIT_OUT;
// HELLOFIT_DIST points at another build (a copy of dist/ made before a change, for the before numbers).
const DIST = process.env.HELLOFIT_DIST || path.join(__dirname, '../../dist');
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const FIND = `(() => {
  const root = document.querySelector('.ui-modal.ob');
  if (!root) return ['no hello on screen'];
  const found = [];
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 28) + '"';
  const sheet = root.getBoundingClientRect();
  const shown = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; };
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!shown(el) || el.closest('svg') && el.tagName !== 'svg' || el.closest('.ui-sr-only')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) found.push('scrolls (up and down): ' + name(el));
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) found.push('scrolls (sideways): ' + name(el));
    const hides = (v) => v === 'hidden' || v === 'clip';
    if (hides(cs.overflowX) || hides(cs.overflowY)) {
      for (const c of el.children) {
        if (!shown(c)) continue;
        const cr = c.getBoundingClientRect();
        // A small allowance for the pop-in scale and the shadows.
        if (cr.top < r.top - 1 || cr.bottom > r.bottom + 1 || cr.left < r.left - 1 || cr.right > r.right + 1) found.push('clipped: ' + name(c) + ' inside ' + name(el));
      }
    }
    // Words wider than their own box: only when the element itself holds the text.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && cs.display !== 'inline' && el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible') found.push('spills: ' + name(el));
    // Words crossing the edge of the card or button they sit in (the box itself may not be the thing that overflows).
    if (own) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      const box = el.closest('button, [role=radio], [role=switch], .ob-bubble');
      if (box && box !== el) {
        const br = box.getBoundingClientRect();
        if (tr.right > br.right + 1 || tr.left < br.left - 1) found.push('spills: ' + name(el) + ' crosses the edge of ' + name(box));
      }
    }
    // Out of sight inside a scrolling or clipping box is that box's business (reported above), not the sheet's.
    let hidden = false;
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 1 || r.left < ar.left - 1 || r.bottom > ar.bottom + 1 || r.top < ar.top - 1) hidden = true;
      }
    }
    if (!hidden && (r.right > sheet.right + 1 || r.left < sheet.left - 1 || r.bottom > sheet.bottom + 1 || r.top < sheet.top - 1)) {
      if (!el.closest('.ui-sr-only') && !el.classList.contains('ui-sr-only')) found.push('outside the sheet: ' + name(el));
    }
  }
  return found;
})()`;

// Each page: how to get there from the one before, and what to wait for (the bubbles pop in one after another).
const PAGES = [
  { name: 'p1-hello', go: null, wait: 3600 },
  { name: 'p2-make', go: `document.querySelector('.ob-next').click()`, wait: 1500 },
  {
    name: 'p2-make-picked',
    go: `for (const t of ['Sketches and cartoons', 'Game sprites and pixel art', 'Tiles and levels']) [...document.querySelectorAll('.ob-card')].find((c) => c.textContent.includes(t))?.click()`,
    wait: 1500,
  },
  { name: 'p3-colours', go: `document.querySelector('.ob-next').click()`, wait: 2000 },
  { name: 'p3-colours-auto', go: `[...document.querySelectorAll('.ob-mode .ui-seg')].find((b) => b.textContent.includes('Auto'))?.click()`, wait: 1200 },
  // Auto changes the app's own theme, so put the theme under test back before the pages that follow.
  { name: 'p3-colours-back', go: `[...document.querySelectorAll('.ob-mode .ui-seg')].find((b) => b.textContent.includes(THEME))?.click()`, wait: 600, quiet: true },
  { name: 'p4-settings', go: `document.querySelector('.ob-next').click()`, wait: 2000 },
  { name: 'p5-done', go: `document.querySelector('.ob-next').click()`, wait: 2800 },
];

let win = null;
async function runOne(w, h, theme, scale) {
  // One window for the whole run (a second window loading the same page can fail), resized for each view.
  win ??= new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.setContentSize(w, h);
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  await win.loadFile(path.join(DIST, 'renderer/index.html'), { query: { debug: '1' } });
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme, showWelcome: false, onboarded: true, uiScale: scale }))}); return true`);
  await win.loadFile(path.join(DIST, 'renderer/index.html'), { query: { debug: '1' } });
  await sleep(1500);
  await js(`__frameling.run('help.meetQuill'); return true`);
  await sleep(600);
  const label = `${w}x${h} ${theme} ${scale * 100}%`;
  const found = [];
  for (const page of PAGES) {
    if (page.go) await js(`${page.go.replace('THEME', JSON.stringify(theme === 'dark' ? 'Dark' : 'Light'))}; return true`);
    await sleep(page.wait);
    if (page.quiet) continue;
    // The hidden window only runs animations as frames are taken: take one, give the pop-ins a moment, then look.
    await win.webContents.capturePage();
    await sleep(900);
    const problems = await js(`return ${FIND}`);
    for (const p of problems) found.push(`${label} | ${page.name}: ${p}`);
    if (OUT) {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, `${theme}-${w}x${h}-${scale * 100}-${page.name}.png`), img.toPNG());
    }
  }
  return found;
}

app.whenReady().then(async () => {
  installIpcStubs(ipcMain);
  const all = [];
  let views = 0;
  for (const [w, h] of SIZES) {
    for (const scale of SCALES) {
      for (const theme of THEMES) {
        all.push(...(await runOne(w, h, theme, scale)));
        views += PAGES.filter((p) => !p.quiet).length;
      }
    }
  }
  for (const f of all.slice(0, 60)) console.log('  ' + f);
  if (all.length > 60) console.log(`  ... and ${all.length - 60} more`);
  const kinds = {};
  for (const f of all) kinds[f.split(': ')[0].split(' | ')[1] ? f.split(' | ')[1].split(': ')[1] : f] = 0;
  for (const f of all) { const k = f.split(': ')[1].split(' ')[0]; kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`hello-fit: ${views} pages looked at, ${all.length} problems${all.length ? ' (' + Object.entries(kinds).filter(([k]) => /^[a-z]+$/.test(k) && kinds[k]).map(([k, n]) => k + ' ' + n).join(', ') + ')' : ''}`);
  app.exit(all.length ? 1 : 0);
});
