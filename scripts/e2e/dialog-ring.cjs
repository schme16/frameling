// Walks every modal in the real app and presses just outside it with a real mouse. The rule it checks (src/ui/backdropClick.ts):
// a press within NEAR_MISS (24) pixels of a dialog's edge does nothing at all, and a press well clear does what "Pressing
// beside a dialog" says (this run sets it to Close). The save question ignores the backdrop altogether, and the export
// that is running cannot be closed, so a far press must leave those open too. It also reports any part of a dialog that
// sticks out past the box the ring is measured from (a mascot, a badge), since a press on that part is a press beside it.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/dialog-ring.cjs
//
// DIALOGRING_ONLY=<text> runs only the dialogs whose name starts with it. Exits 1 when any press does the wrong thing.
const { app, BrowserWindow, ipcMain } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`dialog-ring run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), 15 * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ring-')));

const DIST = process.env.DIALOGRING_DIST || path.join(__dirname, '../../dist');
const RING = 24;
const tpl = (id) => `__frameling.template(${JSON.stringify(id)});`;
const run = (id) => `__frameling.run(${JSON.stringify(id)});`;
// ignores: a far press must leave it open. none: it is not a modal at all (no dim area to press).
const DIALOGS = [
  ['preferences', `__frameling.overlays.openPrefs('general')`],
  ['preferences behaviour', `__frameling.overlays.openPrefs('behaviour')`],
  ['help', run('help.contents')],
  ['command palette', run('view.commandPalette')],
  ['welcome sheet', run('help.welcome')],
  ['new drawing sheet', run('file.new')],
  ['new pixel art', run('pixel.new')],
  ['about', run('help.about')],
  ['onboarding', run('help.meetQuill')],
  ['export', run('file.export')],
  ['canvas size', run('document.settings')],
  ['grid settings', run('view.gridSettings')],
  ['save as template', run('file.saveAsTemplate')],
  ['open recent', run('file.openRecent')],
  ['rotate', [tpl('hero-sprites'), run('pixel.rotate')]],
  ['lip sync name frames', [tpl('lip-sync'), run('lipsync.nameFrames')]],
  ['pen check offer', `__frameling.overlays.state.set((o) => ({ ...o, penCheck: 'offer' }))`],
  ['pen check', run('pen.check')],
  ['choice question', `__frameling.screenOffer({ id: 7, width: 3840, height: 2160, scaleFactor: 1, workWidth: 3840, workHeight: 2100 })`],
  ['export tileset', [tpl('tileset'), run('tiles.export')]],
  ['versions', `__framelingIo.versionsDialog('list')`],
  ['recover', run('file.recover')],
  ['crash offer (Quill)', `__frameling.crashOffer('ask')`],
  ['save question, saved drawing (ignores)', `__frameling.saveQuestion(false)`, 'ignores'],
  ['save question, never saved (ignores)', `__frameling.saveQuestion(true)`, 'ignores'],
  ['quest card (not a modal)', `await __frameling.quests.celebrate('first-animation')`, 'none'],
];

// Runs in the page: the top dialog, its box, the dim area round it, and anything that pokes out of the box.
const PROBE = `(() => {
  const ds = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.closest('.ui-backdrop, .io-backdrop'));
  const d = ds[ds.length - 1];
  const back = d?.closest('.ui-backdrop, .io-backdrop');
  const bar = document.querySelector('.qc');
  if (!d) return { none: true, card: bar ? { left: bar.getBoundingClientRect().left } : null };
  window.__ringDialog = d;
  const r = d.getBoundingClientRect();
  const b = back.getBoundingClientRect();
  let out = null;
  for (const el of d.querySelectorAll('*')) {
    const e = el.getBoundingClientRect();
    if (e.width < 2 || e.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    // Skip what a scrolling or clipping parent hides.
    let hidden = false;
    for (let p = el.parentElement; p && d.contains(p); p = p.parentElement) {
      const c = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(c.overflowX + c.overflowY)) { const pr = p.getBoundingClientRect(); if (e.right > pr.right + 1 || e.left < pr.left - 1 || e.bottom > pr.bottom + 1 || e.top < pr.top - 1) { hidden = true; break; } }
    }
    if (hidden) continue;
    const over = Math.max(r.left - e.left, e.right - r.right, r.top - e.top, e.bottom - r.bottom);
    if (over > 2 && (!out || over > out.over)) out = { over: Math.round(over), el: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] };
  }
  return { rect: { l: r.left, t: r.top, r: r.right, b: r.bottom }, back: { l: b.left, t: b.top, r: b.right, b: b.bottom }, name: d.getAttribute('aria-label') || d.className, out };
})()`;

const results = [];
const problems = [];

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain);
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=ring'], backgroundThrottling: false },
  });
  const index = path.join(DIST, 'renderer/index.html');
  const js = (code) =>
    Promise.race([win.webContents.executeJavaScript(`(async () => { ${code} })()`), new Promise((_, no) => setTimeout(() => no(new Error('page call timed out: ' + code.trim().slice(0, 100))), 20000))]);
  await win.loadFile(index, { query: { debug: '1' } });
  // Pressing beside a dialog is answered Close, and no first-run sheets get in the way.
  await js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'dark', showWelcome: false, onboarded: true }))}); localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ 'ui.backdropClick': 'close' }))}); return true`);
  await win.loadFile(index, { query: { debug: '1' } });
  await sleep(1500);

  const press = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await sleep(160);
  };
  const stillOpen = () => js(`return !!window.__ringDialog && document.contains(window.__ringDialog)`);
  const closeAll = () =>
    js(`__frameling.overlays.state.set((o) => ({ ...o, palette: false, prefs: null, help: null, sheet: null, about: false, onboarding: false, penCheck: undefined })); document.querySelector('.ui-backdrop [role=dialog], .io-backdrop [role=dialog]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true`).catch(() => {});

  for (const [name, setup, expect] of DIALOGS) {
    if (process.env.DIALOGRING_ONLY && !name.startsWith(process.env.DIALOGRING_ONLY)) continue;
    // Start clean: escape whatever is open, a new document.
    for (let i = 0; i < 3; i++) {
      await closeAll();
      await sleep(80);
      if (!(await js(`return !!document.querySelector('.ui-backdrop, .io-backdrop')`))) break;
    }
    await js(`__frameling.template('bouncing-ball'); window.__ringDialog = null; return true`);
    await sleep(120);
    for (const step of Array.isArray(setup) ? setup : [setup]) {
      await js(step.includes('return') ? step : step + '; return true').catch((e) => console.log('  setup failed:', name, String(e.message).slice(0, 80)));
      await sleep(300);
    }
    await sleep(900); // the dialog has finished popping in
    const p = await js(`return ${PROBE}`);
    if (p.none) {
      const ok = expect === 'none' && !!p.card;
      results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${expect === 'none' ? 'on screen with no dim area, so nothing to press' : 'did not open'}`);
      if (!ok) problems.push(`${name}: did not open`);
      continue;
    }
    if (expect === 'none') {
      problems.push(`${name}: expected no dialog but one is open`);
      results.push(`FAIL ${name}: a dialog is open`);
      continue;
    }
    const { rect: r, back: b } = p;
    const notes = [];
    let bad = 0;
    // The ring: 4, 12 and 23 px outside the middle of each side. Skip a side with no dim area that wide.
    const mid = { x: Math.round((r.l + r.r) / 2), y: Math.round((r.t + r.b) / 2) };
    const sides = [
      ['left', (d) => [Math.round(r.l - d), mid.y], r.l - b.l],
      ['right', (d) => [Math.round(r.r + d), mid.y], b.r - r.r],
      ['top', (d) => [mid.x, Math.round(r.t - d)], r.t - b.t],
      ['bottom', (d) => [mid.x, Math.round(r.b + d)], b.b - r.b],
    ];
    let probed = 0;
    for (const [side, at, room] of sides) {
      for (const d of [4, 12, RING - 1]) {
        if (room < d + 1) continue;
        const [x, y] = at(d);
        await press(x, y);
        probed++;
        if (!(await stillOpen())) {
          bad++;
          notes.push(`a press ${d}px outside the ${side} closed it`);
          break;
        }
      }
      if (bad) break;
    }
    // Well clear: it closes (Close is the answer), unless this dialog ignores the dim area.
    let far = 'no room';
    if (!bad) {
      const roomy = sides.find(([, , room]) => room >= RING + 20);
      if (roomy) {
        const [x, y] = roomy[1](RING + 12);
        await press(x, y);
        const open = await stillOpen();
        if (expect === 'ignores') {
          far = open ? 'stayed open, as it should' : 'CLOSED';
          if (!open) { bad++; notes.push('a press well clear closed a dialog that must ignore the dim area'); }
        } else {
          far = open ? 'STAYED OPEN' : 'closed';
          if (open) {
            // The export that is running cannot be closed; anything else should.
            bad++;
            notes.push(`a press ${RING + 12}px outside the ${roomy[0]} did not close it (Close was the answer)`);
          }
        }
      }
    }
    if (p.out) notes.push(`part of it sticks out ${p.out.over}px past the box the ring is measured from (${p.out.el})`);
    if (p.out) bad++;
    results.push(`${bad ? 'FAIL' : 'ok  '} ${name} [${p.name}]: ${probed} near presses did nothing; far press ${far}${notes.length ? '; ' + notes.join('; ') : ''}`);
    if (bad) problems.push(name);
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length} dialogs walked, ${problems.length} problem${problems.length === 1 ? '' : 's'}${problems.length ? ': ' + problems.join(', ') : ''}.`);
  app.exit(problems.length ? 1 : 0);
}).catch(fail);
