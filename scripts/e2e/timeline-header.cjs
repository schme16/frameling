// Checks the timeline header in the real app at 1280 and 1400 pixels wide, with and without a play range or light table
// chip: it stays on one row, nothing clips (the zoom slider included), every button that fits is shown (unfolding one more
// would overflow, or would not leave the spare room that stops flicker), and the "more" menu lists only what is folded.
// Run inside xvfb:
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/timeline-header.cjs
//
// Set HEADER_SHOTS=<dir> to also save a screenshot of the header at each size and state (HEADER_SCALE=2 for sharper
// ones, which needs a screen twice as big: -screen 0 3200x2000x24).
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

// What a person reaches for all the time: it has to stay on the header at both sizes, in every state.
const ALWAYS = ['Go to the first frame', 'Back one frame', 'Play', 'Forward one frame', 'Go to the last frame', 'Loop', 'Frames per second'];
// Fold order (src/timeline/headerFold.ts), with a label that names each step's button on the header.
const STEPS = [
  ['pingpong', 'back and forth'],
  ['sound', 'Add a sound'],
  ['clean', 'Clean timeline'],
  ['fit', 'Fit the whole animation'],
  ['edit', 'Start a new blank drawing'],
  ['hold', 'Hold'],
  ['onion', 'See the frames around this one'],
  ['zoom', 'Timeline zoom'],
];
// What the menu names for each step.
const MENU_WORDS = { pingpong: /ping-pong|back and forth/i, sound: /sound/i, clean: /clean timeline/i, fit: /fit the whole/i, edit: /new (blank )?drawing/i, hold: /hold drawing for/i, onion: /frames around this one|onion/i };

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
    folded: (h.getAttribute('data-folded') || '').split(' ').filter(Boolean),
    more: (() => { const o = h.querySelector('.tl-overflow'); return !!o && getComputedStyle(o).display !== 'none'; })(),
    slider: (() => { const i = h.querySelector('input[aria-label="Timeline zoom"]'); if (!i || getComputedStyle(i).display === 'none') return null; const r = i.getBoundingClientRect(); return { width: Math.round(r.width), inside: r.right <= hb.right && r.left >= hb.left }; })(),
  };
})()`;

// Would unfolding the last folded step have fitted? (Needs room for it plus the spare that stops flicker.)
const PROBE = `(() => {
  const h = document.querySelector('.tl-header');
  const folded = (h.getAttribute('data-folded') || '').split(' ').filter(Boolean);
  if (!folded.length) return null;
  h.setAttribute('data-folded', folded.slice(0, -1).join(' '));
  const grow = h.querySelector('.tl-grow').getBoundingClientRect().width;
  const overflow = h.scrollWidth > h.clientWidth + 1;
  h.setAttribute('data-folded', folded.join(' '));
  return { overflow, grow: Math.round(grow), step: folded[folded.length - 1] };
})()`;

const STATES = [
  { name: 'plain', setup: '' },
  { name: 'play range', setup: '__frameling.store().update("range", (d) => { d.inOut = { start: 2, end: 9 }; })' },
  { name: 'light table', setup: '__frameling.store().setUi({ lightTable: { frame: 0, opacity: 0.4 } })' },
  { name: 'play range and light table', setup: '__frameling.store().update("range", (d) => { d.inOut = { start: 2, end: 9 }; }); __frameling.store().setUi({ lightTable: { frame: 0, opacity: 0.4 } })' },
  { name: 'clean timeline on', setup: '__frameling.prefs.set({ cleanTimeline: true })' },
  { name: 'ping-pong on', setup: '__frameling.store().setUi({ pingPong: true })' },
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
  const seenFolds = new Set();
  for (const st of STATES) {
    await js(`__frameling.store().update("reset", (d) => { delete d.inOut; }); __frameling.store().setUi({ lightTable: null, pingPong: false }); __frameling.prefs.set({ cleanTimeline: false }); true`);
    if (st.setup) await js(st.setup + '; true');
    await sleep(350);
    const m = await js(MEASURE);
    const label = `${width} wide, ${st.name} (timeline ${m.container}px)`;
    const has = (want) => m.names.some((n) => n.toLowerCase().includes(want.toLowerCase()));
    check(!m.clipped, `${label}: nothing clipped (${m.scroll} of ${m.client})`);
    check(m.spread <= 40 && m.height <= 44, `${label}: one row (${m.height}px tall)`);
    check(!m.beyond.length, `${label}: every button inside the header${m.beyond.length ? ' (outside: ' + m.beyond.join(', ') + ')' : ''}`);
    for (const want of ALWAYS) check(has(want), `${label}: "${want}" stays on the header`);
    check(m.slider && m.slider.inside && m.slider.width >= 40, `${label}: the zoom slider shows whole (${m.slider ? m.slider.width + 'px' : 'missing'})`);
    // Each step is either on the header or folded, and nothing is both.
    for (const [step, name] of STEPS) {
      const isFolded = m.folded.includes(step);
      check(isFolded ? !has(name) : has(name), `${label}: ${step} is ${isFolded ? 'folded away' : 'on the header'}`);
    }
    // Folding runs in order, rarest first.
    check(m.folded.every((f, i) => f === STEPS[i][0]), `${label}: folded in order (${m.folded.join(', ') || 'nothing'})`);
    check(m.more === m.folded.length > 0, `${label}: the more button shows only when something is folded`);
    // Everything that fits is shown: one more unfolded would overflow, or leave less than the spare room that stops flicker.
    const probe = await js(PROBE);
    if (probe) check(probe.overflow || probe.grow < 28, `${label}: nothing that fits is folded (next to unfold: ${probe.step}, spare ${probe.grow}px)`);
    seenFolds.add(m.folded.join(','));
    // The more button lists only what is folded; a switch that is on shows a dot and says so.
    const menu = await js(`(() => { const o = document.querySelector('.tl-overflow'); if (!o || getComputedStyle(o).display === 'none') return null; const label = o.getAttribute('aria-label'); const dot = !!o.querySelector('.tl-overflow-dot'); o.click(); return new Promise((r) => setTimeout(() => { const t = [...document.querySelectorAll('.tl-menu-item')].map((b) => b.textContent); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); r({ items: t, label, dot }); }, 150)); })()`);
    if (menu) {
      console.log(`     "more" menu: ${menu.items.join(' | ')}`);
      for (const [step] of STEPS) {
        if (!MENU_WORDS[step]) continue;
        const inMenu = menu.items.some((t) => MENU_WORDS[step].test(t));
        check(inMenu === m.folded.includes(step), `${label}: the menu ${m.folded.includes(step) ? 'lists' : 'does not repeat'} ${step}`);
      }
      const on = (st.name === 'ping-pong on' && m.folded.includes('pingpong')) || (st.name === 'clean timeline on' && m.folded.includes('clean'));
      check(menu.dot === on, `${label}: the dot on the more button ${on ? 'shows' : 'is off'}${on ? ` (${menu.label})` : ''}`);
      if (on) check(/^More, 1 switch on$/.test(menu.label), `${label}: the more button says a switch is on`);
    }
    if (process.env.HEADER_SHOTS) {
      fs.mkdirSync(process.env.HEADER_SHOTS, { recursive: true });
      const r = await js(`(() => { const b = document.querySelector('.tl-header').getBoundingClientRect(); return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()`);
      fs.writeFileSync(path.join(process.env.HEADER_SHOTS, `header-${width}-${st.name.replace(/ /g, '-')}.png`), (await win.webContents.capturePage(r)).toPNG());
    }
    console.log(`     folded at ${width}, ${st.name}: ${m.folded.join(', ') || 'nothing'}`);
  }
  // The menu is the way to things that fold: the onion settings open from it, and a quest's selectors find the items in it.
  if (width === 1280) {
    await js(`__frameling.store().update("range", (d) => { d.inOut = { start: 2, end: 9 }; }); true`);
    await sleep(350);
    const label = `${width} wide, play range chip`;
    const foldedNow = () => js(`(document.querySelector('.tl-header').getAttribute('data-folded') || '')`);
    // Onion skin is among the last to fold, so at 1280 it never folds: narrow the window until it does.
    let f = await foldedNow();
    for (let w = width; !f.split(' ').includes('onion') && w > 600; ) {
      w -= 60;
      win.setContentSize(w, 800);
      await sleep(400);
      f = await foldedNow();
    }
    check(f.split(' ').includes('onion'), `${label}: the onion buttons are folded once the window is narrowed (${f})`);
    const opened = await js(`(() => { const o = document.querySelector('.tl-header .tl-overflow'); o.click(); return new Promise((r) => setTimeout(() => {
      const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const find = (sel) => [...document.querySelectorAll(sel)].find(shown);
      const items = [...document.querySelectorAll('.tl-more-menu .tl-menu-item')];
      const entry = items.find((b) => b.getAttribute('aria-label') === 'Onion skin settings');
      const b = o.getBoundingClientRect();
      r({
        copy: !!find(':is(.tl-header, .tl-more-menu) [aria-label^="Copy this drawing"]'),
        onion: !!find(':is(.tl-header, .tl-more-menu) [aria-label^="See the frames around"]'),
        hold: !!find(':is(.tl-header, .tl-more-menu) [aria-label="How long to hold this drawing"]'),
        settings: !!entry, bottom: b.bottom, left: b.left,
      });
      entry && entry.click();
    }, 200)); })()`);
    check(opened.copy && opened.onion && opened.hold, `${label}: quest selectors find the folded buttons in the menu`);
    check(opened.settings, `${label}: the menu has "Onion skin settings"`);
    await sleep(250);
    const pop = await js(`(() => { const p = document.querySelector('.tl-pop'); if (!p) return null; const r = p.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, inside: r.right <= innerWidth && r.bottom <= innerHeight, menuGone: !document.querySelector('.tl-more-menu'), text: p.textContent.slice(0, 40) }; })()`);
    check(!!pop && pop.menuGone && /Onion skin/.test(pop.text), `${label}: the onion settings open from the menu (${pop ? pop.text : 'nothing'})`);
    check(!!pop && pop.inside && Math.abs(pop.top - (opened.bottom + 4)) < 3 && pop.left <= opened.left + 3 || (!!pop && pop.inside && pop.right >= opened.left), `${label}: the settings sit under the more button and on screen`);
    // The settings really work from here: one more frame before.
    const before = await js(`__frameling.store().get().ui.onion.before`);
    await js(`document.querySelector('.tl-pop [aria-label="More frames before"]').click(); true`);
    await sleep(100);
    check((await js(`__frameling.store().get().ui.onion.before`)) === before + 1, `${label}: "More frames before" works from the menu's box`);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); true`);
    await sleep(150);
    check(await js(`!document.querySelector('.tl-pop')`), `${label}: the settings box closes`);
    if (process.env.HEADER_SHOTS) {
      await js(`document.querySelector('.tl-header .tl-overflow').click(); true`);
      await sleep(250);
      fs.writeFileSync(path.join(process.env.HEADER_SHOTS, `header-${width}-more-menu.png`), (await win.webContents.capturePage()).toPNG());
    }
  }
  check(seenFolds.size > 1, `${width} wide: the folding follows the content (${seenFolds.size} different folds seen)`);
  win.destroy();
}

if (process.env.HEADER_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.HEADER_SCALE);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept', 'library:list']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState', 'library:write', 'library:remove', 'plugins:setDiagnostics']) ipcMain.handle(ch, () => true);
  ipcMain.handle('library:read', () => null);
  for (const ch of ['app:documentState', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  for (const w of [1280, 1400]) await run(w);
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  app.exit(failed ? 1 : 0);
});
