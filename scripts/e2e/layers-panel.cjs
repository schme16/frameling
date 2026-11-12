// End-to-end check of the nested Layers panel in the real app: drag a layer into a folder (the middle of its row), above or
// below a row (its edges), drag a folder into a folder, Alt+Up/Down/Left/Right moves, fold and unfold, the aria-level of
// every row, and an undo (and redo) of each move.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/layers-panel.cjs [outDir]
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
//
// Keys, clicks and undo are real input events sent to the window. A drag can't be: Chromium starts a drag with the
// operating system, which never finishes when the mouse is synthesised, so the drag is the same DragEvents (dragstart,
// dragover at a real point inside the row, drop, dragend) dispatched on the real rows, which run the panel's own handlers
// and the same Move command a person's drag does.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('layers-panel.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-layers-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let current = null;
const begin = (name) => (current = results[results.push({ name, failures: [], notes: [] }) - 1]);
const check = (cond, msg) => {
  if (!cond) current.failures.push(msg);
  return !!cond;
};
const note = (m) => current.notes.push(m);

let win;
const pageErrors = [];
const ev = (js) => win.webContents.executeJavaScript(js, true);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.webContents.on('console-message', (e) => {
      const lvl = e.level ?? e.severity;
      if (lvl === 'error' || lvl === 3) pageErrors.push(String(e.message ?? e));
    });
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  win.setSize(1600, 1000);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

// Helpers that live in the page.
//   rows()   the rows as the panel draws them, top first: a layer's id or `F` and a folder's id, then `:` and its aria-level
//   model()  the same from the document: layers top first, each followed by `@` and the folders around it (outermost first)
//   key()    layer order and folders, to compare a state with an earlier one
//   dnd(from, to, fy)  a drag of one row to the point `fy` (0 top to 1 bottom) of another
const PAGE = `(() => {
  const S = () => window.__frameling.store();
  const sel = (id) => (id.startsWith('F:') ? '[data-folder="' + id.slice(2) + '"]' : '[data-layer="' + id + '"]');
  window.__lp = {
    sel,
    rows: () => [...document.querySelectorAll('[role=treeitem][data-row]')].map((e) => (e.dataset.layer ?? 'F' + e.dataset.folder) + ':' + e.getAttribute('aria-level')).join(' '),
    open: (id) => document.querySelector(sel(id))?.getAttribute('aria-expanded'),
    model: () => {
      const { doc } = S().get();
      const chain = (l) => { const out = []; let f = l.folder; while (f && doc.folders?.[f] && out.length < 12) { out.unshift(f); f = doc.folders[f].parent; } return out; };
      return doc.layers.slice().reverse().map((l) => l.id + (l.folder ? '@' + chain(l).join('/') : '')).join(' ');
    },
    key: () => { const { doc } = S().get(); return JSON.stringify([doc.layers.map((l) => [l.id, l.folder ?? null]), doc.folders ?? null]); },
    history: () => S().historyIds(),
    focused: () => { const a = document.activeElement; return a?.dataset?.layer ?? (a?.dataset?.folder ? 'F:' + a.dataset.folder : null); },
    focus: (id) => { const e = document.querySelector(sel(id)); e?.focus(); return document.activeElement === e; },
    dnd: (from, to, fy) => {
      const a = document.querySelector(sel(from)), b = document.querySelector(sel(to));
      if (!a || !b) return 'missing row ' + (a ? to : from);
      const dt = new DataTransfer();
      const r = b.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const mk = (type, el, y) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: Math.round(el.left + 60), clientY: Math.round(y) });
      a.dispatchEvent(mk('dragstart', ar, ar.top + ar.height / 2));
      b.dispatchEvent(mk('dragenter', r, r.top + r.height * fy));
      b.dispatchEvent(mk('dragover', r, r.top + r.height * fy));
      return 'ok';
    },
    drop: (from, to, fy) => {
      const a = document.querySelector(sel(from)), b = document.querySelector(sel(to));
      const r = b.getBoundingClientRect();
      const y = Math.round(r.top + r.height * fy);
      b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: Math.round(r.left + 60), clientY: y }));
      a?.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
      return true;
    },
  };
  return true;
})()`;

// Five layers, bottom first: a, b, c, d, e. P holds b and Q holds d, so the panel shows, top first: e, Q (d), c, P (b), a.
const SETUP = `(async () => {
  const E = window.__framelingExport, S = window.__frameling.store();
  await E.load('blank-vector');
  window.__frameling.overlays.closeSheet();
  await new Promise((r) => setTimeout(r, 300));
  S.update('setup', (d) => {
    const base = d.layers[0];
    const lay = (id, folder) => ({ ...JSON.parse(JSON.stringify(base)), id, name: id, cels: [{ id: 'c' + id, start: 0, length: 6, drawingId: 'd' + id }], ...(folder ? { folder } : {}) });
    d.drawings = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) d.drawings['d' + id] = { id: 'd' + id, kind: 'vector', shapes: [] };
    d.layers = [lay('a'), lay('b', 'P'), lay('c'), lay('d', 'Q'), lay('e')];
    d.folders = { P: { id: 'P', name: 'P', visible: true, opacity: 1 }, Q: { id: 'Q', name: 'Q', visible: true, opacity: 1 } };
  });
  S.setUi({ activeLayerId: 'e', frame: 0 });
  window.__frameling.dock.resizeZone('bottom', 430);
  await new Promise((r) => setTimeout(r, 500));
  return true;
})()`;

const START = 'e:1 FQ:1 d:2 c:1 FP:1 b:2 a:1';
const START_MODEL = 'e d@Q c b@P a';

const rows = () => ev('window.__lp.rows()');
const model = () => ev('window.__lp.model()');

async function press(keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  await sleep(30);
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await sleep(220);
}
const undo = () => press('Z', ['control']);
const redo = () => press('Z', ['control', 'shift']);

/** Drags `from` to the point `fy` of `to`, with one frame between the events like a real drag. */
async function drag(from, to, fy) {
  const a = await ev(`window.__lp.dnd(${JSON.stringify(from)}, ${JSON.stringify(to)}, ${fy})`);
  await sleep(120);
  if (a !== 'ok') return a;
  await ev(`window.__lp.drop(${JSON.stringify(from)}, ${JSON.stringify(to)}, ${fy})`);
  await sleep(250);
  return 'ok';
}

/**
 * Runs a move, checks what the panel and the document look like after it, then undoes it (one step back to exactly the
 * state before) and redoes it. `expect` is { rows, model }; a move that must do nothing passes the starting ones.
 */
async function moveCase(name, doMove, expect, opts = {}) {
  begin(name);
  const before = { rows: await rows(), model: await model(), key: await ev('window.__lp.key()'), hist: await ev('window.__lp.history()') };
  const res = await doMove();
  if (res && res !== 'ok') return check(false, String(res));
  await sleep(150);
  const after = { rows: await rows(), model: await model(), key: await ev('window.__lp.key()'), hist: await ev('window.__lp.history()') };
  check(after.model === expect.model, `the document is "${after.model}", expected "${expect.model}"`);
  check(after.rows === expect.rows, `the panel shows "${after.rows}", expected "${expect.rows}"`);
  if (opts.noChange) {
    check(after.hist.undo === before.hist.undo, 'a move that does nothing still made an undo step');
    return;
  }
  check(after.hist.undo !== before.hist.undo, 'the move made no undo step');
  await undo();
  const back = { rows: await rows(), model: await model(), key: await ev('window.__lp.key()'), hist: await ev('window.__lp.history()') };
  check(back.key === before.key && back.model === before.model, `undo did not restore the layers: "${back.model}" (was "${before.model}")`);
  check(back.rows === before.rows, `after undo the panel shows "${back.rows}", expected "${before.rows}"`);
  check(back.hist.undo === before.hist.undo, 'one undo did not take back the whole move (it was more than one step)');
  await redo();
  const again = { rows: await rows(), model: await model() };
  check(again.model === expect.model && again.rows === expect.rows, `redo gave "${again.model}" / "${again.rows}", expected "${expect.model}" / "${expect.rows}"`);
  await undo();
  check((await ev('window.__lp.key()')) === before.key, 'the second undo did not restore the layers');
}

async function dragSection() {
  await moveCase('drag a layer into a folder: the middle of the folder row', () => drag('e', 'F:P', 0.5), { model: 'd@Q c e@P b@P a', rows: 'FQ:1 d:2 c:1 FP:1 e:2 b:2 a:1' });
  // Q inside P first (a setup move, taken back below), then a layer into Q: three levels deep.
  await drag('F:Q', 'F:P', 0.5);
  await moveCase('drag a layer into a folder that is inside a folder (aria-level 3)', () => drag('e', 'F:Q', 0.5), { model: 'c e@P/Q d@P/Q b@P a', rows: 'c:1 FP:1 FQ:2 e:3 d:3 b:2 a:1' });
  await undo();
  check((await rows()) === START, `taking the setup move back gave "${await rows()}"`);
  await moveCase('drag a layer above a layer: the top edge of its row', () => drag('a', 'c', 0.15), { model: 'e d@Q a c b@P', rows: 'e:1 FQ:1 d:2 a:1 c:1 FP:1 b:2' });
  await moveCase('drag a layer below a layer: the bottom edge of its row', () => drag('e', 'c', 0.85), { model: 'd@Q c e b@P a', rows: 'FQ:1 d:2 c:1 e:1 FP:1 b:2 a:1' });
  await moveCase('drag a layer onto the lower half of a layer in a folder: it joins that folder', () => drag('a', 'b', 0.85), { model: 'e d@Q c b@P a@P', rows: 'e:1 FQ:1 d:2 c:1 FP:1 b:2 a:2' });
  await moveCase('drag a layer onto the upper half of a layer in a folder: it joins that folder, above it', () => drag('c', 'd', 0.15), { model: 'e c@Q d@Q b@P a', rows: 'e:1 FQ:1 c:2 d:2 FP:1 b:2 a:1' });
  await moveCase('drag a layer to the top edge of a folder row: it goes above the folder, not in it', () => drag('e', 'F:P', 0.1), { model: 'd@Q c e b@P a', rows: 'FQ:1 d:2 c:1 e:1 FP:1 b:2 a:1' });
  await moveCase('drag a layer onto a folder row that is not its own place: layer from a folder into another folder', () => drag('d', 'F:P', 0.5), { model: 'e c d@P b@P a', rows: 'e:1 c:1 FP:1 d:2 b:2 a:1' });
  await moveCase('drag a folder into a folder: the middle of its row (the layers go one level deeper)', () => drag('F:Q', 'F:P', 0.5), { model: 'e c d@P/Q b@P a', rows: 'e:1 c:1 FP:1 FQ:2 d:3 b:2 a:1' });
  await moveCase('drag the other folder into the first one', () => drag('F:P', 'F:Q', 0.5), { model: 'e b@Q/P d@Q c a', rows: 'e:1 FQ:1 FP:2 b:3 d:2 c:1 a:1' });
  await moveCase('drag a folder above another folder: the top edge of its row', () => drag('F:Q', 'F:P', 0.1), { model: 'e c d@Q b@P a', rows: 'e:1 c:1 FQ:1 d:2 FP:1 b:2 a:1' });
  await moveCase('drag a folder to the bottom edge of a layer: below it, at its level', () => drag('F:P', 'e', 0.85), { model: 'e b@P d@Q c a', rows: 'e:1 FP:1 b:2 FQ:1 d:2 c:1 a:1' });

  // A folder can't go into its own insides: first put P inside Q, then drag Q onto P.
  begin('a folder dropped inside itself does nothing');
  await drag('F:P', 'F:Q', 0.5);
  const nested = await model();
  const hist = await ev('window.__lp.history()');
  const r = await drag('F:Q', 'F:P', 0.5);
  check(r === 'ok', String(r));
  check((await model()) === nested, `the layers moved: "${await model()}"`);
  check((await ev('window.__lp.history()')).undo === hist.undo, 'a move that cannot happen still made an undo step');
  await undo();
  check((await model()) === START_MODEL, `undo gave "${await model()}"`);
  check((await rows()) === START, `the panel shows "${await rows()}" after the undo`);

  begin('dropping a layer on itself does nothing');
  const h2 = await ev('window.__lp.history()');
  await drag('c', 'c', 0.5);
  check((await model()) === START_MODEL && (await ev('window.__lp.history()')).undo === h2.undo, 'a drop on itself changed something');
}

async function keySection() {
  // Focus a row, press Alt and an arrow on it; the keyboard focus must stay on that row.
  const alt = (id, key, expect, name, opts) =>
    moveCase(
      name,
      async () => {
        if (!(await ev(`window.__lp.focus(${JSON.stringify(id)})`))) return `could not focus ${id}`;
        await press(key, ['alt']);
        await sleep(200);
        const f = await ev('window.__lp.focused()');
        return f === id ? 'ok' : `the focus is on ${f}, expected ${id}`;
      },
      expect,
      opts,
    );
  await alt('e', 'Up', { model: START_MODEL, rows: START }, 'Alt+Up on the top layer of the stage does nothing', { noChange: true });
  await alt('c', 'Left', { model: START_MODEL, rows: START }, 'Alt+Left on a layer that is not in a folder does nothing', { noChange: true });
  await alt('a', 'Up', { model: 'e d@Q c b@P a@P', rows: 'e:1 FQ:1 d:2 c:1 FP:1 b:2 a:2' }, 'Alt+Up on the layer under a folder: it steps into the folder at the bottom');
  await alt('e', 'Down', { model: 'e@Q d@Q c b@P a', rows: 'FQ:1 e:2 d:2 c:1 FP:1 b:2 a:1' }, 'Alt+Down on the layer above a folder: it steps into the folder at the top');
  await alt('c', 'Up', { model: 'e d@Q c@Q b@P a', rows: 'e:1 FQ:1 d:2 c:2 FP:1 b:2 a:1' }, 'Alt+Up on a layer under a folder: it steps in at the folder\'s bottom');
  await alt('c', 'Down', { model: 'e d@Q c@P b@P a', rows: 'e:1 FQ:1 d:2 FP:1 c:2 b:2 a:1' }, 'Alt+Down on a layer above a folder: it steps into the folder at its top');
  await alt('d', 'Left', { model: 'e d c b@P a', rows: 'e:1 d:1 c:1 FP:1 b:2 a:1' }, 'Alt+Left on a layer in a folder: it comes out (the empty folder goes)');
  await alt('c', 'Right', { model: 'e d@Q c@Q b@P a', rows: 'e:1 FQ:1 d:2 c:2 FP:1 b:2 a:1' }, 'Alt+Right on a layer next to a folder: it goes into it');
  await alt('e', 'Right', { model: 'e@Q d@Q c b@P a', rows: 'FQ:1 e:2 d:2 c:1 FP:1 b:2 a:1' }, 'Alt+Right on the layer above a folder: it goes into it');
  await alt('F:P', 'Up', { model: 'e d@Q b@P c a', rows: 'e:1 FQ:1 d:2 FP:1 b:2 c:1 a:1' }, 'Alt+Up on a folder: it swaps with the layer above it');
  await alt('F:Q', 'Down', { model: 'e c d@Q b@P a', rows: 'e:1 c:1 FQ:1 d:2 FP:1 b:2 a:1' }, 'Alt+Down on a folder: it swaps with the layer below it');
  // Two folders side by side: Alt+Down on Q swaps it with c. The next cases start from there and the moves are taken back at the end.
  begin('Alt+Down on a folder (to put the two folders side by side)');
  await ev('window.__lp.focus("F:Q")');
  await press('Down', ['alt']);
  check((await rows()) === 'e:1 c:1 FQ:1 d:2 FP:1 b:2 a:1', `the panel shows "${await rows()}"`);
  await alt('F:P', 'Right', { model: 'e c d@Q b@Q/P a', rows: 'e:1 c:1 FQ:1 d:2 FP:2 b:3 a:1' }, 'Alt+Right on a folder next to a folder: it goes into the one above, at the bottom (aria-level 2 and 3)');
  await ev('window.__lp.focus("F:P")');
  await press('Right', ['alt']);
  await alt('F:P', 'Left', { model: 'e c b@P d@Q a', rows: 'e:1 c:1 FP:1 b:2 FQ:1 d:2 a:1' }, 'Alt+Left on a folder inside a folder: it comes out, above the folder it was in');
  await undo();
  await undo();
  check((await rows()) === START, `taking the setup moves back gave "${await rows()}"`);
}

async function foldSection() {
  begin('fold and unfold a folder with the twisty button');
  check((await rows()) === START, `start: ${await rows()}`);
  check((await ev('window.__lp.open("F:Q")')) === 'true', 'the folder row is not marked open');
  const twisty = await ev(`(() => { const r = document.querySelector('[data-folder="Q"] .tl-folder-twisty').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const click = async (p) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(40);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const hist = await ev('window.__lp.history()');
  await click(twisty);
  check((await rows()) === 'e:1 FQ:1 c:1 FP:1 b:2 a:1', `folded: ${await rows()}`);
  check((await ev('window.__lp.open("F:Q")')) === 'false', 'the folded folder is still marked open');
  check((await model()) === START_MODEL, 'folding changed the layers');
  await click(twisty);
  check((await rows()) === START, `unfolded: ${await rows()}`);
  check((await ev('window.__lp.open("F:Q")')) === 'true', 'the unfolded folder is not marked open');
  check((await ev('window.__lp.history()')).undo === hist.undo, 'folding made an undo step (it is a view setting)');

  begin('fold and unfold with the keys: Left folds, Right unfolds, Left on a layer goes to its folder');
  await ev('window.__lp.focus("F:Q")');
  await press('Left');
  check((await ev('window.__lp.open("F:Q")')) === 'false' && (await rows()) === 'e:1 FQ:1 c:1 FP:1 b:2 a:1', `after Left: ${await rows()}`);
  await ev('window.__lp.focus("F:Q")');
  await press('Right');
  check((await ev('window.__lp.open("F:Q")')) === 'true' && (await rows()) === START, `after Right: ${await rows()}`);
  await ev('window.__lp.focus("d")');
  await press('Left');
  check((await ev('window.__lp.focused()')) === 'F:Q', `Left on a layer in a folder went to ${await ev('window.__lp.focused()')}`);
  await press('Down');
  check((await ev('window.__lp.focused()')) === 'd', `Down from the folder went to ${await ev('window.__lp.focused()')}`);
  await press('Enter');

  begin('a folded folder: its layers are hidden from the list, a drop on its bottom edge goes below it, a layer is not lost');
  await ev('window.__lp.focus("F:P")');
  await press('Left');
  check((await rows()) === 'e:1 FQ:1 d:2 c:1 FP:1 a:1', `folded P: ${await rows()}`);
  const hist2 = await ev('window.__lp.history()');
  check((await drag('e', 'F:P', 0.9)) === 'ok', 'drag failed');
  check((await model()) === 'd@Q c b@P e a' && (await rows()) === 'FQ:1 d:2 c:1 FP:1 e:1 a:1', `after the drop on the bottom edge of the folded folder: ${await model()} / ${await rows()} (expected e just below the folder, outside it)`);
  await undo();
  check((await model()) === START_MODEL && (await ev('window.__lp.history()')).undo === hist2.undo, `undo: ${await model()}`);
  await ev('window.__lp.focus("F:P")');
  await press('Right');
  check((await rows()) === START, `unfolded P: ${await rows()}`);
}

async function levelsSection() {
  begin('aria-level of every row follows the nesting, three deep');
  await drag('F:P', 'F:Q', 0.5); // P inside Q
  const levels = await ev(`[...document.querySelectorAll('[role=treeitem][data-row]')].map((e) => [e.dataset.layer ?? 'F' + e.dataset.folder, Number(e.getAttribute('aria-level'))])`);
  const want = { e: 1, FQ: 1, FP: 2, b: 3, d: 2, c: 1, a: 1 };
  for (const [id, lv] of levels) check(want[id] === lv, `${id} has aria-level ${lv}, expected ${want[id]}`);
  check(levels.length === 7, `${levels.length} rows`);
  // The tree's own shape: role=tree holds only treeitems, expanded folders say so, and the level steps by one at most.
  let prev = 0;
  for (const [id, lv] of levels) {
    check(lv <= prev + 1, `${id} jumps from level ${prev} to ${lv}`);
    prev = lv;
  }
  const expanded = await ev(`[...document.querySelectorAll('[role=treeitem][data-folder]')].every((e) => e.getAttribute('aria-expanded') === 'true')`);
  check(expanded, 'an open folder is not marked aria-expanded');
  await undo();
  check((await rows()) === START, `undo: ${await rows()}`);
}

function report() {
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const n of r.notes) console.log(`       . ${n}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed. Output: ${outDir}`);
  return bad.length === 0 && !pageErrors.length;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 10 * 60 * 1000);
  try {
    await startApp();
    await ev(PAGE);
    begin('setup: five layers, two folders');
    check(await ev(SETUP), 'setup failed');
    check((await rows()) === START, `the panel shows "${await rows()}", expected "${START}"`);
    check((await model()) === START_MODEL, `the document is "${await model()}"`);
    await dragSection();
    await keySection();
    await foldSection();
    await levelsSection();
    fs.writeFileSync(path.join(outDir, 'layers-panel.png'), (await win.webContents.capturePage()).toPNG());
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
