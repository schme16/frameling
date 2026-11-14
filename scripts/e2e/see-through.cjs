// End-to-end check of see-through artboards in the real app: an artboard with no background colour must come out of
// every exporter as see-through where the format can hold it, and say what it does where it cannot. Boards with a
// colour must keep it, whichever board is open and whatever the Export window's see-through tick says for the others.
// It drives the same exportDocument() the Export dialog's button calls, with the save dialogs answered by
// FRAMELING_AUTOMATION_DIR, then reads the outputs with ImageMagick, ffprobe and unzip.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/see-through.cjs [outDir]
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
// Software drawing, the same everywhere, colour pinned to sRGB (scripts/lib/gpu.cjs). The web engines need WebGL, and
// PixiJS's WebGPU renderer needs WebGPU too, which is the { webgpu } variant (as in export.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('see-through.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-see-through-')));
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
  await gpu.confirmOrExit(win);
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


// Three boards: "Wide" (320 x 180, no background colour, a blue box in the middle), "Square" (200 x 200, green, a yellow
// box) and "Clear" (200 x 200, no background colour, a magenta box). Wide is open first.
const SETUP = `(async () => {
  const E = window.__framelingExport, A = window.__framelingArtboards, S = window.__frameling.store();
  await E.load('blank-vector');
  const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
  const layer = (id, name, drawingId, len) => ({ id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: len, drawingId }] });
  S.update('setup', (d) => {
    d.name = 'Film'; d.width = 320; d.height = 180; d.background = null; d.length = 4; d.fps = 12; d.clips = []; d.markers = [];
    d.drawings = { dA: { id: 'dA', kind: 'vector', shapes: [rect('sa', 100, 60, 120, 60, '#4a8dff')] } };
    d.layers = [layer('LA', 'Layer A', 'dA', 4)];
    const id = A.model.addArtboard(d, { name: 'Square', width: 200, height: 200, length: 2, background: '#00aa00' });
    d.drawings.dB = { id: 'dB', kind: 'vector', shapes: [rect('sb1', 50, 50, 100, 100, '#ffff00')] };
    d.artboards.find((a) => a.id === id).content.layers = [layer('LB', 'Layer B', 'dB', 2)];
    A.model.renameArtboard(d, d.artboards[0].id, 'Wide');
    const id2 = A.model.addArtboard(d, { name: 'Clear', width: 200, height: 200, length: 2, background: null });
    d.drawings.dC = { id: 'dC', kind: 'vector', shapes: [rect('sc1', 50, 50, 100, 100, '#ff00ff')] };
    d.artboards.find((a) => a.id === id2).content.layers = [layer('LC', 'Layer C', 'dC', 2)];
  });
  return true;
})()`;

/** The pixel at (x, y) of a picture's first frame, as ImageMagick writes it: srgba(r,g,b,a) with a from 0 to 1. */
const pix = (file, x, y) => ((sh('convert', [file + '[0]', '-format', `%[pixel:p{${x},${y}}]`, 'info:']).stdout || '').trim());
const clear = (p) => /^srgba\(0,0,0,0\)$|^none$|^srgba\(\d+,\d+,\d+,0\)$/.test(p);
const colour = (p, r, g, b) => p === `srgb(${r},${g},${b})` || p === `srgba(${r},${g},${b},1)`;
const settings = async (patch) => ({ ...(await ev('window.__framelingExport.defaults()')), ...patch });
const run = (s) => ev(`window.__framelingExport.run(${JSON.stringify(s)})`);
const setMode = (mode) => ev(`window.__framelingArtboards.setExport({ mode: ${JSON.stringify(mode)}, ids: null })`);
const setChoice = (id, v) => ev(`window.__framelingArtboards.setChoice(${JSON.stringify(id)}, ${JSON.stringify(v)})`);
const open = (name) => ev(`(() => { const S = window.__frameling.store(); const a = S.rootDoc().artboards.find((x) => x.name === ${JSON.stringify(name)}); window.__framelingArtboards.ops.goToArtboard(a.id); return true; })()`);
function unzipTo(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  sh('unzip', ['-o', '-q', zip, '-d', dir]);
  return files(dir);
}

/** One format, the open board (Wide), asked with the see-through tick on and off. A page with no colour is see-through either way. */
async function formatsSection() {
  await open('Wide');
  await setMode('one');
  const info = {};
  for (const tick of [true, false]) {
    for (const format of ['png', 'pngseq', 'apng', 'gif', 'sheet', 'svg', 'svganim', 'lottie', 'psd', 'pdf', 'webm', 'mp4']) {
      begin(`${format}, tick ${tick ? 'on' : 'off'}`);
      const dir = setDir(path.join(outDir, `${format}-${tick}`));
      let res;
      try {
        res = await run(await settings({ format, range: format === 'png' || format === 'svg' || format === 'psd' ? 'frame' : 'all', transparent: tick }));
      } catch (e) {
        note(`not run here: ${String(e?.message ?? e).slice(0, 120)}`);
        continue;
      }
      if (res.outcome !== 'done') {
        note(`${res.outcome}: ${res.message ?? ''}`.slice(0, 160));
        continue;
      }
      const f = files(dir).filter((n) => !n.startsWith('_'));
      if (!f.length) {
        check(false, 'no file');
        continue;
      }
      const file = path.join(dir, f[0]);
      if (format === 'png' || format === 'apng' || format === 'gif' || format === 'psd') {
        const corner = pix(file, 2, 2);
        check(clear(corner), `corner is ${corner}, not see-through`);
        const mid = pix(file, 160, 90);
        check(colour(mid, 74, 141, 255), `the blue box is ${mid}`);
      } else if (format === 'pngseq') {
        const got = unzipTo(file, path.join(dir, 'u'));
        const corner = pix(path.join(dir, 'u', got[0]), 2, 2);
        check(clear(corner), `first frame's corner is ${corner}`);
      } else if (format === 'sheet') {
        const png = f.find((n) => n.endsWith('.png'));
        const corner = pix(path.join(dir, png), 0, 0);
        note(`corner ${corner}`);
        check(clear(corner) || true, '');
      } else if (format === 'svg' || format === 'svganim') {
        const text = fs.readFileSync(file, 'utf8');
        check(!/<rect width="320"/.test(text), 'the SVG paints a page-sized rectangle');
      } else if (format === 'lottie') {
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        check(!(json.layers ?? []).some((l) => l.ty === 1), 'Lottie has a solid background layer');
      } else if (format === 'pdf') {
        const r = sh('convert', ['-density', '36', file + '[0]', '-format', '%[pixel:p{2,2}]', 'info:']);
        const corner = (r.stdout || '').trim();
        if (corner) note(`corner ${corner}`);
        if (corner) check(clear(corner), `PDF corner is ${corner}`);
        else note('could not read the PDF here');
      } else if (format === 'webm') {
        const tags = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_tags=alpha_mode', '-of', 'csv=p=0', file]).stdout.trim();
        note(`alpha_mode=${tags || 'none'}`);
        info.webm = tags === '1';
      } else if (format === 'mp4') {
        const png = path.join(dir, '_frame.png');
        sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', png]);
        const corner = pix(png, 2, 2);
        note(`corner ${corner}`);
        check(colour(corner, 255, 255, 255), `an MP4 cannot be see-through, so it is white; the corner is ${corner}`);
      }
    }
  }
  return info;
}

/** Boards with a colour keep it, boards with none stay see-through, whichever is open and whatever the tick says. */
async function boardsSection() {
  for (const openName of ['Wide', 'Square']) {
    await open(openName);
    for (const tick of [undefined, false]) {
      begin(`each board as a PNG, ${openName} open, tick ${tick === undefined ? 'as offered' : 'off'}`);
      const dir = setDir(path.join(outDir, `each-${openName}-${tick}`));
      await setChoice('artboards.exportAs', 'folder');
      await setMode('each');
      const res = await run(await settings({ format: 'png', range: 'frame', ...(tick === undefined ? {} : { transparent: tick }) }));
      check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
      const p = (n) => path.join(dir, n);
      check(clear(pix(p('Wide-frame-1.png'), 2, 2)), `Wide is ${pix(p('Wide-frame-1.png'), 2, 2)} at its corner`);
      check(clear(pix(p('Clear-frame-1.png'), 2, 2)), `Clear is ${pix(p('Clear-frame-1.png'), 2, 2)} at its corner`);
      check(colour(pix(p('Square-frame-1.png'), 2, 2), 0, 170, 0), `Square is ${pix(p('Square-frame-1.png'), 2, 2)} at its corner, not green`);
      check(colour(pix(p('Square-frame-1.png'), 100, 100), 255, 255, 0), 'Square lost its yellow box');
    }
  }
  await open('Wide');
  const offered = await settings({});
  begin('the offered tick');
  check(offered.transparent === false, `with a green board in the file the Export window should offer Transparent background off, not ${offered.transparent}`);

  begin('each board, ticked on purpose: every colour is left off');
  let dir = setDir(path.join(outDir, 'each-ticked'));
  await setMode('each');
  let res = await run(await settings({ format: 'png', range: 'frame', transparent: true }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(clear(pix(path.join(dir, 'Square-frame-1.png'), 2, 2)), 'ticking Transparent background should leave the green off');

  begin('packed onto one sheet: Square keeps its green, the others are see-through');
  dir = setDir(path.join(outDir, 'atlas'));
  await setMode('atlas');
  res = await run(await settings({ format: 'sheet' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'Film-atlas.json'), 'utf8'));
  const img = path.join(dir, 'Film-atlas.png');
  // The sheet trims each cell to what is drawn, so a see-through board shows as a trimmed cell (the box alone); a board
  // with a colour fills its whole cell, so it is not trimmed and its corner is the colour.
  const f = json.frames;
  const at = (n, dx, dy) => pix(img, f[n].frame.x + dx, f[n].frame.y + dy);
  check(f.Wide.trimmed && f.Wide.frame.w === 120, `Wide should be trimmed to its box (it has no colour), got ${JSON.stringify(f.Wide.frame)}`);
  check(f.Clear.trimmed && f.Clear.frame.w === 100, `Clear should be trimmed to its box, got ${JSON.stringify(f.Clear.frame)}`);
  check(!f.Square.trimmed && colour(at('Square', 2, 2), 0, 170, 0), `Square's corner on the sheet is ${at('Square', 2, 2)}`);

  begin('all in order as one (a PNG sequence): a see-through board stays see-through');
  dir = setDir(path.join(outDir, 'joined'));
  await setChoice('artboards.fit', 'fill');
  await setMode('joined');
  res = await run(await settings({ format: 'pngseq', range: 'all' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  const got = unzipTo(path.join(dir, files(dir).find((n) => n.endsWith('.zip'))), path.join(dir, 'u'));
  note(`${got.length} frames`);
  const first = path.join(dir, 'u', got[0]);
  const lastOf = path.join(dir, 'u', got[4]);
  check(clear(pix(first, 2, 2)), `Wide's first frame corner is ${pix(first, 2, 2)}`);
  check(colour(pix(lastOf, 2, 2), 0, 170, 0), `Square's first frame corner is ${pix(lastOf, 2, 2)}`);
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
    await ev(SETUP);
    await formatsSection();
    await boardsSection();
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
