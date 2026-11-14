// End-to-end check of Turn into pixels and Turn into shapes in the real app: the dialog opens from its command, the
// buttons work, the result lands where it says, and one undo puts everything back.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/convert.cjs [outDir]
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
const { app, BrowserWindow } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const art = require('../docs/help/_convert-art.cjs');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('convert.cjs'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-convert-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let current = null;
const begin = (name) => (current = results[results.push({ name, failures: [] }) - 1]);
const check = (cond, msg) => {
  if (!cond) current.failures.push(msg);
  return !!cond;
};
let win;
const pageErrors = [];
const ev = (js) => win.webContents.executeJavaScript(js, true);
const F = '__frameling';
const click = (id) => ev(`(() => { const b = document.querySelector('[data-testid="${id}"]'); if (!b) return false; b.click(); return true; })()`);
const text = (id) => ev(`document.querySelector('[data-testid="${id}"]')?.innerText ?? null`);
const layers = () => ev(`JSON.stringify(${F}.store().get().doc.layers.map((l) => ({ kind: l.kind, name: l.name, visible: l.visible, ps: l.pixelSize ?? null, cels: l.cels.length })))`).then(JSON.parse);
const waitFor = async (js, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await ev(js)) return true;
    await sleep(100);
  }
  return false;
};
const dialogReady = () => waitFor(`!!document.querySelector('[data-testid="convert.apply"]') && !document.querySelector('[data-testid="convert.apply"]').disabled`);
const undo = () => ev(`${F}.run('edit.undo')`);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = outDir;
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.on('console-message', (e) => {
      const lvl = e.level ?? e.severity;
      if (lvl === 'error' || lvl === 3) pageErrors.push(String(e.message ?? e));
    });
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev(`!!window.${F}`)) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

async function section() {
  await ev(`${F}.choices.forget(${F}.choices.all())`);

  begin('shapes into pixels: a new layer beside the original, original hidden, one undo');
  await ev(`${F}.template('blank-vector')`);
  await ev(art.vectorCharacter.eval);
  check((await layers()).length === 2, 'the blank vector document should have two layers');
  await ev(`${F}.run('convert.toPixels')`);
  check(await dialogReady(), 'the dialog never became ready');
  check((await text('convert.lose'))?.includes('no longer reshape'), 'the dialog should say what you lose');
  await click('convert.size.8');
  check(await dialogReady(), 'preview did not come back after a size change');
  check((await text('convert.note'))?.includes('160 by 90'), `note: ${await text('convert.note')}`);
  await click('convert.apply');
  await sleep(400);
  let ls = await layers();
  check(ls.length === 3, `expected 3 layers, got ${ls.length}`);
  const made = ls.find((l) => l.kind === 'pixel');
  check(made && made.ps === 8, `pixel layer at 8x: ${JSON.stringify(made)}`);
  check(ls.find((l) => l.name === 'Lines')?.visible === false, 'the original Lines layer should be hidden');
  check(ls.find((l) => l.kind === 'pixel')?.name === 'Lines (pixels)', 'name');
  await undo();
  await sleep(200);
  ls = await layers();
  check(ls.length === 2 && ls.every((l) => l.visible), `one undo should bring back both layers: ${JSON.stringify(ls)}`);

  begin('shapes into pixels: in its place');
  await ev(`${F}.run('convert.toPixels')`);
  check(await dialogReady(), 'dialog');
  await click('convert.where.replace');
  await click('convert.size.4');
  check(await dialogReady(), 'preview');
  await click('convert.apply');
  await sleep(400);
  ls = await layers();
  check(ls.length === 2 && ls.some((l) => l.kind === 'pixel' && l.name === 'Lines'), `the pixels should take the place of Lines: ${JSON.stringify(ls)}`);
  const drawn = await ev(`(() => { const d = ${F}.store().get().doc; const l = d.layers.find((x) => x.kind === 'pixel'); const dr = d.drawings[l.cels[0].drawingId]; let n = 0; for (let i = 3; i < dr.pixels.length; i += 4) if (dr.pixels[i] === 255) n++; return n; })()`);
  check(drawn > 500, `the pixel drawing should have painted pixels, has ${drawn}`);
  await undo();
  await sleep(200);
  ls = await layers();
  check(ls.length === 2 && ls.some((l) => l.kind === 'vector' && l.name === 'Lines'), 'undo should bring the vector layer back');
  await ev(`${F}.choices.forget(['convert.where'])`);

  begin('pixels into shapes: pixel art stays exact, 5 colours, 5 shapes');
  await ev(`${F}.template('blank-pixel')`);
  await ev(art.pixelMushroom.eval);
  await ev(`${F}.run('convert.toShapes')`);
  check(await dialogReady(), 'dialog');
  check((await text('convert.note'))?.startsWith('5 shapes'), `note: ${await text('convert.note')}`);
  check(!(await ev(`!!document.querySelector('[data-testid="convert.warn"]')`)), 'pixel art should get no warning');
  await click('convert.apply');
  await sleep(400);
  ls = await layers();
  check(ls.length === 2 && ls[1].kind === 'vector' && ls[0].visible === false, `layers: ${JSON.stringify(ls)}`);
  const sel = await ev(`${F}.store().get().ui.selection.length`);
  check(sel === 5, `the new shapes should be selected, ${sel} are`);
  await undo();
  await sleep(200);
  check((await layers()).length === 1, 'undo should remove the shape layer');

  begin('pixels into shapes: a photo gets a plain warning before the work, and the button says anyway');
  await ev(`${F}.template('blank-pixel')`);
  await ev(art.pixelPhoto.eval);
  await ev(`${F}.run('convert.toShapes')`);
  check(await dialogReady(), 'dialog');
  const warn = await text('convert.warn');
  check(warn && /photo/.test(warn), `warning: ${warn}`);
  check(/anyway/.test((await text('convert.apply')) ?? ''), 'the button should say anyway');
  await click('convert.cancel');
  await sleep(200);
  check((await layers()).length === 1, 'cancel should change nothing');

  begin('both commands are registered');
  await ev(`${F}.template('blank-pixel')`);
  const en = await ev(`(() => { const c = ${F}.commands(); return c.includes('convert.toPixels') && c.includes('convert.toShapes'); })()`);
  check(en, 'both commands should be registered');
}

function report() {
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed. Output: ${outDir}`);
  return bad.length === 0;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 5 * 60 * 1000);
  try {
    await startApp();
    await section();
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
