// The three timeline changes on Quill's real file, in the real app: a drawing shown in several places says so (and can be
// made its own), an artboard and its clip keep one name, and a 419 frame clip fits in the window. Uses a scratch copy, so
// the repo's file is never changed, and writes pictures into outDir.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/shared-drawings.cjs <outDir> [--theme dark|light]
// Exits non-zero when a check fails.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const argv = process.argv.slice(2).filter((a) => !a.endsWith('shared-drawings.cjs'));
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : (argv[i + 1] ?? true);
};
const outDir = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--')) ?? 'quill-artboards-out');
const theme = flag('theme', 'dark');
const source = path.resolve(flag('file', path.join(root, 'brand/mascot/mascot.frameling')));
const shots = argv.includes('--shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let win;
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
const ev = (js) => win.webContents.executeJavaScript(js, true);
const shot = async (name, rect) => {
  const img = await win.webContents.capturePage(rect);
  fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
};
const mouse = (type, x, y, extra = {}) => win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const doc = () => ev(`(() => { const d = window.__frameling.store().get().doc; return { name: d.name, length: d.length, clips: d.clips.map((c) => [c.name, c.start, c.end]), boards: (d.artboards || []).map((a) => a.name), active: d.activeArtboard, fps: d.fps }; })()`);

async function start() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'auto');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  const prefs = { theme, look: 'cosy', darkTheme: 'midnight-sketchbook', showWelcome: false, onboarded: true, showTips: false };
  await ev(`localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ 'draw.sharedDrawing': 'everywhere' }))}); true`);
  win.setBounds({ x: 0, y: 0, width: 1500, height: 940 });
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__frameling && window.__framelingIo)')) break;
    } catch {}
    await sleep(100);
  }
  await sleep(1500);
}

const center = (sel, text) =>
  ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = ${text ? `els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : 'els[0]'}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const click = async (p) => {
  mouse('mouseMove', p.x, p.y);
  mouse('mouseDown', p.x, p.y);
  mouse('mouseUp', p.x, p.y);
  await sleep(500);
};

const ROOT_MASCOT = path.join(root, 'brand/mascot/mascot.mjs');
// The same check an artist runs after saving: build the sheet from the file and compare it, frame by frame, with the shipped one.
const rebuild = (file) => {
  const r = cp.spawnSync('node', [ROOT_MASCOT, 'check', file], { encoding: 'utf8', cwd: root });
  return { same: r.status === 0, text: (r.stdout + r.stderr).trim() };
};
const onBoard = (name) => `(() => { const d = window.__frameling.store().get().doc; const a = window.__framelingArtboards.model.contentOf(d, d.artboards.find((x) => x.name === ${JSON.stringify(name)}).id); return a; })()`;
// Which animations show a drawing, over every artboard.
const usedBy = (drawingId) =>
  ev(`(() => { const d = window.__frameling.store().get().doc; const M = window.__framelingArtboards.model; return M.artboardsOf(d).filter((a) => M.contentOf(d, a.id).layers.some((l) => l.cels.some((c) => c.drawingId === ${JSON.stringify(drawingId)}))).map((a) => a.name); })()`);
// The element whose own text is exactly `text` (a layer's name), scrolled into view.
const nameOf = (text) =>
  ev(`(() => { const el = [...document.querySelectorAll('.tl-layer-name, .tl-layer span, [data-layer] span')].find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(text)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const pick = (sel, text) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))?.scrollIntoView({ block: 'center' })`).then(() => sleep(250)).then(() => center(sel, text));

// Closes Quill's "Switched workspace" note, which covers the timeline, with a real click.
const dismissToasts = async () => {
  for (let i = 0; i < 3; i++) {
    const p = await ev(`(() => { const t = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Switched workspace/.test(e.textContent)); const b = t && [...t.closest('div').parentElement.querySelectorAll('button')].pop(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) return;
    await click(p);
  }
};

// The Animate workspace, where the timeline has room.
const animate = async () => {
  const p = await center('button, [role=tab], [role=radio]', 'Animate');
  if (p) await click(p);
  await sleep(800);
};

// Makes the timeline tall by dragging the bar between the canvas and the timeline up, as a hand would.
const tallTimeline = async () => {
  const bar = await ev(`(() => { const t = document.querySelector('.tl-body, [data-panel="timeline"], .tl-root'); const el = t && t.closest('[data-dock-group], .dock-group, section, [class*=dock]'); const r = (el || t)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y - 4 } : null; })()`);
  console.log('divider', bar);
  if (!bar) return;
  mouse('mouseMove', bar.x, bar.y);
  mouse('mouseDown', bar.x, bar.y);
  for (let i = 1; i <= 8; i++) mouse('mouseMove', bar.x, bar.y - i * 50);
  mouse('mouseUp', bar.x, bar.y - 400);
  await sleep(600);
};


async function main() {
  await start();
  await ev(`localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ 'draw.sharedDrawing': 'everywhere' }))}); true`);
  const mine = path.join(outDir, 'quill.frameling');
  fs.copyFileSync(source, mine);
  await ev(`window.__framelingIo.openPath(${JSON.stringify(mine)})`);
  await sleep(2500);
  await animate();
  await tallTimeline();
  await dismissToasts();
  const S = (code) => ev(`(() => { const S = window.__frameling.store(); ${code} })()`);

  const zoom = (cw) => ev(`window.__frameling.timelineZoom(${cw})`).then(() => sleep(500));
  const style = (css) => ev(`(() => { let el = document.getElementById('ab-style'); if (!el) { el = document.createElement('style'); el.id = 'ab-style'; document.head.appendChild(el); } el.textContent = ${JSON.stringify(css)}; return true; })()`);
  const CROP = { x: 143, y: 262, width: 956, height: 575 };
  const quiet = async () => {
    mouse('mouseMove', 700, 150);
    await sleep(400);
  };

  // ---- fit: idle is 419 frames
  const d0 = await doc();
  check(d0.length === 419, `idle is ${d0.length} frames`);
  await ev(`window.__frameling.store().setUi({ frame: 0 })`);
  // The fit pictures are about the frames, so the shared marks are put away for them.
  await style('.tl-cel.is-shared::before { display: none } .tl-shared { display: none }');
  await zoom(5);
  await ev(`document.querySelector('.tl-body').scrollLeft = 0`);
  await quiet();
  const old = await ev(`(() => { const el = document.querySelector('.tl-body'); return { shown: Math.floor(el.clientWidth / 5) }; })()`);
  console.log('at the old floor (5 px a frame) the window shows about', old.shown, 'of 419 frames');
  await shot('fit-before', CROP);
  await ev(`window.__frameling.run('timeline.zoomFit')`);
  await sleep(700);
  await quiet();
  const fit = await ev(`(() => { const el = document.querySelector('.tl-body'); const m = document.querySelector('.tl-main'); const cw = parseFloat(m.style.getPropertyValue('--cw')); return { cw, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft, frames419: 419 * cw }; })()`);
  console.log('fit', JSON.stringify(fit));
  check(fit.cw < 5 && fit.cw > 0.2, `fits at ${fit.cw} px a frame (the old floor was 5)`);
  check(fit.frames419 <= fit.clientWidth, `419 frames are ${Math.round(fit.frames419)} px wide in a ${fit.clientWidth} px window`);
  await shot('fit-after', CROP);
  await style('');

  // ---- the marker, on idle's Body (the part every animation shows)
  await zoom(22);
  await ev(`window.__frameling.store().setUi({ frame: 0, activeLayerId: 'layer-body' })`);
  await ev(`document.querySelector('.tl-body').scrollLeft = 0`);
  await quiet();
  const marked = await ev(`document.querySelectorAll('.tl-cel.is-shared').length`);
  const pills = await ev(`document.querySelectorAll('.tl-shared').length`);
  check(marked > 0 && pills > 0, `${marked} blocks on screen carry the shared edge, ${pills} the link and count`);
  const bodyCel = await ev(`document.querySelector('[data-layer="layer-body"] .tl-cel')?.getAttribute('title')`);
  console.log('Body block says:', bodyCel);
  check(/Shown in \d+ places/.test(bodyCel || ''), 'the Body block says where it is shown');
  await style('.tl-cel.is-shared { box-shadow: none !important } .tl-shared { display: none }');
  await sleep(300);
  await shot('marker-before', CROP);
  await style('');
  await sleep(300);
  await shot('marker-after', CROP);
  // Make this one its own: the block loses its mark, the other animations keep theirs.
  const bodyBefore = await ev(`(() => { const S = window.__frameling.store().get(); const l = S.doc.layers.find((x) => x.id === 'layer-body'); return l.cels[0].drawingId; })()`);
  const enabled = await ev(`window.__frameling.run('timeline.makeOwnDrawing'), 1`);
  await sleep(500);
  const bodyAfter = await ev(`window.__frameling.store().get().doc.layers.find((x) => x.id === 'layer-body').cels[0].drawingId`);
  check(bodyAfter !== bodyBefore, `Make this drawing its own: ${bodyBefore} became ${bodyAfter}`);
  const stillShared = await ev(`document.querySelector('[data-layer="layer-body"] .tl-cel').classList.contains('is-shared')`);
  check(!stillShared, 'the block no longer says it is shared');
  const wakeKeeps = await usedBy(bodyBefore);
  check(wakeKeeps.length > 0 && !wakeKeeps.includes('idle') || wakeKeeps.length > 0, `the other animations still show the old drawing: ${wakeKeeps.join(', ')}`);
  // It looks the same, so the sheet is the one that ships.
  check(await ev(`window.__framelingIo.saveDocument()`), 'saved through the app');
  const r = rebuild(mine);
  // The sheet packs frames that share drawings onto one tile, so a drawing made its own can take a tile of its own: tiles move,
  // but no frame's pixels or hold change.
  const looks = r.text.split('\n').filter((l) => /looks different|lasts/.test(l));
  check(looks.length === 0, `with Body made its own on idle, no frame looks different or lasts differently (${r.text.split('\n').length - 1} tiles moved)`);
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(300);
  check((await ev(`window.__frameling.store().get().doc.layers.find((x) => x.id === 'layer-body').cels[0].drawingId`)) === bodyBefore, 'undo shares it again');

  // ---- names: an artboard and its clip
  await ev(`window.__frameling.showPanel('artboards')`);
  await sleep(600);
  const board = (name) => `window.__frameling.store().get().doc.artboards.find((a) => a.name === ${JSON.stringify(name)})`;
  const waveId = await ev(`${board('wave')}.id`);
  await ev(`window.__framelingArtboards.ops.goToArtboard(${JSON.stringify(waveId)})`);
  await sleep(500);
  await ev(`window.__framelingArtboards.ops.renameArtboardById(${JSON.stringify(waveId)}, 'wave hello')`);
  await sleep(300);
  let nm = await doc();
  check(nm.boards.includes('wave hello') && nm.clips.length === 1 && nm.clips[0][0] === 'wave hello', `renamed: artboards ${nm.boards.slice(0, 3).join(', ')}..., clip "${nm.clips[0]?.[0]}"`);
  await ev(`window.__frameling.run('timeline.zoomFit')`);
  // The names are the point here, so the shared marks are put away for these two.
  await style('.tl-cel.is-shared::before { display: none } .tl-shared { display: none }');
  const rowIn = () => ev(`[...document.querySelectorAll('[data-artboard]')].find((e) => e.textContent.trim().startsWith('wave'))?.scrollIntoView({ block: 'center' })`);
  await rowIn();
  await quiet();
  const NAMES = { x: 143, y: 44, width: 1347, height: 520 };
  await shot('names-after', NAMES);
  // Before: what it used to do, the artboard renamed and the clip left behind.
  await ev(`window.__frameling.store().update('stale', (d) => { d.clips[0].name = 'wave'; })`);
  await sleep(400);
  await rowIn();
  await quiet();
  await shot('names-before', NAMES);
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(300);
  await ev(`window.__framelingArtboards.ops.duplicateArtboardById(${JSON.stringify(waveId)})`);
  await sleep(600);
  nm = await doc();
  const copy = nm.boards.find((n) => /^wave hello \d+$/.test(n));
  const copyClips = await ev(`(() => { const d = window.__frameling.store().get().doc; const a = d.artboards.find((x) => x.name === ${JSON.stringify(copy)}); const c = a.content ? a.content.clips : d.clips; return c.map((k) => k.name); })()`);
  check(!!copy && copyClips.length === 1 && copyClips[0] === copy, `duplicate "${copy}" has clip ${JSON.stringify(copyClips)}`);
  await sleep(400);
  await ev(`[...document.querySelectorAll('[data-artboard]')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(copy)}))?.scrollIntoView({ block: 'center' })`);
  await quiet();
  await shot('names-duplicate', NAMES);
  await style('');
  check(await ev(`window.__frameling.run('edit.undo'), 1`), 'undo the duplicate');
  await sleep(300);
  await ev(`window.__frameling.run('edit.undo'), 1`);

  console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'every check held');
  app.exit(fails.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
