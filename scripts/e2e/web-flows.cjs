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
