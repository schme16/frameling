// The flows of scripts/e2e/web.cjs.
const { flow, check, sleep, makeWindow } = require('./web.cjs');

flow('launch', async () => {
  // Without ?debug, so the first-run hello (Quill's onboarding) shows as it does for a visitor.
  const w = makeWindow('persist:launch');
  await w.load('picker', '', false);
  check('first launch: Quill says hello', await w.waitFor(`/Hello from Quill/.test(document.body.innerText)`), (await w.body()).slice(0, 100));
  check('the page builds its own browser bridge', (await w.js(`window.frameling.kind`)) === 'web');
  check('no test hooks without ?debug', (await w.js(`typeof window.__frameling`)) === 'undefined');
  const seen = [];
  for (let i = 0; i < 8; i++) {
    seen.push(await w.js(`document.querySelector('.ob-title')?.textContent ?? ''`));
    if (!(await w.clickText("Let's go!")) && !(await w.clickText('Next'))) break;
    await sleep(350);
  }
  check('Quill walks through hello, make, themes, settings, name, done', seen.join('|') === 'Hello from Quill|What would you like to make?|Pick your colours|A few handy settings|Name your first animation|All set!', seen);
  await w.shot('launch-done');
  check('the last page offers to start', await w.js(`!!document.querySelector('.ob-go')`));
  await w.js(`document.querySelector('.ob-go:not(.is-main)')?.click() ?? document.querySelector('.ob-go').click()`);
  await sleep(800);
  check('onboarding closes after the choice', !(await w.js(`!!document.querySelector('.ob')`)));
  // A second visit: the hello does not come back (the choice lives in the browser's storage).
  await w.load('picker', '', false);
  await sleep(800);
  check('second visit: no hello', !(await w.js(`!!document.querySelector('.ob')`)));
});

flow('pixel', async () => {
  const w = makeWindow('persist:pixel');
  await w.load();
  check('welcome sheet is there', await w.waitFor(`/What are we cooking up today/.test(document.body.innerText)`));
  await w.js(`[...document.querySelectorAll('[role=dialog] button')].find((b) => /^Pixel art/.test(b.textContent.trim()))?.click()`);
  check("Quill's pixel chooser opens", await w.waitFor(`/Pixel time! What are we making/.test(document.body.innerText)`));
  await w.js(`document.querySelector('.px-way-card[data-way="animation"]').click()`);
  await sleep(200);
  check('picking a card makes Quill say something', await w.js(`/Aseprite|animation/i.test(document.querySelector('.ui-modal, [role=dialog]').innerText)`));
  await w.clickText('16 x 16');
  await w.clickText('Start');
  await sleep(1200);
  const st = await w.js(`(() => { const d = __frameling.store().get().doc; return { w: d.width, h: d.height, way: __framelingPixel.way(), layers: d.layers.length, tool: __frameling.store().get().ui.tool, ws: __frameling.dock.activeWorkspace?.() }; })()`);
  check('a 16 x 16 animation was made', st.w === st.h && st.w % 16 === 0 && st.way === 'animation' && /16 x 16 pixels/.test(await w.body()), st);
  await w.shot('pixel-new');
  // Draw with real mouse events, as a person does, on the 16 x 16 grid.
  const px = () => w.js(`(() => { let n = 0; for (const d of Object.values(__frameling.store().get().doc.drawings)) if (d.kind === 'pixel') for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i]) n++; return n; })()`);
  check('the new sprite starts empty', (await px()) === 0);
  await w.input.drag([[580, 200], [700, 320], [800, 450]], 8);
  const n1 = await px();
  check('dragging with the Pencil colours pixels', n1 > 5, n1);
  await w.input.key('z', ['control']);
  await sleep(300);
  check('Ctrl+Z takes the stroke back', (await px()) === 0, await px());
  await w.input.key('z', ['control', 'shift']);
  await sleep(300);
  check('Ctrl+Shift+Z puts it back', (await px()) === n1, await px());
  await w.shot('pixel-drawn');
});

flow('workspaces', async () => {
  const w = makeWindow('persist:workspaces');
  await w.load();
  await w.js(`__frameling.overlays.closeSheet()`);
  const L = () => w.js(`(() => { const d = __frameling.dock.dock.get(); const z = d.layout.zones.right; return { floats: d.layout.floats.map((f) => ({ id: f.id, tabs: f.tabs, x: f.x, y: f.y, w: f.w, h: f.h })), groups: 1 + (z.more?.length ?? 0), shares: z.shares, ws: d.workspaceId, user: d.user.map((u) => u.name) }; })()`);
  const D = (code) => w.js(`__frameling.dock.${code}`);
  check('starts with no floating windows and one group', (await L()).floats.length === 0 && (await L()).groups === 1, await L());
  await D(`floatPanel('help', { x: 300, y: 200 })`);
  await sleep(300);
  await D(`stackPanelsIn('colors', 'preview', 'right', 0.5)`);
  await sleep(300);
  const arranged = await L();
  check('a panel floats in a window', arranged.floats.length === 1 && arranged.floats[0].tabs.includes('help'), arranged);
  check('two panels stack in the right zone', arranged.groups === 2, arranged);
  check('the floating window and both groups are drawn', await w.js(`document.querySelectorAll('.ui-float').length >= 1 && document.querySelectorAll('.ui-dock-right .ui-group, .ui-group').length >= 1`), await w.js(`[...new Set([...document.querySelectorAll('[class*=float]')].map((e) => e.className))].slice(0, 5)`));
  await w.shot('workspaces-arranged');
  // Save it, then a file out through the browser's download and back in through the upload picker.
  const saved = await D(`saveWorkspace('Web check')`).then(() => L());
  check('the arrangement is saved as a workspace', saved.user.includes('Web check'), saved);
  await w.js(`__frameling.overlays.openPrefs('workspaces')`);
  check('Preferences > Workspaces shows it', await w.waitFor(`/Web check/.test(document.body.innerText)`));
  await w.clickText('Save this layout as a file');
  await sleep(600);
  const dl = await w.files.downloads();
  check('Save as a file downloads one .json workspace file', dl.length === 1 && /web-check.*\.json$/i.test(dl[0].name), dl.map((d) => d.name));
  const text = dl[0]?.bytes.toString('utf8') ?? '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  check('the file is a frameling workspace with the floating window', parsed?.format === 'frameling-workspace' && JSON.stringify(parsed).includes('"help"'), text.slice(0, 120));
  // Delete it, then add the file back.
  await D(`deleteWorkspace(${JSON.stringify(await w.js(`__frameling.dock.dock.get().user[0].id`))})`);
  check('deleted', (await L()).user.length === 0);
  await w.files.upload(dl[0].name, dl[0].bytes, 'application/json');
  await w.clickText('Add a workspace file...');
  await sleep(800);
  const back = await L();
  check('Add a workspace file brings it back through the upload picker', back.user.length === 1, back);
  await D(`applyWorkspace(__frameling.dock.dock.get().user[0].id)`);
  await sleep(300);
  const applied = await L();
  check('using it restores the floating window and the two groups', applied.floats.length === 1 && applied.groups === 2, applied);
  // The layout survives a reload (the browser's storage).
  await w.load();
  await w.js(`__frameling.overlays.closeSheet()`);
  const again = await L();
  check('a reload keeps the floating window, groups and the saved workspace', again.floats.length === 1 && again.groups === 2 && again.user.includes('Web check'), again);
  // Reset and the built-in workspaces still switch.
  await D(`applyWorkspace('pixel')`);
  await sleep(300);
  check('switching to Pixel clears the custom layout', (await L()).ws === 'pixel');
  await w.shot('workspaces-pixel');
});

// Save, Save as, Open, Open recent, autosave and recovery, in both kinds of browser.
for (const mode of ['picker', 'plain']) {
  flow(`files-${mode}`, async () => {
    const w = makeWindow(`persist:files-${mode}`);
    await w.load(mode);
    await w.js(`__frameling.overlays.closeSheet()`);
    const S = (code) => w.js(code);
    await S(`__frameling.template('bouncing-ball')`);
    await sleep(500);
    const ui = () => S(`(() => { const u = __frameling.store().get().ui; return { dirty: u.dirty, path: u.filePath }; })()`);
    const name = await S(`__frameling.store().get().doc.name`);
    await S(`__frameling.store().update('Rename', (d) => { d.name = 'Web Test'; })`);
    check('an edit marks the drawing as changed', (await ui()).dirty === true, await ui());
    // Save (no file yet, so it asks where / downloads).
    const ok1 = await S(`__framelingIo.saveDocument()`);
    await sleep(400);
    check('Save works', ok1 === true);
    let saved;
    if (mode === 'picker') {
      const picks = await w.files.picks();
      check('Save asks where once (Save picker)', picks.length === 1 && picks[0].kind === 'save' && /\.frameling$|Web Test/.test(picks[0].name || ''), picks);
      const list = await w.files.list(['out']);
      const fname = list.find((n) => /frameling$/.test(n));
      check('the file is in the picked place with the .frameling name', !!fname, list);
      saved = fname ? await w.files.out(['out'], fname) : null;
    } else {
      const dl = await w.files.downloads();
      check('Save downloads a .frameling file', dl.length === 1 && /\.frameling$/.test(dl[0].name), dl.map((d) => d.name));
      saved = dl[0]?.bytes;
    }
    check('the bytes are a zip (a .frameling file)', !!saved && saved[0] === 0x50 && saved[1] === 0x4b, saved?.subarray(0, 4));
    check('the drawing is marked saved and has a path', (await ui()).dirty === false && !!(await ui()).path, await ui());
    // Edit and Save again: in place with a picker, downloads again without.
    await S(`__frameling.store().update('Rename', (d) => { d.name = 'Web Test 2'; })`);
    await S(`__framelingIo.saveDocument()`);
    await sleep(400);
    if (mode === 'picker') {
      check('a second Save writes in place without asking', (await w.files.picks()).length === 0);
      const again = await w.files.out(['out'], (await w.files.list(['out'])).find((n) => /frameling$/.test(n)));
      check('the file changed', again.length !== saved.length || !again.equals(saved));
    } else {
      check('a second Save downloads again', (await w.files.downloads()).length === 1);
    }
    // Open it again: new drawing first, then open the saved bytes.
    await S(`__frameling.store().load(__frameling.store().get().doc, null)`).catch(() => {});
    await S(`__frameling.template('blink')`);
    await sleep(300);
    if (mode === 'picker') await w.files.stage('Web Test.frameling', saved);
    else await w.files.upload('Web Test.frameling', saved);
    await S(`__frameling.store().markSaved?.(null)`).catch(() => {});
    await S(`__frameling.run('file.open')`);
    await sleep(1200);
    const nm = await S(`__frameling.store().get().doc.name`);
    check('Open loads the saved drawing', /Web Test/.test(nm), nm);
    const conf = await S(`__shim.confirms`);
    console.log('   confirms:', JSON.stringify(conf));
    // Cancelling the picker is not an error.
    if (mode === 'picker') await S(`__shim.cancelNext = true`);
    await S(`__frameling.run('file.open')`);
    await sleep(500);
    check('cancelling Open changes nothing', /Web Test/.test(await S(`__frameling.store().get().doc.name`)));
    // Recent.
    const recent = await S(`window.frameling.recent.list()`);
    check('the opened file is in Open recent', recent.some((r) => /Web Test/.test(r.name)), recent);
    await w.shot(`files-${mode}`);
  });
}

flow('recovery', async () => {
  const w = makeWindow('persist:recovery');
  await w.load();
  await w.js(`__frameling.overlays.closeSheet()`);
  await w.js(`__frameling.template('bouncing-ball')`);
  await w.js(`__frameling.store().update('Rename', (d) => { d.name = 'Lost work'; })`);
  await w.js(`__framelingIo.autosaveNow()`);
  await sleep(300);
  const cur = await w.js(`window.frameling.autosave.read().then((r) => r && r.meta)`);
  check('autosave keeps a copy in the browser (IndexedDB)', cur && cur.name === 'Lost work', cur);
  // Close the tab with unsaved work (pagehide puts it aside) and come back.
  await w.load();
  await w.js(`__frameling.overlays.closeSheet()`);
  await sleep(500);
  const kept = await w.js(`window.frameling.autosave.listKept()`);
  check('the next visit finds the unsaved work set aside', kept.some((k) => k.name === 'Lost work'), kept);
  await w.js(`__frameling.run('file.recover')`);
  check('File > Recover unsaved work lists it', await w.waitFor(`/Lost work/.test(document.body.innerText)`), (await w.body()).slice(0, 200));
  await w.shot('recovery');
  await w.clickText('Open');
  await sleep(300);
});

const fs = require('node:fs');
const path = require('node:path');
const ASSETS = path.join(__dirname, '../docs/help/assets');
const asset = (n) => fs.readFileSync(path.join(ASSETS, n));

// Pictures, sprite sheets, GIFs and Aseprite files through the web's file pickers.
for (const mode of ['picker', 'plain']) {
  flow(`import-${mode}`, async () => {
    const w = makeWindow(`persist:import-${mode}`);
    await w.load(mode);
    await w.js(`__frameling.overlays.closeSheet()`);
    const give = async (name, type) => (mode === 'picker' ? w.files.stage(name, asset(name)) : w.files.upload(name, asset(name), type));
    const state = () => w.js(`(() => { const d = __frameling.store().get().doc; return { w: d.width, h: d.height, len: d.length, layers: d.layers.length, boards: (d.artboards || []).length, drawings: Object.keys(d.drawings).length, name: d.name }; })()`);
    const dirty = () => w.js(`__frameling.store().setUi({ dirty: false })`);
    // 1. A sprite sheet picture, cut by finding the gaps, as an animation.
    await give('slime-sheet.png', 'image/png');
    await w.run('file.openPicture');
    check('the Bring in a picture dialog opens', await w.waitFor(`/Bring in a picture/.test(document.body.innerText)`), (await w.body()).slice(0, 120));
    await w.clickText('Find the gaps');
    await sleep(400);
    await w.clickText('An animation', 'button');
    await sleep(200);
    await w.shot(`import-${mode}-sheet`);
    await w.clickText('Bring it in');
    await sleep(1500);
    await w.answerChoice();
    const s1 = await state();
    check('a sheet of slimes becomes an animation with several frames', s1.len >= 3, s1);
    // 2. The same sheet with the JSON that comes with it ("From a JSON").
    await dirty();
    await give('slime-sheet.png', 'image/png');
    await w.run('file.openPicture');
    await w.waitFor(`/Bring in a picture/.test(document.body.innerText)`);
    await give('slime-sheet.json', 'application/json');
    await w.clickText('From a JSON');
    await sleep(800);
    await w.clickText('An animation', 'button');
    await w.clickText('Bring it in');
    await sleep(1500);
    await w.answerChoice();
    const s2 = await state();
    check("the sheet's own JSON gives its frames (28 x 24 each)", s2.len >= 3 && s2.w >= 28, s2);
    // 3. An Aseprite file opens as a new drawing.
    await dirty();
    await w.js(`__frameling.store().update('Rename', (d) => { d.name = 'before'; })`);
    await dirty();
    await give('slime-bounce.aseprite', 'application/octet-stream');
    await w.run('file.openAseprite');
    await sleep(2000);
    await w.answerChoice();
    const s3 = await state();
    check('an Aseprite file opens as its own drawing with its frames', /slime-bounce/.test(s3.name) && s3.len >= 3 && s3.layers >= 1, s3);
    // 4. A GIF opens as frames.
    await dirty();
    await give('slime-bounce.gif', 'image/gif');
    await w.run('file.openPicture');
    check('a GIF shows the same dialog', await w.waitFor(`/Bring in a picture/.test(document.body.innerText)`), (await w.body()).slice(0, 100));
    await sleep(500);
    await w.shot(`import-${mode}-gif`);
    await w.clickText('Bring it in');
    await sleep(1500);
    await w.answerChoice();
    const s4 = await state();
    check('the GIF becomes an animation', /slime-bounce/.test(s4.name) && s4.len >= 3, s4);
    // 5. Cancelling the upload picker does nothing and says nothing.
    if (mode === 'picker') await w.js(`__shim.cancelNext = true`);
    await w.run('file.openPicture');
    await sleep(800);
    check('a cancelled picture picker opens no dialog', (await w.js(`/Bring in a picture/.test(document.body.innerText)`)) === false);
  });
}
