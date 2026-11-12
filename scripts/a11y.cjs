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
// Version 2 plugins from the repo, for the dialogs that need one installed first.
const pluginFiles = (n) => Object.fromEntries(['manifest.json', 'main.js'].map((f) => [f, fs.readFileSync(path.join(__dirname, '../plugins/examples', n, f), 'utf8')]));
const installPlugin = (n) => `window.__framelingPlugins.install(${JSON.stringify(pluginFiles(n))}); true`;
const waitMs = (ms) => `await new Promise((r) => setTimeout(r, ${ms})); true`;
const approve = (all) => `${all ? `document.querySelectorAll('.plugin-approve [role=switch]').forEach((b) => b.click());` : ''} document.querySelector('.plugin-approve .ui-btn-primary')?.click(); true`;
// The picture import dialog, on a sprite sheet and on an animated GIF (the help pictures' samples).
const picture = (file) => `void __framelingPicture.open(${JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, 'docs/help/assets', file))))}, ${JSON.stringify(file)}); true`;
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
  ['prefs-snapping', `__frameling.overlays.openPrefs('snapping')`],
  ['prefs-workspaces', `__frameling.overlays.openPrefs('workspaces')`],
  ['prefs-plugins', `__frameling.overlays.openPrefs('plugins')`],
  // The question a version 2 plugin asks (each power off to start with), the Export dialog with a plugin's own options, and
  // Preferences with a plugin that has its powers switched on and off.
  ['plugin-permissions', installPlugin('star-kit')],
  ['plugin-export-options', [installPlugin('export-report'), approve(false), waitMs(1500), run('plugin.export-report.export.report')]],
  ['prefs-plugins-powers', [installPlugin('star-kit'), approve(true), waitMs(1500), `__frameling.overlays.openPrefs('plugins')`]],
  ['prefs-features', `__frameling.overlays.openPrefs('features')`],
  ['canvas-size', run('document.settings')],
  ['export', run('file.export')],
  ['export-tileset', [tpl('tileset'), run('tiles.export')]],
  ['rotate', [tpl('hero-sprites'), run('pixel.rotate')]],
  ['import-picture', [tpl('hero-sprites'), picture('slime-sheet.png')]],
  ['import-picture-gif', [tpl('hero-sprites'), picture('slime-bounce.gif')]],
  ['lipsync-name', [tpl('lip-sync'), run('lipsync.nameFrames')]],
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

// A page call that never answers fails after 20 seconds instead of hanging the whole run.
const js = (win, code) =>
  Promise.race([
    win.webContents.executeJavaScript(`(async () => { ${code} })()`),
    new Promise((_, no) => setTimeout(() => no(new Error('page call timed out: ' + code.trim().slice(0, 120))), 20000)),
  ]);

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
  // A question left over from the last scenario (a pixel template asks one) must not land on top of this one.
  await dismissChoice(win);
}

// Some templates ask a first-time question ("Opening pixel art"). That is the app working, not the dialog under
// test, so answer it (Escape takes the suggested answer) before the real scenario is judged.
async function dismissChoice(win) {
  if (!(await js(win, `return !!document.querySelector('.ui-choice')`))) return;
  await js(win, `document.querySelector('.ui-choice')?.focus()`);
  await key(win, 'Escape');
  await sleep(200);
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
  // In a drawing (SVG), the ring is the shape's outline turning the focus colour.
  const strokes = el instanceof SVGElement ? [el, ...el.querySelectorAll('rect, circle, path, line')].map((x) => getComputedStyle(x).stroke) : [];
  // A wide area (the timeline grid) can be ringed on the scroller round it: an outline on an ancestor close by.
  let outer = false;
  for (let a = el.parentElement, n = 0; a && n < 3; a = a.parentElement, n++) {
    const c = getComputedStyle(a);
    if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) outer = true;
  }
  const ring = has(cs) || outer || (el.parentElement && has(getComputedStyle(el.parentElement))) || after === focusColour || after === sunny || strokes.includes(focusColour);
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

// Tab through one panel from its first control: every stop needs a ring.
async function panelKeys(win, scope) {
  const first = await js(win, `const p = document.querySelector(${JSON.stringify(scope)}); const f = p && [...p.querySelectorAll('button, input, select, textarea, [href], [tabindex]')].find((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length); f?.focus(); return !!f`);
  if (!first) return null;
  await key(win, 'Tab', ['shift']);
  await key(win, 'Tab');
  const noRing = [];
  let stops = 0;
  for (let i = 0; i < 60; i++) {
    const f = await js(win, `const inside = !!document.activeElement?.closest(${JSON.stringify(scope)}); if (!inside) return null; ${FOCUS_PROBE}`);
    if (!f) break;
    stops++;
    if (!f.ring && f.visible) noRing.push(`${f.sel} "${f.name}"`);
    await key(win, 'Tab');
    await sleep(100);
  }
  return { problems: noRing.length ? [`no visible focus ring: ${[...new Set(noRing)].join(', ')}`] : [], stops };
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

  // Panels stacked in groups on the right (under the Properties rail) and along the bottom, and a window over the canvas.
  if (want('stacked groups')) {
    await js(win, `__frameling.dock.placePanel('preview', { zone: 'right', group: 0, split: 'after' }); __frameling.dock.placePanel('library', { zone: 'bottom', group: 0, split: 'after' }); __frameling.dock.floatPanel('help', { x: 300, y: 200 })`);
    await sleep(500);
    add('stacked groups and a window', await axe(win));
    await js(win, `__frameling.dock.resetLayout()`);
    await sleep(300);
  }

  // Every panel, in a document that gives it something to show.
  const panels = await js(win, `return __frameling.panels()`);
  for (const id of panels) {
    const name = `panel ${id}`;
    if (!want(name)) continue;
    await reset(win, DOCS[id] ?? DOCS.default);
    // The timeline is checked with folders inside folders, the deepest case of its tree.
    if (id === 'timeline') await js(win, `__frameling.store().update('Folders in folders', (d) => { d.folders = { fOut: { id: 'fOut', name: 'Scene', visible: true, opacity: 1 }, fIn: { id: 'fIn', name: 'Inner', visible: true, opacity: 1, parent: 'fOut' } }; d.layers.forEach((l, i) => { l.folder = i === 0 ? 'fOut' : 'fIn'; }); });`);
    await js(win, `__frameling.showPanel(${JSON.stringify(id)})`);
    await sleep(250);
    add(name, await axe(win, `#ui-panel-${id}`));
    // And again with everything selected, which is when most panels show their controls.
    await js(win, `__frameling.run('select.all')`);
    await sleep(250);
    add(`${name} (selected)`, await axe(win, `#ui-panel-${id}`));
    const k = await panelKeys(win, `#ui-panel-${id}`);
    if (k) {
      report.keyboard.push({ name, ...k });
      if (k.problems.length) console.log(`   keys x ${k.problems.join('; ')}`);
    }
  }

  // The Artboards panel with a variation open (size cuts, differences list, reset buttons).
  if (want('panel artboards (variation open)')) {
    await reset(win);
    await js(win, `__framelingArtboards.load('variations'); __frameling.showPanel('artboards'); __framelingArtboards.ops.goToArtboard(__frameling.store().get().doc.artboards[1].id, true)`);
    await sleep(400);
    add('panel artboards (variation open)', await axe(win, '.ab-panel'));
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
    // A list of steps runs one at a time, answering a first-time question between them.
    for (const step of Array.isArray(setup) ? setup : [setup]) {
      await js(win, step);
      await sleep(300);
      await dismissChoice(win);
    }
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

  // Little popups opened from a button with the keyboard: focus goes in, Escape closes, focus comes back, and Tab
  // (or Shift+Tab) out of one closes it and lands on another control, not back on the opener. Every one sets up
  // its own state (panel, document, preference), so `--only "popup name"` works alone.
  //   open: 'enter' presses Enter on the opener, 'menu' presses Shift+F10 on it, 'context' sends a context menu event
  //   to it (what a right-click does).
  const POPUPS = [
    { n: 'blend modes', panel: 'effects', doc: 'bouncing-logo', opener: '.fx-blend-btn', pop: '.tl-floating', open: 'enter' },
    { n: 'layer options', panel: 'timeline', doc: 'bouncing-ball', opener: '.tl-more', pop: '.tl-floating', open: 'enter' },
    { n: 'hold for', panel: 'timeline', doc: 'bouncing-ball', opener: '.tl-hold-menu', pop: '.tl-floating', open: 'enter' },
    { n: 'onion skin', panel: 'timeline', doc: 'bouncing-ball', opener: 'button[aria-label="Onion skin settings"]', pop: '.tl-floating', open: 'enter' },
    { n: 'all panels', panel: null, doc: 'bouncing-ball', opener: '[data-panels-button]', pop: '.rd-picker', open: 'enter' },
    { n: 'tool group', panel: null, doc: 'bouncing-ball', prefs: { toolRail: 'stacked' }, opener: 'button[data-tool-group]', pop: '.ui-tool-fly', open: 'menu' },
    { n: 'swatch menu', panel: 'colors', doc: 'bouncing-ball', opener: '.cv-swatch:not(.cv-swatch-add)', pop: '.cv-menu', open: 'context' },
    { n: 'snapping options', panel: null, doc: 'bouncing-ball', opener: '[data-snap-button]', pop: '.sn-pop', open: 'enter' },
    { n: 'palette colour', panel: 'palette', doc: 'blank-pixel', opener: '.px-chip', pop: '.px-menu', open: 'context' },
  ];
  const popOpen = (pop) => js(win, `const p = document.querySelector(${JSON.stringify(pop)}); return { open: !!p, inside: !!p && p.contains(document.activeElement) }`);
  // Open it from the opener the way a person at the keyboard would. Returns false when it did not open.
  const openPopup = async (o) => {
    await js(win, `const b = document.querySelector(${JSON.stringify(o.opener)}); b?.focus(); window.__a11yFrom = b; return !!b`);
    if (o.open === 'enter') {
      // Step off and back with the keyboard, so it has keyboard focus the way a person reaching it with Tab would.
      await key(win, 'Tab', ['shift']);
      await key(win, 'Tab');
      await js(win, `if (document.activeElement !== window.__a11yFrom) window.__a11yFrom?.focus()`);
      await key(win, 'Return');
    } else if (o.open === 'menu') await key(win, 'F10', ['shift']);
    else await js(win, `const b = window.__a11yFrom; const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.bottom - 4 }))`);
    await sleep(300);
    return (await popOpen(o.pop)).open;
  };
  for (const o of POPUPS) {
    const name = `popup ${o.n}`;
    if (!want(name)) continue;
    await reset(win, o.doc);
    await js(win, `__frameling.prefs.set(${JSON.stringify(o.prefs ?? { toolRail: 'two' })}); ${o.panel ? `__frameling.showPanel(${JSON.stringify(o.panel)});` : ''} __frameling.run('select.all')`);
    for (let i = 0; i < 20 && !(await js(win, `return !!document.querySelector(${JSON.stringify(o.opener)})`)); i++) await sleep(150);
    if (!(await js(win, `return !!document.querySelector(${JSON.stringify(o.opener)})`))) {
      report.keyboard.push({ name, problems: [], stops: 0, missing: true });
      console.log(`${name}: opener not found`);
      continue;
    }
    const problems = [];
    if (!(await openPopup(o))) problems.push('it did not open');
    else {
      const open = await popOpen(o.pop);
      if (!open.inside) problems.push('focus did not move into it ' + (await js(win, `return (document.activeElement?.outerHTML || '').slice(0,150)`)));
      add(name, await axe(win, o.pop));
      await key(win, 'Escape');
      await sleep(200);
      const after = await js(win, `return { open: !!document.querySelector(${JSON.stringify(o.pop)}), back: document.activeElement === window.__a11yFrom }`);
      if (after.open) problems.push('Escape did not close it');
      else if (!after.back) problems.push('focus did not come back (now on ' + (await js(win, `return document.activeElement?.tagName + '.' + document.activeElement?.className`)) + ')');
      // Tab forward from its last control, then Shift+Tab back from its first, then focus sent elsewhere: each closes it.
      for (const how of ['Tab', 'Shift+Tab', 'focus elsewhere']) {
        if (!(await openPopup(o))) {
          problems.push(`it did not open again for ${how}`);
          continue;
        }
        const end = how === 'Shift+Tab' ? 'first' : 'last';
        await js(win, `const p = document.querySelector(${JSON.stringify(o.pop)}); const t = [...p.querySelectorAll('input, button, select, textarea, [href], [tabindex]')].filter((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length); t[${end === 'first' ? '0' : 't.length - 1'}]?.focus()`);
        if (how === 'focus elsewhere') await js(win, `[...document.querySelectorAll('button')].find((b) => !document.querySelector(${JSON.stringify(o.pop)}).contains(b) && b !== window.__a11yFrom && b.tabIndex >= 0 && b.getClientRects().length)?.focus()`);
        else await key(win, 'Tab', how === 'Shift+Tab' ? ['shift'] : []);
        await sleep(200);
        const now = await js(win, `const a = document.activeElement; return { open: !!document.querySelector(${JSON.stringify(o.pop)}), opener: a === window.__a11yFrom, none: !a || a === document.body, where: a?.tagName + '.' + (a?.className || '') }`);
        if (now.open) problems.push(`${how} did not close it`);
        else if (how !== 'focus elsewhere' && now.opener) problems.push(`${how} went back to the opener`);
        else if (now.none) problems.push(`${how} lost focus`);
        await js(win, `__frameling.overlays?.state; document.activeElement?.blur?.()`);
      }
    }
    await js(win, `__frameling.prefs.set({ toolRail: 'two' })`);
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
