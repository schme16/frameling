// The flows of scripts/e2e/web.cjs.
const fs = require('node:fs');
const path = require('node:path');
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

// Exports through the same function the Export dialog's button calls, into the picker's folders or as downloads.
const MAGIC = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (b) => /^GIF8/.test(b.subarray(0, 4).toString('latin1')),
  mp4: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp',
  webm: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  svg: (b) => /<svg[\s>]/.test(b.toString('utf8', 0, 600)),
  psd: (b) => b.subarray(0, 4).toString('latin1') === '8BPS',
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  json: (b) => { try { return !!JSON.parse(b.toString('utf8')); } catch { return false; } },
};
const CASES = [
  { id: 'png', tpl: 'bouncing-ball', set: { format: 'png', range: 'frame' }, one: 'png' },
  { id: 'svg', tpl: 'bouncing-ball', set: { format: 'svg', range: 'frame' }, one: 'svg' },
  { id: 'apng', tpl: 'bouncing-ball', set: { format: 'apng', range: 'all' }, one: 'png' },
  { id: 'gif', tpl: 'bouncing-ball', set: { format: 'gif', range: 'all' }, one: 'gif' },
  { id: 'mp4', tpl: 'bouncing-ball', set: { format: 'mp4', range: 'all' }, one: 'mp4' },
  { id: 'webm', tpl: 'bouncing-ball', set: { format: 'webm', range: 'all' }, one: 'webm' },
  { id: 'pngseq', tpl: 'bouncing-ball', set: { format: 'pngseq', range: 'all' }, one: 'zip' },
  { id: 'lottie', tpl: 'bouncing-ball', set: { format: 'lottie', range: 'all' }, one: 'json' },
  { id: 'dotlottie', tpl: 'bouncing-ball', set: { format: 'lottie', range: 'all', lottieFile: 'dotlottie' }, one: 'zip', ext: /\.lottie$/ },
  { id: 'svganim', tpl: 'bouncing-ball', set: { format: 'svganim', range: 'all' }, one: 'svg' },
  { id: 'psd', tpl: 'bouncing-ball', set: { format: 'psd', range: 'frame' }, one: 'psd' },
  { id: 'pdf', tpl: 'bouncing-ball', set: { format: 'pdf', range: 'all' }, one: 'pdf' },
  { id: 'ai', tpl: 'bouncing-ball', set: { format: 'ai', range: 'frame' }, one: 'pdf', ext: /\.ai$/ },
  { id: 'interactives', tpl: 'bouncing-ball', set: { format: 'interactives', range: 'all' }, one: 'zip', ext: /\.flplay$/ },
];
for (const mode of ['picker', 'plain']) {
  flow(`export-${mode}`, async () => {
    const w = makeWindow(`persist:export-${mode}`);
    await w.load(mode);
    await w.js(`__frameling.overlays.closeSheet()`);
    let loaded = '';
    for (const c of CASES) {
      if (loaded !== c.tpl) {
        await w.js(`__framelingExport.load(${JSON.stringify(c.tpl)})`);
        loaded = c.tpl;
        await sleep(300);
      }
      const defaults = await w.js(`__framelingExport.defaults()`);
      const settings = { ...defaults, ...c.set };
      const r = await w.js(`__framelingExport.run(${JSON.stringify(settings)})`);
      const got = await w.files.collect();
      if (r.error || r.outcome !== 'done') {
        check(`${c.id}: exports`, false, r.error ?? r.outcome);
        continue;
      }
      const f = got[0];
      const okName = f && (c.ext ? c.ext.test(f.name) : true);
      check(`${c.id}: one file, right kind (${f?.name}, ${f?.bytes.length} bytes)`, got.length === 1 && !!okName && MAGIC[c.one](f.bytes) && f.bytes.length > 100, got.map((g) => g.name));
    }
  });
}

// A sprite sheet with each engine's data: a folder of files (picker) or one zip (plain).
for (const mode of ['picker', 'plain']) {
  flow(`sheet-${mode}`, async () => {
    const w = makeWindow(`persist:sheet-${mode}`);
    await w.load(mode);
    await w.js(`__frameling.overlays.closeSheet()`);
    await w.js(`__framelingExport.load('hero-sprites')`);
    await sleep(300);
    const defaults = await w.js(`__framelingExport.defaults()`);
    const engines = await w.js(`__framelingExport.defaults().sheet.engine`);
    const want = { godot: /\.tscn$|\.tres$|\.png$/, unity: /\.json$|\.cs$|\.png$/, phaser: /\.json$/, pixi: /\.json$/, css: /\.css$/, json: /\.json$/ };
    for (const engine of Object.keys(want)) {
      const sheet = { ...defaults.sheet, engine, json: engine !== 'css' ? defaults.sheet.json : false, godot: engine === 'godot', godotScene: engine === 'godot' };
      const r = await w.js(`__framelingExport.run(${JSON.stringify({ ...defaults, format: 'sheet', range: 'all', clipId: null, sheet })})`);
      const got = await w.files.collect();
      if (r.error || r.outcome !== 'done') {
        check(`sheet for ${engine}: exports`, false, r.error ?? r.outcome);
        continue;
      }
      if (mode === 'plain') {
        const zip = got.find((g) => /\.zip$/.test(g.name));
        const names = zip ? Object.keys(require('fflate').unzipSync(new Uint8Array(zip.bytes))) : [];
        check(`sheet for ${engine}: one zip with a picture and the engine's data (${names.length} files)`, got.length === 1 && names.some((n) => /\.png$/.test(n)) && names.some((n) => want[engine].test(n)) && names.length >= 2, [got.map((g) => g.name), names]);
      } else {
        const names = got.map((g) => g.name);
        check(`sheet for ${engine}: a folder with a picture and the engine's data (${names.length} files)`, names.some((n) => /\.png$/.test(n)) && names.some((n) => want[engine].test(n)) && names.length >= 2, names);
      }
    }
  });
}

flow('export-dialog', async () => {
  const w = makeWindow('persist:export-dialog');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  await w.js(`__framelingExport.load('bouncing-ball')`);
  await w.run('file.export');
  check('the Export dialog opens', await w.waitFor(`/Export/.test(document.querySelector('[role=dialog]')?.innerText ?? '')`));
  await sleep(1200);
  await w.shot('export-dialog');
  const text = await w.js(`document.querySelector('[role=dialog]').innerText`);
  await w.js(`[...document.querySelectorAll('[role=dialog] button, [role=dialog] summary')].find((b) => /More formats/.test(b.textContent))?.click()`);
  await sleep(500);
  await w.shot('export-dialog-more');
  const more = await w.js(`document.querySelector('[role=dialog]').innerText`);
  const prores = await w.js(`(() => { const b = [...document.querySelectorAll('[role=dialog] button, [role=dialog] [role=radio]')].find((x) => /ProRes/.test(x.textContent)); return b ? { text: b.textContent.slice(0, 200), disabled: b.disabled || b.getAttribute('aria-disabled') } : null; })()`);
  check('ProRes is shown disabled with the reason (needs the desktop app)', prores?.disabled && /desktop app/.test(prores.text), prores);
  check('every other format card is on offer', ['GIF', 'MP4', 'WebM', 'APNG', 'SVG', 'Lottie', 'PSD', 'PDF', 'Illustrator', 'Interactives', 'Sprite sheet', 'PNG sequence'].every((n) => new RegExp(n).test(more)), more.slice(0, 200));
  check('no Show in folder or desktop-only wording in the dialog', !/Show in folder/.test(more));
  // The real Export button, on the default format (a GIF): the picker asks where, the file lands there.
  await w.clickText('Fewer formats');
  await w.clickText('Export', '[role=dialog] .ui-btn-primary, [role=dialog] button');
  await sleep(2500);
  const got = await w.files.collect();
  check('the Export button saves a file through the Save picker', got.length === 1 && got[0].bytes.length > 500, got.map((g) => g.name));
  await w.shot('export-dialog-done');
});

flow('prefs', async () => {
  const w = makeWindow('persist:prefs');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  for (const page of ['general', 'themes', 'behaviour', 'keyboard', 'workspaces', 'plugins', 'features', 'snapping', 'pen', 'diagnostics']) {
    await w.js(`__frameling.overlays.openPrefs('${page}')`);
    await sleep(900);
    await w.shot(`prefs-${page}`);
    const t = await w.js(`(document.querySelector('[role=dialog] .ui-prefs-body, [role=dialog] main, [role=dialog] section') ?? document.querySelector('[role=dialog]'))?.innerText ?? ''`);
    console.log(`== ${page}:`, t.replace(/\n/g, ' | ').slice(130, 1100));
    await w.input.key('Escape');
    await sleep(300);
  }
});

// A pen (made by Chromium's own pen pointer events) on the Pen and tablet page's pad, and on the canvas.
flow('pen', async () => {
  const w = makeWindow('persist:pen');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  const dbg = w.wc.debugger;
  dbg.attach('1.3');
  const pen = (type, x, y, o = {}) =>
    dbg.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type !== 'mouseMoved' ? 'left' : 'none', buttons: type === 'mouseReleased' ? 0 : type === 'mouseMoved' && !o.down ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen', force: o.force ?? 0, tiltX: o.tiltX ?? 0, tiltY: o.tiltY ?? 0 });
  const stroke = async (x0, y0, x1, y1, n = 14) => {
    await pen('mouseMoved', x0, y0);
    await sleep(30);
    await pen('mousePressed', x0, y0, { force: 0.2, down: true });
    for (let i = 1; i <= n; i++) {
      await pen('mouseMoved', Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), { down: true, force: 0.2 + (0.7 * i) / n, tiltX: 20 });
      await sleep(8);
    }
    await pen('mouseReleased', x1, y1, { force: 0 });
    await sleep(150);
  };
  await w.js(`__frameling.openPrefs?.('pen'); __frameling.overlays.openPrefs('pen')`);
  await sleep(900);
  const box = await w.js(`(() => { const r = document.querySelector('.tb-pad').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  await stroke(box[0] + 30, box[1] + 30, box[0] + box[2] - 40, box[1] + box[3] - 40);
  const read = await w.js(`document.querySelector('[data-testid=pen-readout]').innerText`);
  check('the pad hears a pen with its pressure', /Using a pen/.test(read) && /Pressure/.test(read), read);
  await w.shot('pen-pad');
  await w.input.key('Escape');
  await sleep(300);
  // On the canvas with the Brush.
  await w.js(`__frameling.template('blank-vector'); __frameling.store().setUi({ tool: 'brush' })`);
  await sleep(500);
  const before = await w.js(`JSON.stringify(__frameling.store().get().doc.drawings).length`);
  await stroke(400, 300, 800, 420, 20);
  const after = await w.js(`JSON.stringify(__frameling.store().get().doc.drawings).length`);
  check('a pen stroke with the Brush adds a shape', after > before + 50, [before, after]);
  dbg.detach();
});

// Snapping: the Preferences page's ticks, the effect on a real drag, and the choices surviving a reload.
flow('snapping', async () => {
  const w = makeWindow('persist:snapping');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  await w.js(`__frameling.template('blank-vector'); __frameling.store().setUi({ tool: 'rect', zoom: 1, panX: 0, panY: 0 })`);
  await sleep(500);
  const origin = await w.js(`(() => { const b = document.querySelector('.cv-root').getBoundingClientRect(); const u = __frameling.store().get().ui; return [b.left + u.panX, b.top + u.panY, u.zoom]; })()`);
  const lefts = () => w.js(`(() => { let min = 1e9; for (const d of Object.values(__frameling.store().get().doc.drawings)) for (const s of d.shapes ?? []) for (const p of s.paths ?? []) for (const q of p.points) min = Math.min(min, q.x); return min; })()`);
  const rect = async () => {
    const [ox, oy, z] = origin;
    await w.input.drag([[ox + 3 * z, oy + 200 * z], [ox + 200 * z, oy + 300 * z]], 8);
  };
  const tickOf = (label) => w.js(`document.querySelector('[role=dialog] input[aria-label=${JSON.stringify(label)}]')?.checked`);
  // On by default: the corner jumps onto the page's left edge.
  await rect();
  const snapped = await lefts();
  check('with snapping on, a corner dragged near the page edge lands on it', snapped === 0, snapped);
  await w.js(`__frameling.store().undo()`);
  // Switch Page edges off on the Snapping page, the way a person does.
  await w.js(`__frameling.overlays.openPrefs('snapping')`);
  await sleep(800);
  const labels = await w.js(`[...document.querySelectorAll('[role=dialog] input.sn-tick')].map((i) => i.getAttribute('aria-label'))`);
  const pageLabel = labels.find((l) => /Page edges/.test(l));
  check('the Snapping page lists the targets (page edges, guides, grid, shapes...)', !!pageLabel && labels.length >= 8, labels);
  await w.js(`document.querySelector('[role=dialog] input[aria-label=${JSON.stringify(pageLabel)}]').click()`);
  await sleep(300);
  check('the Page edges tick is now off', (await tickOf(pageLabel)) === false);
  await w.shot('snapping-page');
  await w.input.key('Escape');
  await sleep(300);
  await rect();
  const free = await lefts();
  check('with Page edges off the corner stays where it was dropped', free > 1 && free < 5, free);
  await w.js(`__frameling.store().undo()`);
  // The master switch on the Snap button's popover, then a reload keeps both.
  const saved = await w.js(`localStorage.getItem('frameling.view.v1') ?? Object.keys(localStorage).filter((k) => /view|snap/i.test(k)).join(',')`);
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  await w.js(`__frameling.overlays.openPrefs('snapping')`);
  await sleep(800);
  check('a reload keeps the unticked Page edges', (await tickOf(pageLabel)) === false, saved);
});

// Nested folders, clip direction and repeat, and variations: made, saved through the web bridge, opened again.
for (const mode of ['picker', 'plain']) {
  flow(`model-${mode}`, async () => {
    const w = makeWindow(`persist:model-${mode}`);
    await w.load(mode);
    await w.js(`__frameling.overlays.closeSheet()`);
    const snap = () => w.js(`(() => { const d = __frameling.store().rootDoc(); return { folders: Object.fromEntries(Object.entries(d.folders ?? {}).map(([k, f]) => [k, f.parent ?? null])), clips: d.clips.map((c) => [c.name, c.start, c.end, c.direction ?? 'forward', c.repeat ?? 1, c.loop]), variations: (d.artboards ?? []).filter((a) => a.variationOf).length, ovr: JSON.stringify((d.artboards ?? []).map((a) => a.overrides ?? null)).length, artboards: (d.artboards ?? []).length, layers: d.layers.length }; })()`);
    const roundTrip = async (label, fileName) => {
      const before = await snap();
      await w.js(`__framelingIo.saveDocument()`);
      await sleep(500);
      const got = await w.files.collect();
      const f = got.find((g) => /\.frameling$/.test(g.name));
      check(`${label}: saved to a .frameling file`, !!f, got.map((g) => g.name));
      await w.js(`__frameling.template('blank-vector')`);
      await w.js(`__frameling.store().setUi({ dirty: false })`);
      if (mode === 'picker') await w.files.stage(f.name, f.bytes);
      else await w.files.upload(f.name, f.bytes);
      await w.js(`__frameling.run('file.open')`);
      await sleep(1500);
      const after = await snap();
      check(`${label}: opens again the same`, JSON.stringify(before) === JSON.stringify(after), [before, after]);
      return after;
    };
    // Nested folders and clips that play in every direction.
    await w.js(`__framelingExport.loadKitchenSink()`);
    await sleep(800);
    await w.js(`__framelingExport.clearClips(); __framelingExport.addClip('swing', 0, 3, true, 'pingpong'); __framelingExport.addClip('back', 4, 7, false, 'reverse'); __framelingExport.addClip('thrice', 8, 9, false, 'forward', 3); __framelingExport.addClip('there', 10, 12, true, 'pingpong-reverse')`);
    const s0 = await snap();
    check('the kitchen sink has a folder inside a folder', Object.values(s0.folders).some((p) => p) && Object.keys(s0.folders).length >= 2, s0.folders);
    await w.js(`__frameling.store().update('Rename', (d) => { d.name = 'Kitchen web'; })`);
    const s1 = await roundTrip('folders and clip direction', 'Kitchen web.frameling');
    check('every clip keeps its direction and repeat', s1.clips.length === 4 && s1.clips.some((c) => c[3] === 'pingpong') && s1.clips.some((c) => c[3] === 'reverse') && s1.clips.some((c) => c[4] === 3), s1.clips);
    // A clip exports in its own order: a ping-pong clip of 4 pictures comes out as more than 4 frames.
    const defaults = await w.js(`__framelingExport.defaults()`);
    const clipId = await w.js(`__frameling.store().rootDoc().clips.find((c) => c.direction === 'pingpong').id`);
    const plan = await w.js(`__framelingExport.plan(${JSON.stringify({ ...defaults, format: 'gif', range: 'clip', clipId })})`);
    check(`a ping-pong clip exports in play order (${plan.count} pictures from 4 frames)`, plan.count > 4 && Array.isArray(plan.order), plan);
    const r = await w.js(`__framelingExport.run(${JSON.stringify({ ...defaults, format: 'gif', range: 'clip', clipId })})`);
    const out = await w.files.collect();
    check('and the GIF of that clip is made and saved', r.outcome === 'done' && out.length === 1 && MAGIC.gif(out[0].bytes), [r.error, out.map((o) => o.name)]);
    // Variations (a recolour and a framed cut) on artboards.
    await w.js(`__framelingArtboards.load('variations')`);
    await sleep(800);
    const v0 = await snap();
    check('the demo has variations on its artboards', v0.variations >= 2 && v0.artboards >= 1, v0);
    await w.js(`__frameling.store().update('Rename', (d) => { d.name = 'Variations web'; })`);
    await roundTrip('variations', 'Variations web.frameling');
    await w.shot(`model-${mode}`);
  });
}

// The service worker: the app opens with no network, after plugin frames, and updates come back when the network does.
flow('offline', async (ctx) => {
  const w = makeWindow('persist:offline');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  const sw = await w.waitFor(`navigator.serviceWorker.ready.then((r) => !!r.active)`, 15000);
  check('the service worker installs and activates', !!sw, sw);
  // It takes control on the next load; wait for the copy of the app to be complete.
  const cached = await w.waitFor(`caches.keys().then(async (ks) => { const k = ks.find((x) => /^frameling-/.test(x)); if (!k) return 0; return (await (await caches.open(k)).keys()).length; }).then((n) => n > 50 && n)`, 15000);
  check('the whole app is kept in the cache', cached > 50, cached);
  await w.load('picker');
  check('the page is controlled by the worker after a reload', await w.js(`!!navigator.serviceWorker.controller`));
  // A plugin's sandbox frame is a navigation too: it must not replace the saved page.
  await w.js(`new Promise((res) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.src = new URL('plugin-host.html', document.baseURI).href + '?plugin=probe'; f.onload = () => setTimeout(res, 300); document.body.appendChild(f); })`);
  await sleep(500);
  const home = await w.js(`caches.keys().then(async (ks) => { const c = await caches.open(ks.find((x) => /^frameling-/.test(x))); const r = await c.match('./'); return (await r.text()).slice(0, 4000); })`);
  check("a plugin frame's page does not replace the saved app page", /<div id="root">/.test(home) && !/Plugin<\/title>/.test(home), home.slice(0, 200));
  // Offline: stop the server and reload.
  await ctx.unlisten();
  await w.win.loadURL(`http://127.0.0.1:${ctx.port}/?debug&shim=picker`).catch(() => {});
  await sleep(2500);
  const up = await w.js(`!!(window.__frameling && window.frameling && document.querySelector('.ui-app'))`).catch(() => false);
  check('offline: the app opens from the saved copy', up === true, up);
  if (up) {
    await w.js(`__frameling.overlays.closeSheet()`);
    await w.js(`__frameling.template('bouncing-ball')`);
    await sleep(400);
    check('offline: a template opens and draws', (await w.js(`__frameling.store().get().doc.layers.length`)) >= 1);
    // Parts that load on demand (the Export dialog, Help) come from the cache too.
    await w.run('file.export');
    check('offline: the Export dialog (a lazy part) opens', await w.waitFor(`/Animated GIF/.test(document.body.innerText)`, 6000));
    await w.input.key('Escape');
    await sleep(300);
    await w.js(`__frameling.overlays.openHelp('exporting')`);
    check('offline: Help opens', await w.waitFor(`/Export/.test(document.querySelector('[role=dialog]')?.innerText ?? '')`, 6000));
    await sleep(800);
    await w.shot('offline-help');
    // A save still works (picker mode writes to the disk, no network).
    await w.js(`__frameling.overlays.closeHelp?.()`);
    await w.js(`__frameling.store().update('Rename', (d) => { d.name = 'Offline'; })`);
    await w.js(`__framelingIo.saveDocument()`);
    await sleep(400);
    check('offline: Save works', (await w.files.collect()).length === 1);
  }
  await ctx.listen();
  await w.load('picker');
  check('back online: the app loads again', await w.js(`!!window.__frameling`));
});

// Plugins in the web build: the sandbox page's policy, an example installed from a file, running, kept in the browser
// across a reload, and still starting with no network.
const PROBE = `
const violations = [];
self.addEventListener('securitypolicyviolation', (e) => violations.push(e.blockedURI || e.violatedDirective));
onmessage = async (e) => {
  const port = e.ports[0];
  const r = {};
  try { await fetch('https://example.com/'); r.fetch = 'reached'; } catch (err) { r.fetch = 'blocked'; }
  try { importScripts('https://example.com/x.js'); r.importScripts = 'reached'; } catch (err) { r.importScripts = 'blocked'; }
  try { await new Promise((ok, bad) => { const q = indexedDB.open('x'); q.onsuccess = ok; q.onerror = () => bad(q.error); }); r.indexedDB = 'opened'; } catch (err) { r.indexedDB = 'blocked'; }
  r.document = typeof document;
  r.parent = typeof parent;
  await new Promise((ok) => setTimeout(ok, 300));
  r.violations = violations;
  port.postMessage(r);
};`;
const example = (name) => ({
  'manifest.json': fs.readFileSync(path.join(__dirname, '../../plugins/examples', name, 'manifest.json'), 'utf8'),
  'main.js': fs.readFileSync(path.join(__dirname, '../../plugins/examples', name, 'main.js'), 'utf8'),
});
flow('plugins', async (ctx) => {
  const w = makeWindow('persist:plugins');
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  for (const [page, net] of [['plugin-host.html', []], ['plugin-host-net.html', ['https://allowed.example.com']]]) {
    const r = await w.js(`new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.src = new URL(${JSON.stringify(page)}, document.baseURI).href;
      const t = setTimeout(() => resolve({ timeout: true }), 8000);
      addEventListener('message', function on(e) {
        if (e.source !== f.contentWindow) return;
        removeEventListener('message', on);
        let reachable; try { reachable = !!f.contentDocument; } catch (err) { reachable = false; }
        const ch = new MessageChannel();
        ch.port1.onmessage = (m) => { clearTimeout(t); f.remove(); resolve({ ...m.data, appReachable: reachable }); };
        f.contentWindow.postMessage({ t: 'start', prelude: ${JSON.stringify(PROBE)}, code: '', plugin: {}, network: ${JSON.stringify(net)} }, '*', [ch.port2]);
      });
      document.body.appendChild(f);
    })`);
    const tag = net.length ? 'net page' : 'plain page';
    check(`${tag}: the sandbox worker starts`, !r.timeout, r);
    check(`${tag}: the frame can't reach the app, the network or storage`, r.appReachable === false && r.fetch === 'blocked' && r.importScripts === 'blocked' && r.indexedDB === 'blocked' && r.document === 'undefined' && r.parent === 'undefined', r);
  }
  const install = async (name) => {
    await w.js(`window.__framelingPlugins.install(${JSON.stringify(example(name))}); true`);
    await sleep(400);
    await w.js(`document.querySelector('.plugin-approve .ui-btn-primary')?.click(); true`);
    await sleep(1200);
  };
  await install('flip-every-other-frame');
  const list = await w.js(`__framelingPlugins.list()`);
  check('the example plugin installs and runs in the web sandbox', list.length === 1 && list[0].status === 'on', list);
  const flip = async () => {
    await w.js(`__frameling.template('bouncing-ball'); 0`);
    await sleep(300);
    const read = () => w.js(`(() => { const s = __frameling.store().get(); const l = s.doc.layers.find((x) => x.cels.length > 2); __frameling.store().setUi({ activeLayerId: l.id }); const d = s.doc.drawings[l.cels[1].drawingId]; return JSON.stringify(d.shapes?.[0]?.paths?.[0]?.points?.[0] ?? d.shapes?.[0]); })()`);
    const before = await read();
    await w.js(`void __frameling.run('plugin.flip-every-other-frame.flip'); 0`);
    await sleep(1000);
    return before !== (await read());
  };
  check("the plugin's command edits the drawing", await flip());
  await w.shot('plugins-installed');
  // A reload: the plugin is kept (IndexedDB) and starts again.
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  await sleep(1500);
  const again = await w.js(`__framelingPlugins.list()`);
  check('after a reload the plugin is still there and on', again.length === 1 && again[0].status === 'on', again);
  // Offline: a sandboxed frame has no origin, so the browser never asks the service worker for its page. The plugin
  // can't start; it says so (a problem the person can read), and it starts again once the network is back.
  await w.waitFor(`navigator.serviceWorker.ready.then((r) => !!r.active)`, 10000);
  await w.load('picker');
  await ctx.unlisten();
  await w.win.loadURL(`http://127.0.0.1:${ctx.port}/?debug&shim=picker`).catch(() => {});
  await sleep(12000);
  await w.js(`__frameling.overlays.closeSheet()`).catch(() => {});
  const off = await w.js(`__framelingPlugins.list()`).catch(() => null);
  check('offline: the app opens, and the plugin that cannot start says so instead of hanging', off && off.length === 1 && off[0].status === 'problem' && /sandbox did not start/.test(off[0].problem || ''), off);
  const frames = await w.js(`document.querySelectorAll('iframe.plugin-sandbox').length`).catch(() => -1);
  check('offline: no copy of the app is loaded inside a plugin frame', frames === 0, frames);
  await ctx.listen();
  await w.load('picker');
  await w.js(`__frameling.overlays.closeSheet()`);
  await sleep(2000);
  const back = await w.js(`__framelingPlugins.list()`);
  check('back online: the plugin starts again', back.length === 1 && back[0].status === 'on', back);
});

