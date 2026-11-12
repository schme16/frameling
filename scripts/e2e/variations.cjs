// End-to-end check of variations in the real app: an original and two variations (a recolour, and a square cut framed
// by a camera) exported each as its own file, as the sprite sheet atlas, and all in order as one video; then the same
// file saved, opened again and exported. It drives the same exportDocument() the Export dialog's button calls, with the
// save dialogs answered by FRAMELING_AUTOMATION_DIR, then reads the outputs with ImageMagick.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/variations.cjs [outDir]
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('variations.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-var-')));
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
const sh = (cmd, args) => cp.spawnSync(cmd, args, { encoding: 'utf8' });
const files = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);

function setDir(d) {
  fs.mkdirSync(d, { recursive: true });
  process.env.FRAMELING_AUTOMATION_DIR = d;
  return d;
}

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  setDir(path.join(outDir, 'misc'));
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
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__framelingArtboards && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}


const hex = (file, x, y) => {
  const r = sh('convert', [file + '[0]', '-format', `%[hex:p{${x},${y}}]`, 'info:']);
  return (r.stdout || '').slice(0, 6).toUpperCase();
};
const size = (file) => {
  const r = sh('identify', ['-format', '%w x %h\n', file]);
  return (r.stdout || '').split('\n')[0];
};
const settings = async (patch) => ({ ...(await ev('window.__framelingExport.defaults()')), ...patch });
const run = (s) => ev(`window.__framelingExport.run(${JSON.stringify(s)})`);
const setChoice = (id, v) => ev(`window.__framelingArtboards.setChoice(${JSON.stringify(id)}, ${JSON.stringify(v)})`);
const names = (dir) => files(dir).join(', ');

async function section() {
  await ev(`window.__framelingArtboards.load('variations')`);
  await sleep(500);
  await setChoice('artboards.exportAs', 'folder');
  // Ids of the three artboards, in order: Ball, Orange ball, Square cut.
  const ids = JSON.parse(await ev(`JSON.stringify(window.__frameling.store().get().doc.artboards.map((a) => a.id))`));
  check(ids.length === 3, `expected 3 artboards, got ${ids.length}`);

  begin('each as its own file: the original and its two variations');
  let dir = setDir(path.join(outDir, 'each'));
  await ev(`window.__framelingArtboards.setExport({ mode: 'each', ids: null })`);
  let res = await run(await settings({ format: 'png', range: 'frame' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(names(dir) === 'Ball-frame-1.png, Orange ball-frame-1.png, Square cut-frame-1.png', `files: ${names(dir)}`);
  const f = (n) => path.join(dir, n);
  if (files(dir).length === 3) {
    check(size(f('Ball-frame-1.png')) === '320 x 180', `Ball is ${size(f('Ball-frame-1.png'))}`);
    check(size(f('Orange ball-frame-1.png')) === '320 x 180', `Orange ball is ${size(f('Orange ball-frame-1.png'))}`);
    check(size(f('Square cut-frame-1.png')) === '180 x 180', `Square cut is ${size(f('Square cut-frame-1.png'))}`);
    // Frame 1: the ball is at x 40, y about 115. Pink in the original, orange in the recolour.
    check(hex(f('Ball-frame-1.png'), 40, 115) === 'FF6F91', `Ball ball is ${hex(f('Ball-frame-1.png'), 40, 115)}`);
    check(hex(f('Orange ball-frame-1.png'), 40, 115) === 'FF9E1F', `Orange ball is ${hex(f('Orange ball-frame-1.png'), 40, 115)}`);
    // The square cut frames the middle of the original (x 70 to 250), so the ball at x 40 is cropped away: sky there, ground low.
    check(hex(f('Square cut-frame-1.png'), 90, 40) === '5AB8FF', `Square cut sky is ${hex(f('Square cut-frame-1.png'), 90, 40)}`);
    check(hex(f('Square cut-frame-1.png'), 90, 170) === '6ABF4B', `Square cut ground is ${hex(f('Square cut-frame-1.png'), 90, 170)}`);
  }

  begin('the atlas has the three as animations, and all in order is one video');
  dir = setDir(path.join(outDir, 'atlas'));
  await ev(`window.__framelingArtboards.setExport({ mode: 'atlas', ids: null })`);
  res = await run(await settings({ format: 'sheet' }));
  check(res.outcome === 'done', `atlas did not finish: ${JSON.stringify(res)}`);
  if (files(dir).includes('Ball-atlas.json')) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'Ball-atlas.json'), 'utf8'));
    const a = Object.keys(json.animations ?? {});
    check(['Ball', 'Orange ball', 'Square cut'].every((n) => a.includes(n)), `animations ${a}`);
  } else check(false, `atlas files: ${names(dir)}`);
  dir = setDir(path.join(outDir, 'joined'));
  await ev(`window.__framelingArtboards.setExport({ mode: 'joined', ids: null })`);
  res = await run(await settings({ format: 'mp4' }));
  check(res.outcome === 'done', `joined did not finish: ${JSON.stringify(res)}`);
  check(files(dir).length === 1 && fs.statSync(path.join(dir, files(dir)[0])).size > 1000, `joined files: ${names(dir)}`);
  if (files(dir).length === 1) {
    const r = sh('ffprobe', ['-v', 'error', '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', path.join(dir, files(dir)[0])]);
    check(Number((r.stdout || '').trim()) === 72, `joined film has ${(r.stdout || '').trim()} frames, expected 72`);
  }

  begin('saved, opened again and exported: the variations are still linked and still resolve');
  const round = await ev(`(async () => {
    const A = window.__framelingArtboards;
    const bytes = A.saveBytes();
    A.openBytes(bytes);
    const d = window.__frameling.store().get().doc;
    return JSON.stringify({ n: d.artboards.length, linked: d.artboards.filter((a) => a.variationOf).length, size: bytes.length });
  })()`);
  const info = JSON.parse(round);
  check(info.n === 3 && info.linked === 2, `after reopening: ${round}`);
  dir = setDir(path.join(outDir, 'each-again'));
  await ev(`window.__framelingArtboards.setExport({ mode: 'each', ids: null })`);
  res = await run(await settings({ format: 'png', range: 'frame' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(hex(path.join(dir, 'Orange ball-frame-1.png'), 40, 115) === 'FF9E1F', 'the recolour did not survive saving');
  await setChoice('artboards.exportAs', undefined);
}

function report() {
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}${r.notes.length ? `  (${r.notes.join(' | ')})` : ''}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed. Output: ${outDir}`);
  return bad.length === 0;
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 10 * 60 * 1000);
  try {
    await startApp();
    await section();
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
