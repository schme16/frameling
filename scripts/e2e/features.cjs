// Features in the real app: turning Lip sync off removes its panel, commands, menu entries and help from the running
// app, a drawing that used it still opens and keeps its data, the question appears on open, and turning it on brings
// everything back without a restart. The same for Audio (timeline rows and the Sound button), Clip flow (panel kept in
// its place) and Interactives, plus the command palette's Turn on entry and Lip sync needing Audio.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/features.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.join(__dirname, '../..');
const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`);
  if (!ok) failures.push(name);
};

app.whenReady().then(async () => {
  installIpcStubs(ipcMain);
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
  const SWITCHABLE = ['audio', 'camera', 'flow', 'godot-export', 'interactives', 'lipsync', 'particles', 'rig', 'text', 'tiles'];
  check('the switchable features are listed, and on', SWITCHABLE.every((id) => list.some((f) => f.id === id && f.on)) && list.every((f) => SWITCHABLE.includes(f.id)), list);
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
  check('Preferences > Features lists Lip sync with a switch', /Lip sync/.test(page) && (await js(`!!document.querySelector('.features-page [data-testid="feature-switch-lipsync"]')`)), page);
  await js(`document.querySelector('.features-page [data-testid="feature-switch-lipsync"]').click()`);
  await sleep(400);
  check('the switch turns it off', !(await js(`${F}.has('lipsync.auto')`)));
  await js(`document.querySelector('.features-page [data-testid="feature-switch-lipsync"]').click()`);
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

  // ---- Audio: sound rows and the Sound button in the timeline, Lip sync needing it.
  const soundButton = `!!document.querySelector('.tl-header [data-testid="audio.import"]')`;
  check('Audio: the Sound button is in the timeline header', await js(soundButton));
  await js(`__frameling.template('bouncing-ball')`);
  await sleep(500);
  await js(`(() => {
    const n = 8000, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true);
    return __framelingAudio.addSound([...b], 'Beep', 'audio/wav');
  })()`);
  await sleep(800);
  const soundRows = `!!document.querySelector('.au-side [role=listitem], .au-side .au-row, .au-side > *')`;
  check('Audio: a sound shows its row in the timeline', await js(soundRows));
  check('Audio: turning it off is refused while Lip sync needs it', (await js(`${F}.set('audio', false)`)).ok === false && (await js(`${F}.has('audio.import')`)));
  await js(`${F}.set('lipsync', false)`);
  await js(`${F}.set('audio', false)`);
  await sleep(400);
  check('Audio off: no Import sound command, no Sound button, no sound rows', !(await js(`${F}.has('audio.import')`)) && !(await js(soundButton)) && !(await js(soundRows)));
  await js(`${F}.reopen()`);
  await sleep(600);
  check('Audio off: opening a drawing with sound asks to turn Audio on', /This drawing uses Audio, which is turned off\. Turn it on\?/.test(await js(`document.body.innerText`)));
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Turn on')?.click()`);
  await sleep(600);
  check('Audio on again: command, button and the sound row are back', (await js(`${F}.has('audio.import')`)) && (await js(soundButton)) && (await js(soundRows)));
  await js(`${F}.set('lipsync', true)`);
  await js(`${F}.set('audio', false)`);
  check('turning Lip sync on kept Audio on (it needs it)', (await js(`${F}.has('audio.import')`)) && (await js(`${F}.has('lipsync.auto')`)));

  // ---- Clip flow: its panel goes and comes back in the same place.
  await js(`__frameling.dock.movePanel('clip-flow', 'bottom', 0)`);
  await sleep(200);
  check('Clip flow: moved to the bottom zone', (await js(`__frameling.dock.zoneOf('clip-flow')`)) === 'bottom');
  await js(`${F}.set('flow', false)`);
  await sleep(300);
  check('Clip flow off: command and panel are gone', !(await js(`${F}.has('flow.open')`)) && !(await js(`${F}.hasPanel('clip-flow')`)));
  await js(`${F}.set('flow', true)`);
  await sleep(300);
  check('Clip flow on: the panel is back in the bottom zone', (await js(`__frameling.dock.zoneOf('clip-flow')`)) === 'bottom');
  await js(`__frameling.dock.movePanel('clip-flow', 'right')`);

  // ---- Interactives: commands and file hooks go; a .flplay offers to turn it on.
  check('Interactives: its commands are there', await js(`${F}.has('file.openPlayable')`));
  await js(`${F}.set('interactives', false)`);
  check('Interactives off: Open Interactives file is gone', !(await js(`${F}.has('file.openPlayable')`)));
  await js(`${F}.set('interactives', true)`);

  // ---- Tiles and Rig: a level and a puppet keep drawing and saving with the feature off; the tools and panels go.
  // How many pixels on the canvas are not the first one's colour, summed over its layers (a drawn picture, not a blank page).
  const painted = () => js(`(() => { let n = 0; for (const c of document.querySelectorAll('.cv-root canvas')) { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, t.width, t.height).data; for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) n++; } return n; })()`);
  await js(`__frameling.template('tileset')`);
  await sleep(700);
  const levelOn = await painted();
  check('Tiles: the level is drawn, the Tileset panel and tile tools are there', levelOn > 100 && (await js(`${F}.hasPanel('tileset')`)) && (await js(`${F}.has('tiles.tileMode')`)) && (await js(`__frameling.tools().includes('tile-brush')`)), levelOn);
  await js(`${F}.set('tiles', false)`);
  await sleep(500);
  check('Tiles off: panel, commands and tile tools are gone', !(await js(`${F}.hasPanel('tileset')`)) && !(await js(`${F}.has('tiles.tileMode')`)) && !(await js(`__frameling.tools().includes('tile-brush')`)));
  const levelOff = await painted();
  check('Tiles off: the level is still drawn the same', levelOff === levelOn, [levelOn, levelOff]);
  await js(`${F}.reopen()`);
  await sleep(600);
  check('Tiles off: opening the level asks to turn Tiles on', /Tiles, which is turned off\. Turn it on\?/.test(await js(`document.body.innerText`)));
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Not now')?.click()`);
  await sleep(300);
  const levelReopenedOff = await painted();
  await js(`${F}.set('tiles', true)`);
  await sleep(300);
  await js(`${F}.reopen()`);
  await sleep(800);
  const levelReopenedOn = await painted();
  // Opening again fits the view again, so compare the two openings with each other, not with the first look.
  check('Tiles off: the level opened and drawn the same as with Tiles on', levelReopenedOff > 100 && levelReopenedOff === levelReopenedOn, [levelReopenedOff, levelReopenedOn]);
  check('Tiles on: the panel and tools are back', (await js(`${F}.hasPanel('tileset')`)) && (await js(`__frameling.tools().includes('tile-brush')`)));

  await js(`__frameling.template('puppet')`);
  await sleep(700);
  const puppetOn = await painted();
  check('Rig: the puppet is drawn, the Rig panel and Pose tool are there', puppetOn > 100 && (await js(`${F}.hasPanel('rig')`)) && (await js(`__frameling.tools().includes('pose')`)), puppetOn);
  await js(`${F}.set('rig', false)`);
  await sleep(500);
  check('Rig off: panel, commands and bone tools are gone', !(await js(`${F}.hasPanel('rig')`)) && !(await js(`${F}.has('rig.addBones')`)) && !(await js(`__frameling.tools().includes('pose')`)) && !(await js(`__frameling.tools().includes('bone')`)));
  check('Rig off: Delete is still there', await js(`${F}.has('edit.delete')`));
  { const n = await painted(); check('Rig off: the puppet is still drawn the same', Math.abs(n - puppetOn) / puppetOn < 0.1, [puppetOn, n]); }
  await js(`${F}.set('rig', true)`);
  await sleep(300);
  check('Rig on: the panel and tools are back', (await js(`${F}.hasPanel('rig')`)) && (await js(`__frameling.tools().includes('pose')`)));

  // ---- The command palette offers to turn a feature on.
  await js(`${F}.set('flow', false)`);
  await js(`__frameling.overlays.state.set((o) => ({ ...o, palette: true }))`);
  await sleep(400);
  await js(`(() => { const i = document.querySelector('.ui-palette-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'clip flow'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const palette = await js(`document.querySelector('.ui-palette-list')?.innerText ?? ''`);
  check('the palette offers Turn on Clip flow', /Turn on Clip flow/.test(palette), palette);
  await js(`document.querySelector('.ui-palette-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(600);
  check('choosing it turns the feature on', await js(`${F}.has('flow.open')`));

  check('no console errors', errors.length === 0, errors.slice(0, 5));
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  app.exit(failures.length ? 1 : 0);
});
