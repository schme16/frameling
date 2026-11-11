// Accessibility check of the built app: opens every panel, every tool's options and every dialog, runs axe-core on
// each, and checks the keyboard (Tab reaches things with a visible focus ring, Escape closes dialogs and focus goes
// back where it was).
//
//   npm run a11y                       (builds first)
//   npx electron scripts/a11y.cjs [--json out.json] [--themes] [--only name,name]
//
// --themes also runs axe's colour contrast rule on the main window and a few panels in every built-in theme.
// Exits 1 when anything serious (axe "serious" or "critical", or a keyboard failure) is found. A11Y_SHOW=1 shows
// the window. Needs `npm run build` first; it uses dist/ and never touches your settings (fresh profile per run).
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('--only')?.split(',');
const jsonOut = opt('--json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let axeSource;
try {
  // AXE_CORE points at an axe-core folder elsewhere, for a checkout whose node_modules doesn't have it yet.
  axeSource = fs.readFileSync(process.env.AXE_CORE ? path.join(process.env.AXE_CORE, 'axe.min.js') : require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.error('axe-core is missing: run npm install.');
  process.exit(2);
}

// A fresh profile, so the run starts like a first launch and never changes the real one.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-a11y-')));

// Each scenario sets the app up (`setup`, run in the page, may be async), then axe runs on `scope` (a selector, or
// the whole page). `dialog: true` also checks focus moved in, Tab stays in, Escape closes and focus comes back.
const tpl = (id) => `__frameling.template(${JSON.stringify(id)});`;
const run = (id) => `__frameling.run(${JSON.stringify(id)});`;
const DIALOGS = [
  ['palette', run('view.commandPalette')],
  ['help', run('help.contents')],
  ['help-topic', `__frameling.overlays.openHelp('keyboard-shortcuts')`],
  ['new-drawing', run('file.new')],
  ['examples', run('file.openExample')],
  ['themes', run('view.themes')],
  ['welcome', run('help.welcome')],
  ['about', run('help.about')],
  ['onboarding', run('help.meetQuill')],
  ['prefs-general', `__frameling.overlays.openPrefs('general')`],
  ['prefs-themes', `__frameling.overlays.openPrefs('themes')`],
  ['prefs-behaviour', `__frameling.overlays.openPrefs('behaviour')`],
  ['prefs-keyboard', `__frameling.overlays.openPrefs('keyboard')`],
  ['prefs-workspaces', `__frameling.overlays.openPrefs('workspaces')`],
  ['prefs-plugins', `__frameling.overlays.openPrefs('plugins')`],
  ['canvas-size', run('document.settings')],
  ['export', run('file.export')],
  ['export-tileset', tpl('tileset') + run('tiles.export')],
  ['rotate', tpl('hero-sprites') + run('pixel.rotate')],
  ['lipsync-name', tpl('lip-sync') + run('lipsync.nameFrames')],
  ['save-template', run('file.saveAsTemplate')],
  ['recent', run('file.openRecent')],
  ['recover', run('file.recover')],
];

// Documents that give the panels something to show.
const DOCS = { default: 'bouncing-ball', text: 'bouncing-logo', effects: 'bouncing-logo', rig: 'puppet', 'lip-sync': 'lip-sync', particles: 'sparkle-fx', tileset: 'tileset', palette: 'blank-pixel', 'symbol-props': 'bouncing-logo', camera: 'camera-parallax', 'clip-flow': 'hero-sprites', library: 'bouncing-logo' };

async function makeWindow() {
  const show = process.env.A11Y_SHOW === '1';
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    x: show ? undefined : -4000,
    y: show ? undefined : 0,
    skipTaskbar: !show,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: ['--frameling-version=a11y'],
      backgroundThrottling: false,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  win.errors = errors;
  return win;
}

async function load(win) {
  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'), { query: { debug: '1' } });
  await sleep(500);
  // Keyboard focus (and :focus-visible) only happens in a focused window.
  win.focus();
  win.webContents.focus();
  await win.webContents.executeJavaScript(axeSource + ';true');
}

const js = (win, code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);

async function key(win, keyCode, modifiers = []) {
  if (!win.webContents.isFocused()) win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  // Buttons press on the typed character, not the key going down.
  if (keyCode === 'Return') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await sleep(60);
}

// Back to a known start: no overlays, a document, no tool options left over.
async function reset(win, doc = 'bouncing-ball') {
  await js(win, `
    const f = __frameling;
    f.overlays.state.set((o) => ({ ...o, palette: false, prefs: null, help: null, sheet: null, about: false, onboarding: false }));
    f.template(${JSON.stringify(doc)});
    f.store().setUi({ tool: 'select' });
    document.activeElement?.blur?.();
  `);
  await sleep(150);
}

// Things axe can't know: a button that looks chosen (data-on, is-on, is-chosen) but doesn't say so to a screen reader.
const STATE_PROBE = `
  const root = SCOPE ? document.querySelector(SCOPE) : document;
  if (!root) return [];
  const out = [];
  for (const b of root.querySelectorAll('button[data-on], button.is-on, button.is-chosen, [role=button][data-on]')) {
    if (b.closest('[aria-hidden=true]')) continue;
    const says = ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-expanded', 'aria-current'].some((a) => b.hasAttribute(a));
    if (!says) {
      const cls = typeof b.className === 'string' ? '.' + b.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      out.push(b.tagName.toLowerCase() + cls + ' "' + (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30) + '"');
    }
  }
  return [...new Set(out)];
`;

async function axe(win, scope) {
  return js(
    win,
    `const ctx = ${scope ? `document.querySelector(${JSON.stringify(scope)})` : 'document'};
    if (!ctx) return { missing: true, violations: [] };
    const r = await axe.run(ctx, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    const violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), summary: n.failureSummary.split('\\n').slice(1, 3).join(' ').trim() })), count: v.nodes.length }));
    const unsaid = (() => { const SCOPE = ${JSON.stringify(scope ?? null)}; ${STATE_PROBE} })();
    if (unsaid.length) violations.push({ id: 'toggle-state', impact: 'serious', help: 'Looks chosen but does not say so', nodes: unsaid.slice(0, 6).map((t) => ({ target: t, summary: 'add aria-pressed (or aria-checked in a radiogroup)' })), count: unsaid.length });
    return { violations };`,
  );
}

// Is the focused element showing a ring? Any outline, or a box-shadow that isn't there when it isn't focused.
const FOCUS_PROBE = `
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const has = (c) => (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none');
  // A ring can also be on the row round it (:focus-within), or be a grip that lights up in the focus colour.
  const probe = document.createElement('i');
  probe.style.color = 'var(--focus)';
  document.body.appendChild(probe);
  const focusColour = getComputedStyle(probe).color;
  probe.style.color = 'var(--sunny)';
  const sunny = getComputedStyle(probe).color;
  probe.remove();
  const after = getComputedStyle(el, '::after').backgroundColor;
  const ring = has(cs) || (el.parentElement && has(getComputedStyle(el.parentElement))) || after === focusColour || after === sunny;
  const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 30) || el.tagName;
  const r = el.getBoundingClientRect();
  if (!el.dataset.a11yStop) el.dataset.a11yStop = String((window.__a11yN = (window.__a11yN || 0) + 1));
  const stop = el.dataset.a11yStop;
  const id = el.id ? '#' + el.id : '';
  const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
  return { ring, name, stop, sel: el.tagName.toLowerCase() + id + cls, visible: r.width > 0 && r.height > 0, inDialog: !!el.closest('[role=dialog]') };
`;

async function tabWalk(win, max, { inDialog = false } = {}) {
  const seen = [];
  const noRing = [];
  let stuck = 0;
  let last = null;
  for (let i = 0; i < max; i++) {
    await key(win, 'Tab');
    // Let focus transitions finish before looking for the ring.
    await sleep(120);
    const f = await js(win, FOCUS_PROBE);
    if (!f) continue;
    if (inDialog && !f.inDialog) return { seen, noRing, escaped: f.sel };
    const k = f.sel + '|' + f.name + '|' + f.stop;
    if (k === last) stuck++;
    last = k;
    if (seen.includes(k)) break;
    seen.push(k);
    if (!f.ring && f.visible) noRing.push(`${f.sel} "${f.name}"`);
  }
  return { seen, noRing, stuck };
}

async function dialogKeys(win) {
  const out = [];
  const inside = await js(win, `return !!document.activeElement?.closest('[role=dialog]')`);
  if (!inside) out.push('focus did not move into the dialog');
  const walk = await tabWalk(win, 40, { inDialog: true });
  if (walk.escaped) out.push(`Tab left the dialog (to ${walk.escaped})`);
  if (walk.noRing.length) out.push(`no visible focus ring: ${[...new Set(walk.noRing)].join(', ')}`);
  return { problems: out, stops: walk.seen.length };
}

const report = { scenarios: [], keyboard: [], themes: [] };
const add = (name, res) => {
  report.scenarios.push({ name, ...res });
  const v = res.violations ?? [];
  const tag = res.missing ? ' (not found)' : '';
  console.log(`${v.length ? 'x' : 'ok'} ${name}${tag}${v.length ? ': ' + v.map((x) => `${x.id}[${x.impact}]x${x.count}`).join(', ') : ''}`);
  for (const x of v) for (const n of x.nodes) console.log(`     ${x.id}: ${n.target}  ${n.summary}`);
};
const want = (name) => !only || only.some((o) => name.startsWith(o));

app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  ipcMain.handle('files:read', () => ({ error: 'No such file.' }));
  for (const ch of ['recent:list', 'autosave:listKept']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState']) ipcMain.handle(ch, () => true);
  for (const ch of ['app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  const lib = new Map();
  ipcMain.handle('library:list', (_e, kind) => [...lib.keys()].filter((k) => k.startsWith(kind + '/')).map((k) => ({ id: k.slice(kind.length + 1), size: lib.get(k).length, modified: 0 })));
  ipcMain.handle('library:read', (_e, kind, id) => lib.get(`${kind}/${id}`) ?? null);
  ipcMain.handle('library:write', (_e, kind, id, bytes) => void lib.set(`${kind}/${id}`, bytes));
  ipcMain.handle('library:remove', (_e, kind, id) => void lib.delete(`${kind}/${id}`));

  const win = await makeWindow();
  await load(win);
  // Skip the first-run sheets for the checks of everything else (they get their own scenarios).
  await js(win, `__frameling.prefs.set({ showWelcome: false, onboarded: true, showTips: true });`);
  await load(win);
  await reset(win);

  if (want('main')) add('main window', await axe(win));

  // Every panel, in a document that gives it something to show.
  const panels = await js(win, `return __frameling.panels()`);
  for (const id of panels) {
    const name = `panel ${id}`;
    if (!want(name)) continue;
    await reset(win, DOCS[id] ?? DOCS.default);
    await js(win, `__frameling.showPanel(${JSON.stringify(id)})`);
    await sleep(250);
    add(name, await axe(win, `#ui-panel-${id}`));
    // And again with everything selected, which is when most panels show their controls.
    await js(win, `__frameling.run('select.all')`);
    await sleep(250);
    add(`${name} (selected)`, await axe(win, `#ui-panel-${id}`));
  }

  // Every tool's options.
  const tools = await js(win, `return __frameling.tools()`);
  for (const t of tools) {
    const name = `tool ${t}`;
    if (!want(name)) continue;
    const doc = /^tile/.test(t) ? 'tileset' : /pixel|shade|dither/.test(t) ? 'blank-pixel' : /pose|bone|weights/.test(t) ? 'puppet' : t === 'camera' ? 'camera-parallax' : 'bouncing-ball';
    await reset(win, doc);
    await js(win, `__frameling.showPanel('tool-options'); __frameling.store().setUi({ tool: ${JSON.stringify(t)} });`);
    await sleep(200);
    add(name, await axe(win, '#ui-panel-tool-options'));
  }

  // Dialogs: axe, then the keyboard.
  for (const [n, setup] of DIALOGS) {
    const name = `dialog ${n}`;
    if (!want(name)) continue;
    await reset(win);
    // Start from a real button, so we can see focus come back to it.
    await js(win, `const b = document.querySelector('.ui-topbar button, header button, button'); b?.focus(); window.__a11yFrom = b;`);
    await js(win, setup);
    // Long enough for the pop-in animations, so axe doesn't judge half-faded words.
    await sleep(1200);
    const has = await js(win, `return !!document.querySelector('[role=dialog]')`);
    if (!has) {
      add(name, { missing: true, violations: [] });
      continue;
    }
    add(name, await axe(win, '[role=dialog]'));
    const k = await dialogKeys(win);
    // Escape from wherever focus is now (not inside a text box that wants it first).
    await js(win, `document.querySelector('[role=dialog]')?.focus()`);
    await key(win, 'Escape');
    await sleep(250);
    const after = await js(win, `return { open: !!document.querySelector('[role=dialog]'), back: document.activeElement === window.__a11yFrom, now: document.activeElement?.tagName + '.' + (document.activeElement?.className || '') }`);
    if (after.open) k.problems.push('Escape did not close it');
    else if (!after.back) k.problems.push(`focus did not come back (now on ${after.now})`);
    report.keyboard.push({ name, ...k });
    console.log(`   keys ${k.problems.length ? 'x ' + k.problems.join('; ') : 'ok'} (${k.stops} tab stops)`);
  }

  // Little popups opened from a button with the keyboard: focus goes in, Escape closes, focus comes back.
  const POPUPS = [
    ['blend modes', 'effects', 'bouncing-logo', '.fx-blend-btn', '.tl-floating'],
    ['layer options', 'timeline', 'bouncing-ball', '.tl-more', '.tl-floating'],
  ];
  for (const [n, panel, doc, opener, pop] of POPUPS) {
    const name = `popup ${n}`;
    if (!want(name)) continue;
    await reset(win, doc);
    await js(win, `__frameling.showPanel(${JSON.stringify(panel)}); __frameling.run('select.all')`);
    await sleep(250);
    const found = await js(win, `const b = document.querySelector(${JSON.stringify(opener)}); b?.focus(); window.__a11yFrom = b; return !!b`);
    if (!found) {
      report.keyboard.push({ name, problems: [], stops: 0, missing: true });
      console.log(`${name}: opener not found`);
      continue;
    }
    // Step off and back with the keyboard, so it has keyboard focus the way a person reaching it with Tab would.
    await key(win, 'Tab', ['shift']);
    await key(win, 'Tab');
    await js(win, `if (document.activeElement !== window.__a11yFrom) window.__a11yFrom?.focus()`);
    await key(win, 'Return');
    await sleep(300);
    const problems = [];
    const open = await js(win, `const p = document.querySelector(${JSON.stringify(pop)}); return { open: !!p, inside: !!p && p.contains(document.activeElement) }`);
    if (!open.open) problems.push('Enter did not open it');
    else {
      if (!open.inside) problems.push('focus did not move into it');
      add(name, await axe(win, pop));
      await key(win, 'Escape');
      await sleep(200);
      const after = await js(win, `return { open: !!document.querySelector(${JSON.stringify(pop)}), back: document.activeElement === window.__a11yFrom }`);
      if (after.open) problems.push('Escape did not close it');
      else if (!after.back) problems.push('focus did not come back');
    }
    report.keyboard.push({ name, problems, stops: 0 });
    console.log(`   keys ${problems.length ? 'x ' + problems.join('; ') : 'ok'}`);
  }

  // The main window with the keyboard alone: Tab through it and look for things with no ring, and traps.
  if (want('tab')) {
    await reset(win);
    const walk = await tabWalk(win, 260);
    const problems = [];
    if (walk.noRing.length) problems.push(`no visible focus ring: ${[...new Set(walk.noRing)].join(', ')}`);
    if (walk.stuck > 3) problems.push('focus got stuck');
    report.keyboard.push({ name: 'main tab order', problems, stops: walk.seen.length, order: walk.seen });
    console.log(`tab main: ${walk.seen.length} stops ${problems.length ? 'x ' + problems.join('; ') : 'ok'}`);
  }

  // Colour contrast in every theme.
  if (flag('--themes')) {
    // The status bar tip fades between lines every few seconds, and axe would catch it half faded.
    await js(win, `__frameling.prefs.set({ showTips: false })`);
    const themes = await js(win, `return __frameling.themes()`);
    for (const { id: th, mode } of themes) {
      await js(win, `__frameling.prefs.set({ theme: ${JSON.stringify(mode)}, ${mode === 'dark' ? 'darkTheme' : 'lightTheme'}: ${JSON.stringify(th)} })`);
      const counts = {};
      const nodes = [];
      for (const [label, panel, doc] of [['main', null, 'bouncing-ball'], ['effects', 'effects', 'bouncing-ball'], ['particles', 'particles', 'sparkle-fx'], ['rig', 'rig', 'puppet'], ['text', 'text', 'bouncing-ball'], ['library', 'library', 'bouncing-logo']]) {
        await reset(win, doc);
        if (panel) await js(win, `__frameling.showPanel(${JSON.stringify(panel)})`);
        await sleep(200);
        const r = await js(win, `const r = await axe.run(document, { runOnly: ['color-contrast'] }); return r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ') + '  ' + (n.any[0]?.message || '').replace(/\\s+/g, ' ').slice(0, 140)));`);
        counts[label] = r.length;
        nodes.push(...r.map((x) => `${label}: ${x}`));
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      report.themes.push({ theme: th, total, counts, nodes: [...new Set(nodes)] });
      console.log(`theme ${th}: ${total} contrast ${total === 1 ? 'problem' : 'problems'}`);
      for (const n of [...new Set(nodes)].slice(0, 12)) console.log(`     ${n}`);
    }
  }

  const serious = report.scenarios.flatMap((s) => (s.violations ?? []).filter((v) => v.impact === 'serious' || v.impact === 'critical')).length;
  const keyProblems = report.keyboard.filter((k) => k.problems.length).length;
  const all = report.scenarios.reduce((n, s) => n + (s.violations ?? []).length, 0);
  console.log(`\n${report.scenarios.length} views checked: ${all} axe ${all === 1 ? 'rule' : 'rules'} broken (${serious} serious or worse), ${keyProblems} keyboard ${keyProblems === 1 ? 'problem' : 'problems'}.`);
  if (win.errors.length) console.log(`console errors:\n  ${[...new Set(win.errors)].slice(0, 10).join('\n  ')}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  win.destroy();
  app.exit(serious || keyProblems ? 1 : 0);
});
