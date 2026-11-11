// Screenshots of every place Quill talks, for the dialogue review page (brand/dialogue/index.html).
//
//   npm run dialogue:shots          builds, then shoots everything and rebuilds the page
//   npx electron scripts/dialogue/shots.cjs [moment ...]   just these groups, on the current build
//
// Each group starts from a fresh page (?debug, empty storage) and walks the app to each moment, saving a cropped
// shot per line id to brand/dialogue/shots/<id>.png. Lines that share a moment get the same picture. Notes (where the
// shot is only the nearest moment) go in brand/dialogue/shots/manifest.json for the page.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const OUT = path.join(ROOT, 'brand/dialogue/shots');
const W = 1400;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Little helpers run in the page.
const run = (id) => ({ js: `__frameling.run(${JSON.stringify(id)})` });
const typeIn = (sel, text) => ({
  js: `(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
});
const next = { click: '.ob-next' };
const OB = '.ui-modal.ob';
const TOAST = '.ui-toasts';

// The groups. A shot is { shot: [ids], crop: selector, pad?, note? }.
const GROUPS = {
  onboarding: [
    run('help.meetQuill'),
    { wait: 3200 },
    { shot: ['onboarding.hello'], crop: OB },
    next,
    { wait: 1200 },
    { shot: ['onboarding.make.none', 'onboarding.make.lead'], crop: OB },
    ...['cartoons', 'sprites', 'tiles', 'motion', 'interactives', 'play'].flatMap((k, n) => [{ click: `.ob-card:nth-child(${n + 1})` }, { wait: 900 }, { shot: [`onboarding.make.${k}`], crop: OB }]),
    { click: '.ob-card:nth-child(6)' },
    { wait: 900 },
    { shot: ['onboarding.make.lots'], crop: OB, note: 'Five still picked after un-picking Just playing.' },
    { click: '.ob-card:nth-child(5)' },
    { click: '.ob-card:nth-child(4)' },
    { wait: 900 },
    { shot: ['onboarding.make.some'], crop: OB, note: 'Three still picked after un-picking two.' },
    next,
    { wait: 1500 },
    { shot: ['onboarding.themes.hint', 'onboarding.themes.favourite'], crop: OB },
    { click: '.ob-themes .ob-theme.is-fav' },
    { wait: 1500 },
    { shot: ['onboarding.themes.loved'], crop: OB },
    next,
    { wait: 1300 },
    { shot: ['onboarding.prefs.on', 'onboarding.prefs.showQuill'], crop: OB },
    { click: '.ob-setting:last-child .ui-switch' },
    { wait: 1600 },
    { shot: ['goodbye.long'], crop: OB },
    { wait: 6500 },
    { js: `document.querySelector('.ob-next').click()` },
    { wait: 100 },
    { js: `document.querySelector('.ob-foot-end .ui-btn').click()` },
    { wait: 1300 },
    { shot: ['onboarding.prefs.off'], crop: OB, note: 'Quill is hidden here, so his words stand on their own.' },
    { click: '.ob-setting:last-child .ui-switch' },
    { wait: 1400 },
    { shot: ['welcomeBack'], crop: OB, note: 'The first-run hello version. The Preferences one is a toast with the same words.' },
    next,
    { wait: 1400 },
    { shot: ['onboarding.name', 'sillyNames.pattern', 'sillyNames.adjectives', 'sillyNames.nouns', 'sillyNames.fallback'], crop: OB, note: 'Silly names show in the name box (Roll picks a new one).' },
    next,
    { wait: 1800 },
    { shot: ['onboarding.done', 'onboarding.done.lead', 'onboarding.done.quest', 'onboarding.done.example', 'onboarding.done.blank'], crop: OB },
    { click: '.ob-foot-end .ui-btn' },
    { wait: 600 },
    typeIn('#ob-name-input', ''),
    next,
    { wait: 1800 },
    { shot: ['onboarding.done.noName', 'onboarding.done.leadNoName'], crop: OB, note: 'With the name box left empty.' },
    { click: '.ob-foot-end .ui-btn' },
    { wait: 600 },
    { click: '.ob-dice' },
    next,
    { wait: 1200 },
    { click: '.ob-go:last-child' },
    { wait: 900 },
    { shot: ['onboarding.ready'], crop: TOAST, pad: 60 },
  ],
  doze: [
    run('help.meetQuill'),
    { wait: 1000 },
    next,
    { wait: 21500 },
    { shot: ['onboarding.doze.asleep'], crop: OB, note: 'Left alone for 20 seconds.' },
    { click: '.ob-title' },
    { wait: 1400 },
    { shot: ['onboarding.doze.woke'], crop: OB },
    { click: '.ob-skip' },
    { wait: 900 },
    { shot: ['onboarding.skipped'], crop: TOAST, pad: 60 },
  ],
  toasts: [
    { js: `__frameling.quill.setShown(false)` },
    { wait: 1400 },
    { shot: ['goodbye.short'], crop: TOAST, pad: 60 },
    { wait: 7000 },
    { js: `__frameling.quill.setShown(true)` },
    { wait: 900 },
    { js: `document.querySelectorAll('.ui-toast').forEach((t, i, all) => i < all.length - 1 && t.remove())` },
    { shot: [], crop: TOAST, pad: 60, file: 'welcomeBack-toast', also: 'welcomeBack' },
  ],
  quests: [
    run('quests.open'),
    { wait: 1400 },
    { shot: ['quests.panel.intro'], crop: '.qp-head, .qp-quill, .qp-card:first-child', pad: 12 },
    { js: `__frameling.quests.start('first-animation')` },
    { wait: 1500 },
    { js: `__frameling.quests.praise()` },
    { wait: 300 },
    { shot: ['quests.praise'], crop: '.qb', pad: 30, note: 'The little cheer over the quest bar. It takes turns through the list.' },
    { js: `__frameling.quests.celebrate('first-animation')` },
    { wait: 2200 },
    { shot: ['quests.badge'], crop: '.qc', pad: 30 },
    { js: `__frameling.quests.celebrate('first-animation', { noBadge: true, noFinish: true })` },
    { wait: 2200 },
    { shot: ['quests.finished', 'quests.finishedQuest'], crop: '.qc', pad: 30, note: 'Every quest has a badge and its own finish line today, so this one is staged.' },
    { js: `document.querySelector('.qc .qb-x')?.click(); __frameling.run('quests.stop')` },
    { js: `__frameling.quests.progress.set((x) => ({ ...x, active: null, paused: null, completed: __frameling.quests.all() }))` },
    { wait: 1400 },
    { shot: ['quests.panel.allDone'], crop: '.qp-head, .qp-quill, .qp-card:first-child', pad: 12 },
  ],
  welcome: [
    run('help.welcome'),
    { wait: 3000 },
    { shot: ['welcome.hello', 'welcome.lead'], crop: '.ui-welcome-head', pad: 24 },
    { click: '.ui-preset' },
    { wait: 900 },
    { shot: ['welcome.ready'], crop: TOAST, pad: 60 },
    run('file.new'),
    { wait: 3000 },
    { shot: ['welcome.new'], crop: '.ui-welcome-head', pad: 24 },
  ],
  about: [run('help.about'), { wait: 3000 }, { shot: ['about.quill'], crop: '.ui-about', pad: 0 }],
  empty: [
    { js: `__frameling.overlays.openHelp(undefined, undefined, 'zzqxwv')` },
    { wait: 900 },
    typeIn('.ui-help-search input', 'zzqxwv'),
    { wait: 3000 },
    { shot: ['empty.help'], crop: '.ui-help-modal' },
    { js: `document.querySelector('.ui-help-modal').closest('.ui-backdrop')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))` },
    { key: 'Escape' },
    { js: `__frameling.overlays.openPrefs('keyboard')` },
    { wait: 900 },
    typeIn('.ui-prefs input[type=search]', 'zzqxwv'),
    { wait: 3000 },
    { shot: ['empty.shortcuts'], crop: '.ui-prefs' },
    { key: 'Escape' },
    { wait: 300 },
    run('file.openRecent'),
    { wait: 3000 },
    { shot: ['empty.recent'], crop: '.io-modal' },
    { key: 'Escape' },
    { wait: 300 },
    run('file.recover'),
    { wait: 3000 },
    { shot: ['empty.recover'], crop: '.io-modal' },
  ],
};

async function rectOf(win, sel, pad = 16) {
  const r = await win.webContents.executeJavaScript(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return { x: Math.min(...rs.map((r) => r.left)), y: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  })()`);
  if (!r) return null;
  const x = Math.max(0, Math.floor(r.x - pad));
  const y = Math.max(0, Math.floor(r.y - pad));
  return { x, y, width: Math.min(W, Math.ceil(r.r + pad)) - x, height: Math.min(H, Math.ceil(r.b + pad)) - y };
}

async function clickAt(win, sel) {
  const p = await win.webContents.executeJavaScript(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  })()`);
  if (!p) throw new Error(`nothing to click at ${sel}`);
  const [x, y] = p;
  const send = (e) => win.webContents.sendInputEvent(e);
  send({ type: 'mouseMove', x, y });
  send({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await sleep(30);
  send({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  await sleep(150);
}

// Each group closes its window before the next opens; that mustn't end the app.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // The real main process answers these; for shots there is no file and no history.
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept']) ipcMain.handle(ch, () => null);
  ipcMain.handle('files:read', () => ({ error: 'No such file.' }));
  for (const ch of ['recent:list', 'autosave:listKept']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'app:documentState']) ipcMain.handle(ch, () => true);
  for (const ch of ['app:documentState', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  fs.mkdirSync(OUT, { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const only = process.argv.slice(2).filter((a) => GROUPS[a]);
  const failures = [];

  for (const [name, steps] of Object.entries(GROUPS)) {
    if (only.length && !only.includes(name)) continue;
    const win = new BrowserWindow({
      width: W,
      height: H,
      useContentSize: true,
      // Off-screen but really shown, as in scripts/shoot.cjs, so animations and React keep up.
      show: true,
      x: process.env.SHOT_SHOW === '1' ? undefined : -4000,
      y: process.env.SHOT_SHOW === '1' ? undefined : 0,
      focusable: process.env.SHOT_SHOW === '1',
      skipTaskbar: process.env.SHOT_SHOW !== '1',
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: path.join(ROOT, 'dist/preload/preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        // A fresh, in-memory store per group, so prefs and quest progress start clean.
        partition: `dialogue-${name}-${Date.now()}`,
        additionalArguments: ['--frameling-version=shot'],
        backgroundThrottling: false,
      },
    });
    await win.loadFile(path.join(ROOT, 'dist/renderer/index.html'), { query: { debug: '1' } });
    await sleep(1200);
    // The welcome sheet opens on start (the hello doesn't, with ?debug). Out of the way for a clean picture.
    await win.webContents.executeJavaScript(`__frameling.overlays.closeSheet()`);
    await sleep(300);
    for (const s of steps) {
      try {
        if (s.js) await win.webContents.executeJavaScript(s.js);
        else if (s.wait) await sleep(s.wait);
        else if (s.click) await clickAt(win, s.click);
        else if (s.key) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: s.key });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: s.key });
          await sleep(120);
        } else if (s.shot) {
          const rect = await rectOf(win, s.crop, s.pad ?? 16);
          if (!rect) throw new Error(`nothing at ${s.crop} for ${s.shot.join(', ') || s.file}`);
          const png = (await win.webContents.capturePage(rect)).toPNG();
          for (const id of s.shot) {
            fs.writeFileSync(path.join(OUT, `${id}.png`), png);
            manifest[id] = { ...manifest[id], file: `shots/${id}.png`, ...(s.note ? { note: s.note } : {}) };
          }
          if (s.file) fs.writeFileSync(path.join(OUT, `${s.file}.png`), png);
          // A second picture for a line that shows in two places.
          if (s.also) manifest[s.also] = { ...manifest[s.also], also: `shots/${s.file}.png` };
          console.log(`  ${name}: ${s.shot.join(', ') || s.file}`);
        }
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
        console.error(`  ${name}: ${e.message}`);
      }
    }
    win.destroy();
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  // Electron's own binary runs the page builder as plain node.
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'page.mjs')], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  if (failures.length) console.error(`\n${failures.length} shot step(s) failed.`);
  app.exit(failures.length ? 1 : 0);
});
