// Features in the real app: turning Lip sync off removes its panel, commands, menu entries and help from the running
// app, a drawing that used it still opens and keeps its data, the question appears on open, and turning it on brings
// everything back without a restart.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/features.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, '../..');
const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
  if (!ok) failures.push(name);
};

app.whenReady().then(async () => {
  for (const ch of ['app:launchFile', 'autosave:read', 'autosave:readKept', 'library:read']) ipcMain.handle(ch, () => null);
  for (const ch of ['recent:list', 'autosave:listKept', 'library:list']) ipcMain.handle(ch, () => []);
  for (const ch of ['autosave:write', 'autosave:clear', 'autosave:keep', 'autosave:removeKept', 'recent:add', 'recent:remove', 'recent:clear', 'library:write', 'library:remove']) ipcMain.handle(ch, () => true);
  for (const ch of ['app:documentState', 'app:keepUnsavedDone', 'app:saveBeforeCloseDone']) ipcMain.on(ch, () => {});
  const win = new BrowserWindow({ show: true, width: 1400, height: 900, webPreferences: { preload: path.join(root, 'dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 3) errors.push(String(e.message ?? e));
  });
  await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
  await sleep(1200);
  const js = (code) => win.webContents.executeJavaScript(code);
  const F = '__framelingFeatures';

  const list = await js(`${F}.list()`);
  check('Lip sync is on the list and on', list.some((f) => f.id === 'lipsync' && f.on), list);
  check('only features that can really be switched are listed', list.every((f) => f.id === 'lipsync'), list);
  check('Lip sync command and panel are there', (await js(`${F}.has('lipsync.auto')`)) && (await js(`${F}.hasPanel('lipsync')`)) && (await js(`${F}.has('view.panel.lipsync')`)));

  // A drawing that used Lip sync.
  await js(`__frameling.template('lip-sync')`);
  await sleep(500);
  check('the template carries the Lip sync marker', JSON.stringify(await js(`${F}.roundTrip()`)) === JSON.stringify({ lipsync: { used: true } }));

  // Off.
  await js(`${F}.set('lipsync', false)`);
  await sleep(300);
  check('off: command, panel and its panel command are gone', !(await js(`${F}.has('lipsync.auto')`)) && !(await js(`${F}.hasPanel('lipsync')`)) && !(await js(`${F}.has('view.panel.lipsync')`)));
  // The drawing still has its data, and still opens.
  check('off: the drawing keeps the marker through save and open', JSON.stringify(await js(`${F}.roundTrip()`)) === JSON.stringify({ lipsync: { used: true } }));
  await js(`${F}.reopen()`);
  await sleep(600);
  const asked = await js(`document.body.innerText`);
  check('off: opening it asks to turn Lip sync on', /This drawing uses Lip sync, which is turned off\. Turn it on\?/.test(asked));
  // Say no: nothing changes.
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Not now')?.click()`);
  await sleep(300);
  check('no: it stays off', !(await js(`${F}.has('lipsync.auto')`)));
  check('no: the data is still there', JSON.stringify(await js(`${F}.roundTrip()`)) === JSON.stringify({ lipsync: { used: true } }));
  // Open again and say yes.
  await js(`${F}.reopen()`);
  await sleep(600);
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Turn on')?.click()`);
  await sleep(500);
  check('yes: Lip sync is back with its command and panel, no restart', (await js(`${F}.has('lipsync.auto')`)) && (await js(`${F}.hasPanel('lipsync')`)) && (await js(`${F}.has('view.panel.lipsync')`)));

  // Preferences > Features.
  await js(`__frameling.overlays.openPrefs('features')`);
  await sleep(600);
  const page = await js(`document.querySelector('.features-page')?.innerText ?? ''`);
  check('Preferences > Features lists Lip sync with a switch', /Lip sync/.test(page) && (await js(`!!document.querySelector('.features-page [role=switch][aria-label="Lip sync on or off"]')`)), page);
  await js(`document.querySelector('.features-page [role=switch]').click()`);
  await sleep(400);
  check('the switch turns it off', !(await js(`${F}.has('lipsync.auto')`)));
  await js(`document.querySelector('.features-page [role=switch]').click()`);
  await sleep(400);
  check('and on again', await js(`${F}.has('lipsync.auto')`));
  await js(`__frameling.overlays.openPrefs('features')`);

  // Help for an off feature is hidden, with a Turn on link.
  await js(`${F}.set('lipsync', false)`);
  await js(`__frameling.overlays.openHelp(undefined, undefined, 'lip sync')`);
  await sleep(600);
  const help = await js(`document.querySelector('.ui-help-results')?.innerText ?? ''`);
  check('help search offers Turn on Lip sync for a hidden topic', /Turn on Lip sync/.test(help), help);
  await js(`[...document.querySelectorAll('.ui-help-results button')].find((b) => /Turn on Lip sync/.test(b.textContent))?.click()`);
  await sleep(400);
  check('the link turns it on', await js(`${F}.has('lipsync.auto')`));

  check('no console errors', errors.length === 0, errors.slice(0, 5));
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
