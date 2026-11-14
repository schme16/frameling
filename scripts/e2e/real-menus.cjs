// Presses things with a real mouse and checks the menu that opens can be SEEN and used, in the real app.
//
// Every unit test that opens one of these menus clicks with element.click() and looks for the menu in the page. That
// passes while the menu is hidden behind a dialog (the Themes cards in Preferences were exactly that: the menu was in
// the page, under the dimmed backdrop, and nobody could reach it). Here the press is a real mouse event, and "open" means
// that the element under the middle of every menu entry is that entry, so a menu that is covered fails.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/real-menus.cjs
//
// REALMENUS_DIST=<dir> checks another copy of dist/ (the before numbers). REALMENUS_SHOTS=<dir> saves a picture of
// each open menu (themes-menu-dark.png and so on). Exits 1 when any case fails.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`real-menus run failed: ${why?.stack ?? why}`);
  app.exit(2);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
setTimeout(() => fail(new Error('timed out')), 4 * 60_000).unref();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-realmenus-')));

const DIST = process.env.REALMENUS_DIST || path.join(__dirname, '../../dist');
const shots = process.env.REALMENUS_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

// Runs in the page: the open dock menu's entries, and whether each one is what you would hit if you pressed its middle.
const MENU = `(() => {
  const m = document.querySelector('.ui-dock-menu');
  if (!m) return null;
  const items = [...m.querySelectorAll('button')].map((b) => {
    const q = b.getBoundingClientRect();
    const x = Math.round(q.left + q.width / 2), y = Math.round(q.top + q.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { label: b.textContent.trim(), x, y, seen: !!hit && b.contains(hit), disabled: b.disabled, covered: hit && !b.contains(hit) ? String(hit.className).slice(0, 60) : '' };
  });
  return { items };
})()`;

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  installIpcStubs(ipcMain, {});
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    useContentSize: true,
    show: true,
    x: 0,
    y: 0,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(DIST, 'preload/preload.cjs'), contextIsolation: true, sandbox: true, additionalArguments: ['--frameling-version=real-menus'], backgroundThrottling: false },
  });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const send = (e) => wc.sendInputEvent(e);
  const index = path.join(DIST, 'renderer/index.html');
  const prefs = (extra = {}) => js(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify({ theme: 'dark', showWelcome: false, onboarded: true, ...extra }))}); return true`);

  /** A real press: move there, press, let go. */
  const press = async (x, y, button = 'left') => {
    send({ type: 'mouseMove', x, y });
    await sleep(250);
    send({ type: 'mouseDown', x, y, button, clickCount: 1 });
    await sleep(40);
    send({ type: 'mouseUp', x, y, button, clickCount: 1 });
    await sleep(350);
  };
  const centre = (sel, fy = 0.5) => js(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 150)); const q = e.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height * ${fy}) }`);
  const escape = async () => {
    send({ type: 'keyDown', keyCode: 'Escape' });
    send({ type: 'keyUp', keyCode: 'Escape' });
    await sleep(250);
  };

  const results = [];
  const check = (name, ok, why = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !why ? '' : `: ${why}`}`);
  };
  /** The menu after a press: it must be open, with every entry visible and not covered by anything. */
  const seeMenu = async (name, shot) => {
    const m = await js(`return ${MENU}`);
    if (!m) {
      check(`${name}: the menu opens`, false, 'no menu in the page');
      return null;
    }
    const covered = m.items.filter((i) => !i.seen);
    check(`${name}: every entry can be seen and pressed`, covered.length === 0, covered.map((i) => `"${i.label}" is under ${i.covered || 'something'}`).join('; '));
    if (shots && shot) fs.writeFileSync(path.join(shots, `${shot}.png`), (await wc.capturePage()).toPNG());
    return m;
  };

  // ------------------------------------------------------------ the Themes cards in Preferences
  for (const mode of ['dark', 'light']) {
    await wc.loadFile(path.join(DIST, 'renderer/index.html'), { query: { debug: '1' } });
    await prefs({ theme: mode });
    await wc.loadFile(index, { query: { debug: '1' } });
    await sleep(1200);
    await js(`__frameling.overlays.openPrefs('themes'); return true`);
    await sleep(1000);
    // The art of the fourth card: away from the buttons that swoop up over the foot of a card.
    const c = await centre('.th-card:nth-child(4) .th-card-pick', 0.2);
    await press(c.x, c.y);
    const m = await seeMenu(`Themes card (${mode})`, `themes-menu-${mode}`);
    if (m) {
      const want = await js(`return document.querySelector('.th-card:nth-child(4) .th-card-pick').getAttribute('aria-label').split(',')[0]`);
      const night = m.items.find((i) => i.label === 'Use it at night');
      check(`Themes card (${mode}): the menu offers day, night and both`, ['Use it by day', 'Use it at night', 'Use it for both'].every((l) => m.items.some((i) => i.label === l)));
      if (night) {
        await press(night.x, night.y);
        const got = await js(`return JSON.parse(localStorage.getItem('frameling.prefs.v1') || '{}').darkTheme || ''`);
        const id = await js(`return __frameling.prefs.get().darkTheme`);
        const name = await js(`return document.querySelector('.th-current-words')?.textContent || ''`);
        check(`Themes card (${mode}): pressing "Use it at night" with the mouse sets the night theme`, !!id && name.includes(want), `night theme is "${id}", the page says "${name}", wanted "${want}" (${got})`);
        check(`Themes card (${mode}): the menu shuts after a choice`, !(await js(`return !!document.querySelector('.ui-dock-menu')`)));
        check(`Themes card (${mode}): Preferences is still open`, await js(`return !!document.querySelector('.ui-prefs')`));
      }
    }
    if (await js(`return !!document.querySelector('.ui-dock-menu')`)) await escape();
    // The foot of a card (its name) is a press on the card too: it used to land on a button that swooped up over it.
    const foot = await centre('.th-card:nth-child(5) .th-card-pick', 0.92);
    await press(foot.x, foot.y);
    const m2 = await seeMenu(`Themes card name (${mode})`, null);
    const copy = m2 && m2.items.find((i) => i.label.startsWith('Make a copy'));
    check(`Themes card name (${mode}): pressing the name opens the menu, with a way to make a copy`, !!copy);
    if (copy) {
      await press(copy.x, copy.y);
      check(`Themes card name (${mode}): pressing "Make a copy" opens the theme editor`, await js(`return !!document.querySelector('.th-editor')`));
    }
    if (await js(`return !!document.querySelector('.ui-dock-menu')`)) await escape();
  }

  // ------------------------------------------------------------ the tool rail
  await wc.loadFile(index, { query: { debug: '1' } });
  await prefs({ theme: 'dark' });
  await wc.loadFile(index, { query: { debug: '1' } });
  await sleep(1200);
  await js(`__frameling.dock.applyWorkspace('draw'); __frameling.template('bouncing-ball'); document.querySelector('.ui-choice')?.click(); return true`);
  await sleep(900);
  await js(`__frameling.overlays.closeSheet?.(); return true`);
  await sleep(300);

  const layer = await centre('.ui-tool-layer');
  if (!layer) check('Tool rail layer line: it is there to press', false, 'no .ui-tool-layer in the rail');
  else {
    await press(layer.x, layer.y);
    const m = await seeMenu('Tool rail layer line', 'layer-line-menu');
    if (m) {
      const open = m.items.find((i) => /^(Go to|Add a)/.test(i.label)) ?? m.items[0];
      await press(open.x, open.y);
      check('Tool rail layer line: the menu shuts after a choice', !(await js(`return !!document.querySelector('.ui-dock-menu')`)));
    }
    await escape();
  }

  // A right press on the rail opens the tools menu; "Change the tools..." turns on editing, where a press on a tool opens its menu.
  const rail = await centre('nav.ui-tools .ui-tool');
  if (!rail) check('Tool rail: a tool is there to press', false, 'no .ui-tool');
  else {
    await press(rail.x, rail.y, 'right');
    const m = await seeMenu('Tool rail right press', null);
    const change = m && m.items.find((i) => i.label.startsWith('Change the tools'));
    if (change) {
      await press(change.x, change.y);
      const tool = await centre('nav.ui-tools .ui-tool');
      await press(tool.x, tool.y);
      await seeMenu('Tool rail tool menu (while changing the tools)', 'tool-menu');
      await escape();
    } else check('Tool rail right press: offers "Change the tools..."', false);
  }

  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad} of ${results.length} real-press checks passed`);
  app.exit(bad ? 1 : 0);
});
