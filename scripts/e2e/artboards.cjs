// End-to-end check of artboards in the real app: every way of exporting two artboards of different sizes (this one,
// each into a folder, each into a zip, the sprite sheet atlas, all in order as one with Fit and with Fill), and the
// timeline following the artboard you click into. It drives the same exportDocument() the Export dialog's button
// calls, with the save dialogs answered by FRAMELING_AUTOMATION_DIR, then reads the outputs with ImageMagick and unzip.
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/artboards.cjs [outDir]
//
// Also: boards as frames of one sprite exported as a sprite sheet for every engine (one animation, a frame per board,
// in order). GODOT_BIN=/path/to/godot-4-editor also loads it in Godot, WEB_ENGINES=1 in the real Phaser, PixiJS and
// CSS (see docs/testing.md), and --only=frames-sheet runs just this part.
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const WEB = process.env.WEB_ENGINES === '1';
// Phaser needs a WebGL context, so the web engines run on software GL (as in export.cjs).
if (WEB) for (const sw of [['ignore-gpu-blocklist'], ['use-gl', 'angle'], ['use-angle', 'swiftshader'], ['enable-unsafe-swiftshader']]) app.commandLine.appendSwitch(...sw);
const argv = process.argv.slice(2).filter((a) => !a.endsWith('artboards.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ab-')));
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

// A 320 x 180 "Wide" shot (red stage, a white box) and a 200 x 200 "Square" shot (green stage, a yellow box, and a
// blue bar that hangs off the right edge of the stage).
const SETUP = `(async () => {
  const E = window.__framelingExport, A = window.__framelingArtboards, S = window.__frameling.store();
  await E.load('blank-vector');
  const rect = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1 });
  const layer = (id, name, drawingId, len) => ({ id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: len, drawingId }] });
  S.update('setup', (d) => {
    d.name = 'Film'; d.width = 320; d.height = 180; d.background = '#ff0000'; d.length = 4; d.fps = 12; d.clips = []; d.markers = [];
    d.drawings = { dA: { id: 'dA', kind: 'vector', shapes: [rect('sa', 100, 60, 120, 60, '#ffffff')] } };
    d.layers = [layer('LA', 'Layer A', 'dA', 4)];
    const id = A.model.addArtboard(d, { name: 'Square', width: 200, height: 200, length: 2, background: '#00aa00' });
    d.drawings.dB = { id: 'dB', kind: 'vector', shapes: [rect('sb1', 50, 50, 100, 100, '#ffff00'), rect('sb2', 190, 0, 70, 200, '#0000ff')] };
    d.artboards.find((a) => a.id === id).content.layers = [layer('LB', 'Layer B', 'dB', 2)];
    A.model.renameArtboard(d, d.artboards[0].id, 'Wide');
  });
  return true;
})()`;

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
const setMode = (mode) => ev(`window.__framelingArtboards.setExport({ mode: ${JSON.stringify(mode)}, ids: null })`);
const setChoice = (id, v) => ev(`window.__framelingArtboards.setChoice(${JSON.stringify(id)}, ${JSON.stringify(v)})`);

function unzipTo(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  sh('unzip', ['-o', '-q', zip, '-d', dir]);
  return files(dir);
}

async function exportsSection() {
  await ev(SETUP);

  begin('this artboard');
  let dir = setDir(path.join(outDir, 'one'));
  await setMode('one');
  let res = await run(await settings({ format: 'png', range: 'frame' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(files(dir).length === 1, `expected one file, got ${files(dir)}`);

  begin('each, into a folder');
  dir = setDir(path.join(outDir, 'each-folder'));
  await setChoice('artboards.exportAs', 'folder');
  await setMode('each');
  res = await run(await settings({ format: 'png', range: 'frame' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(JSON.stringify(files(dir)) === JSON.stringify(['Square-frame-1.png', 'Wide-frame-1.png']), `files: ${files(dir)}`);
  if (files(dir).length === 2) {
    check(size(path.join(dir, 'Wide-frame-1.png')) === '320 x 180', `Wide is ${size(path.join(dir, 'Wide-frame-1.png'))}`);
    check(size(path.join(dir, 'Square-frame-1.png')) === '200 x 200', `Square is ${size(path.join(dir, 'Square-frame-1.png'))}`);
    check(hex(path.join(dir, 'Wide-frame-1.png'), 160, 90) === 'FFFFFF', 'Wide: the white box is missing');
    check(hex(path.join(dir, 'Wide-frame-1.png'), 5, 5) === 'FF0000', 'Wide: the red stage is missing');
    check(hex(path.join(dir, 'Square-frame-1.png'), 100, 100) === 'FFFF00', 'Square: the yellow box is missing');
    check(hex(path.join(dir, 'Square-frame-1.png'), 195, 100) === '0000FF', 'Square: the blue bar is missing');
  }

  begin('each, into one zip');
  dir = setDir(path.join(outDir, 'each-zip'));
  await setChoice('artboards.exportAs', 'zip');
  res = await run(await settings({ format: 'png', range: 'frame' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(JSON.stringify(files(dir)) === JSON.stringify(['Film-artboards.zip']), `files: ${files(dir)}`);
  if (files(dir).length === 1) {
    const got = unzipTo(path.join(dir, 'Film-artboards.zip'), path.join(dir, 'unzipped'));
    check(JSON.stringify(got) === JSON.stringify(['Square-frame-1.png', 'Wide-frame-1.png']), `zip holds ${got}`);
    check(size(path.join(dir, 'unzipped', 'Square-frame-1.png')) === '200 x 200', 'Square in the zip is the wrong size');
    check(hex(path.join(dir, 'unzipped', 'Wide-frame-1.png'), 160, 90) === 'FFFFFF', 'Wide in the zip is wrong');
  }
  await setChoice('artboards.exportAs', undefined);

  begin('each, every frame (PNG sequence) with ticked artboards only');
  dir = setDir(path.join(outDir, 'each-seq'));
  await setChoice('artboards.exportAs', 'folder');
  await ev(`window.__framelingArtboards.setExport({ mode: 'each', ids: [window.__frameling.store().get().doc.artboards[1].id] })`);
  res = await run(await settings({ format: 'pngseq', range: 'all' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(JSON.stringify(files(dir)) === JSON.stringify(['Square.zip']), `files: ${files(dir)}`);
  if (files(dir).length === 1) check(unzipTo(path.join(dir, 'Square.zip'), path.join(dir, 'u')).length === 2, 'Square has 2 frames');
  await setChoice('artboards.exportAs', undefined);

  begin('packed onto one sheet (atlas)');
  dir = setDir(path.join(outDir, 'atlas'));
  await setMode('atlas');
  res = await run(await settings({ format: 'sheet' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(JSON.stringify(files(dir)) === JSON.stringify(['Film-atlas.json', 'Film-atlas.png']), `files: ${files(dir)}`);
  if (files(dir).length === 2) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'Film-atlas.json'), 'utf8'));
    const names = Object.keys(json.frames);
    note(`frames: ${names.join(', ')}`);
    check(names.includes('Wide') && names.includes('Square'), `atlas frames ${names}`);
    check(json.animations?.Wide?.frames.length === 4 && json.animations?.Square?.frames.length === 2, `animations ${JSON.stringify(json.animations)}`);
    const img = path.join(dir, 'Film-atlas.png');
    const center = (n) => {
      const f = json.frames[n].frame;
      return hex(img, f.x + Math.floor(f.w / 2), f.y + Math.floor(f.h / 2));
    };
    check(center('Wide') === 'FFFFFF', `Wide's picture on the sheet is ${center('Wide')}`);
    check(center('Square') === 'FFFF00', `Square's picture on the sheet is ${center('Square')}`);
  }

  for (const fit of ['bars', 'fill']) {
    begin(`all in order, as one (${fit}), PNG sequence`);
    dir = setDir(path.join(outDir, `joined-${fit}`));
    await setChoice('artboards.fit', fit);
    await setMode('joined');
    res = await run(await settings({ format: 'pngseq', range: 'all' }));
    check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
    check(JSON.stringify(files(dir)) === JSON.stringify(['Film.zip']), `files: ${files(dir)}`);
    if (files(dir).length !== 1) continue;
    const frames = unzipTo(path.join(dir, 'Film.zip'), path.join(dir, 'u'));
    check(frames.length === 6, `expected 6 frames, got ${frames.length}`);
    if (frames.length !== 6) continue;
    const f = (i) => path.join(dir, 'u', frames[i]);
    check(size(f(0)) === '320 x 180' && size(f(5)) === '320 x 180', `frame sizes ${size(f(0))}, ${size(f(5))}`);
    check(hex(f(0), 160, 90) === 'FFFFFF' && hex(f(0), 5, 5) === 'FF0000', 'shot 1 is not as drawn');
    if (fit === 'bars') {
      // 200 x 200 fits 320 x 180 at 0.9, 180 wide, with 70 px bars each side.
      check(hex(f(4), 160, 90) === 'FFFF00', 'bars: the yellow box is not centred');
      check(hex(f(4), 10, 90) === 'FF0000' && hex(f(4), 310, 90) === 'FF0000', `bars: the sides should be the picture's red, they are ${hex(f(4), 10, 90)} and ${hex(f(4), 310, 90)}`);
      check(hex(f(4), 245, 90) === '0000FF', 'bars: the blue bar on the stage is missing');
      check(hex(f(4), 270, 90) === 'FF0000', `bars: what hangs off the stage shows in the bar (${hex(f(4), 270, 90)})`);
    } else {
      check(hex(f(4), 160, 90) === 'FFFF00', 'fill: the yellow box is not centred');
      check(hex(f(4), 10, 90) !== '00AA00' || hex(f(4), 10, 10) === '00AA00', 'fill: the shot does not cover the picture');
      check(hex(f(4), 310, 90) === '0000FF', `fill: the blue bar should show at the right (${hex(f(4), 310, 90)})`);
    }
  }
  await setChoice('artboards.fit', undefined);

  begin('all in order, as one, GIF');
  dir = setDir(path.join(outDir, 'joined-gif'));
  await setMode('joined');
  res = await run(await settings({ format: 'gif', range: 'all' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  if (files(dir).length === 1) {
    const r = sh('identify', ['-format', '%w x %h\n', path.join(dir, files(dir)[0])]);
    const lines = r.stdout.trim().split('\n');
    check(lines.length === 6 && lines.every((l) => l === '320 x 180'), `gif frames ${lines.join(' | ')}`);
  } else check(false, `files: ${files(dir)}`);
}

async function videoSection() {
  await ev(SETUP);
  const probe = (f) => {
    const r = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', f]);
    return r.stdout.trim();
  };
  begin('each as MP4 (sizes kept, even-sized)');
  let dir = setDir(path.join(outDir, 'each-mp4'));
  await setChoice('artboards.exportAs', 'folder');
  await setMode('each');
  let res = await run(await settings({ format: 'mp4', range: 'all' }));
  check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
  check(JSON.stringify(files(dir)) === JSON.stringify(['Square.mp4', 'Wide.mp4']), `files: ${files(dir)}`);
  if (files(dir).length === 2) {
    check(probe(path.join(dir, 'Wide.mp4')) === '320,180,4', `Wide: ${probe(path.join(dir, 'Wide.mp4'))}`);
    check(probe(path.join(dir, 'Square.mp4')) === '200,200,2', `Square: ${probe(path.join(dir, 'Square.mp4'))}`);
  }
  await setChoice('artboards.exportAs', undefined);

  for (const [fmt, ext] of [['mp4', 'mp4'], ['webm', 'webm']]) {
    begin(`all in order, as one, ${fmt.toUpperCase()}`);
    dir = setDir(path.join(outDir, `joined-${fmt}`));
    await setMode('joined');
    res = await run(await settings({ format: fmt, range: 'all' }));
    check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
    check(JSON.stringify(files(dir)) === JSON.stringify([`Film.${ext}`]), `files: ${files(dir)}`);
    if (files(dir).length === 1) check(probe(path.join(dir, `Film.${ext}`)) === '320,180,6', `${probe(path.join(dir, `Film.${ext}`))}`);
  }
}

// ---------------------------------------------------------------- the timeline follows the artboard you click into

async function followSection() {
  await ev(SETUP);
  // The welcome sheet covers the canvas on a fresh profile.
  await ev(`window.__frameling.overlays.closeSheet()`);
  await sleep(300);
  await ev(`window.__framelingArtboards.ops.fitAllArtboards()`);
  await sleep(300);
  if (process.env.AB_SHOT) fs.writeFileSync(path.join(outDir, 'follow.png'), (await win.webContents.capturePage()).toPNG());
  const state = () => ev(`(() => { const s = window.__frameling.store().get(); const d = s.doc; const A = window.__framelingArtboards.model;
    return { open: A.activeArtboard(d).name, length: d.length, layers: d.layers.map((l) => l.name), timeline: (document.querySelector('.tl-root')?.innerText ?? '') }; })()`);
  // Where the middle of an artboard (or its name) is on screen.
  const where = (name, labelOnly) => ev(`(() => { const s = window.__frameling.store().get(); const d = s.doc; const A = window.__framelingArtboards.model;
    const act = A.activeArtboard(d); const b = A.boxes(d)[A.artboardsOf(d).findIndex((a) => a.name === ${JSON.stringify(name)})];
    const r = document.querySelector('.cv-root').getBoundingClientRect(); const u = s.ui;
    const sx = r.left + u.panX + (b.x - act.x) * u.zoom, sy = r.top + u.panY + (b.y - act.y) * u.zoom;
    return ${labelOnly ? '{ x: Math.round(sx + 12), y: Math.round(sy - 8) }' : '{ x: Math.round(sx + b.w * u.zoom / 2), y: Math.round(sy + b.h * u.zoom / 2) }'}; })()`);
  const click = async (p) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(40);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(300);
  };
  const tool = (id) => ev(`window.__frameling.store().setUi({ tool: ${JSON.stringify(id)} })`);

  for (const t of ['select', 'brush']) {
    begin(`clicking another artboard with ${t} shows its timeline`);
    await ev(`window.__framelingArtboards.ops.goToArtboard(window.__frameling.store().get().doc.artboards[0].id)`);
    await sleep(200);
    await tool(t);
    let s = await state();
    check(s.open === 'Wide' && s.length === 4 && s.timeline.includes('Layer A'), `start: ${JSON.stringify({ ...s, timeline: s.timeline.slice(0, 60) })}`);
    const at = await where('Square');
    await click(at);
    s = await state();
    note(`clicked ${at.x},${at.y}`);
    check(s.open === 'Square', `the open artboard is ${s.open}`);
    check(s.length === 2 && s.layers[0] === 'Layer B', `the stage shows ${s.layers} of length ${s.length}`);
    check(s.timeline.includes('Layer B') && !s.timeline.includes('Layer A'), 'the timeline panel still shows the first artboard');
  }

  begin('clicking an artboard name opens it');
  await ev(`window.__framelingArtboards.ops.goToArtboard(window.__frameling.store().get().doc.artboards[0].id)`);
  await sleep(200);
  await tool('select');
  await click(await where('Square', true));
  const s = await state();
  check(s.open === 'Square', `the open artboard is ${s.open}`);
  check(s.timeline.includes('Layer B'), 'the timeline panel did not follow');

  begin('undo goes back to the artboard before, timeline included');
  await ev(`window.__frameling.run('edit.undo')`);
  await sleep(300);
  const u = await state();
  check(u.open === 'Wide' && u.timeline.includes('Layer A'), `after undo: ${u.open}`);
}


// ---------------------------------------------------------------- boards as frames of one sprite, as a sprite sheet

const GODOT = process.env.GODOT_BIN;
const FRAMES = 4;
// Slow, so the engines' own timing checks (a pass of the loop in the right time) have room for start-up jitter.
const FPS = 2;
/** The colour of board i, as hex and as bytes: a different one each so a wrong order shows. */
const boardRgb = (i) => [40 * (i + 1), 10, 255 - 40 * i];
const boardHex = (i) => boardRgb(i).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// A 32 x 32 sprite (8 stage pixels per art pixel) as four boards, Frame 1 to 4, each one frame of one solid colour.
const FRAMES_SETUP = `(async () => {
  const E = window.__framelingExport, A = window.__framelingArtboards, S = window.__frameling.store();
  await E.load('blank-pixel');
  const rgb = (i) => [40 * (i + 1), 10, 255 - 40 * i];
  const drawing = (id, i) => { const px = new Uint8ClampedArray(32 * 32 * 4); for (let p = 0; p < 32 * 32; p++) px.set([...rgb(i), 255], p * 4); return { id, kind: 'pixel', width: 32, height: 32, pixels: px }; };
  const layer = (id, drawingId) => ({ id, name: 'Layer', kind: 'pixel', pixelSize: 8, visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: 1, drawingId }] });
  S.update('setup', (d) => {
    d.name = 'Hero'; d.width = 256; d.height = 256; d.background = null; d.length = 1; d.fps = ${FPS}; d.clips = []; d.markers = [];
    d.drawings = { d0: drawing('d0', 0) };
    d.layers = [layer('L0', 'd0')];
    for (let i = 1; i < ${FRAMES}; i++) {
      const id = A.model.addArtboard(d, { name: 'Frame ' + (i + 1), width: 256, height: 256, length: 1, background: null });
      d.drawings['d' + i] = drawing('d' + i, i);
      d.artboards.find((a) => a.id === id).content.layers = [layer('L' + i, 'd' + i)];
    }
    A.model.renameArtboard(d, d.artboards[0].id, 'Frame 1');
  });
  return true;
})()`;

/** Reads each engine's own files back to where every frame of every animation sits on the sheet. */
function readFramesBack(engine, dir, names) {
  const j = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  const base = names.find((n) => n.endsWith('.png')).replace(/\.png$/, '');
  const out = {};
  const box = (f) => ({ x: f.x, y: f.y, w: f.w, h: f.h });
  if (engine === 'json') {
    const a = j(`${base}.json`);
    for (const [k, v] of Object.entries(a.animations)) out[k] = v.frames.map((i) => box(a.frames[i].frame));
  } else if (engine === 'phaser') {
    const atlas = j(`${base}.json`).frames;
    for (const a of j(`${base}-anims.json`).anims) out[a.key] = a.frames.map((f) => box(atlas[f.frame].frame));
  } else if (engine === 'pixi') {
    const a = j(`${base}.json`);
    for (const [k, list] of Object.entries(a.animations)) out[k] = list.map((n) => box(a.frames[n].frame));
  } else if (engine === 'unity') {
    const a = j(`${base}.json`);
    const by = new Map(a.frames.map((f) => [f.name, f]));
    for (const an of a.animations) out[an.name] = an.frames.map((n) => box({ ...by.get(n), y: a.height - by.get(n).y - by.get(n).h }));
  } else if (engine === 'godot') {
    const t = fs.readFileSync(path.join(dir, `${base}.tres`), 'utf8');
    const regions = new Map([...t.matchAll(/\[sub_resource type="AtlasTexture" id="([^"]+)"\]\s+atlas = [^\n]+\s+region = Rect2\((\d+), (\d+), (\d+), (\d+)\)/g)].map((m) => [m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] }]));
    for (const m of t.matchAll(/"frames": \[(.*?)\],\s+"loop": (true|false),\s+"name": &"([^"]+)"/gs)) out[m[3]] = [...m[1].matchAll(/SubResource\("([^"]+)"\)/g)].map((r) => regions.get(r[1]));
  } else if (engine === 'css') {
    const css = fs.readFileSync(path.join(dir, `${base}.css`), 'utf8');
    const w = +/width: (\d+)px/.exec(css)[1];
    const h = +/height: (\d+)px/.exec(css)[1];
    for (const k of css.matchAll(/@keyframes ([\w-]+) \{(.*?)\n\}/gs)) {
      const steps = [...k[2].matchAll(/(\d+)% \{ background-position: ([^;]+); \}/g)].filter((m) => m[1] !== '100');
      out[k[1].replace(new RegExp(`^${base}-`), '')] = steps.map((m) => {
        const [x, y] = m[2].trim().split(/\s+/).map((v) => Math.abs(parseInt(v, 10)));
        return { x, y, w, h };
      });
    }
  }
  return out;
}

/** Loads the files in a real Godot 4: one animation, a frame per board, each showing that board's colour. */
function godotFrames(dir, names) {
  const proj = path.join(dir, '_godot');
  fs.rmSync(proj, { recursive: true, force: true });
  fs.mkdirSync(path.join(proj, 'sprites'), { recursive: true });
  for (const n of names) fs.copyFileSync(path.join(dir, n), path.join(proj, 'sprites', n));
  const base = names.find((n) => n.endsWith('.png')).replace(/\.png$/, '');
  fs.writeFileSync(path.join(proj, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="boards"\n');
  fs.writeFileSync(
    path.join(proj, 'check.gd'),
    `extends SceneTree
func _init():
	var node = (load("res://sprites/${base}.tscn") as PackedScene).instantiate()
	var sf: SpriteFrames = node.sprite_frames
	var out := ["names:%s" % ",".join(sf.get_animation_names()), "start:%s" % node.animation]
	for i in sf.get_frame_count("default"):
		var c: Color = sf.get_frame_texture("default", i).get_image().get_pixel(1, 1)
		out.append("f%d:%d,%d,%d" % [i, round(c.r * 255), round(c.g * 255), round(c.b * 255)])
	print("RESULT " + ";".join(out))
	quit()
`,
  );
  sh(GODOT, ['--headless', '--path', proj, '--import']);
  const r = sh(GODOT, ['--headless', '--path', proj, '--script', 'check.gd']);
  return (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT ')) ?? `(no result) ${(r.stderr || '').slice(0, 200)}`;
}

async function framesSheetSection() {
  await ev(FRAMES_SETUP);
  await ev(`window.__frameling.overlays.closeSheet()`);
  await setMode('joined');
  const base = await settings({ format: 'sheet', range: 'all', transparent: true, scale: 1 / 8 });
  let webChecker;
  for (const engine of ['json', 'godot', 'phaser', 'pixi', 'unity', 'css']) {
    begin(`boards as frames, sprite sheet for ${engine}`);
    const dir = setDir(path.join(outDir, `frames-sheet-${engine}`));
    const sheet = { ...base.sheet, engine, godotScene: true, trim: false, padding: 0, extrude: 0, layout: 'grid', columns: 2, dedupe: true };
    const res = await run({ ...base, sheet });
    check(res.outcome === 'done', `did not finish: ${JSON.stringify(res)}`);
    const names = files(dir);
    const image = names.find((n) => n.endsWith('.png'));
    if (!check(!!image, `no sheet picture in ${names}`)) continue;
    let played;
    try {
      played = readFramesBack(engine, dir, names);
    } catch (e) {
      check(false, `could not read the ${engine} files: ${e}`);
      continue;
    }
    const anims = Object.keys(played);
    check(anims.length === 1 && anims[0] === 'default', `animations: ${anims}`);
    const frames = played.default ?? [];
    check(frames.length === FRAMES, `the animation has ${frames.length} frames, wanted ${FRAMES}`);
    frames.forEach((r, i) => {
      const got = hex(path.join(dir, image), r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
      check(got === boardHex(i), `frame ${i + 1} shows ${got}, wanted ${boardHex(i)}`);
    });
    note(`frames: ${frames.map((r) => `${r.x},${r.y}`).join(' ')}`);
    if (engine === 'godot' && GODOT) {
      const line = godotFrames(dir, names);
      check(line.includes('names:default') && line.includes('start:default'), `Godot: ${line}`);
      for (let i = 0; i < FRAMES; i++) check(line.includes(`f${i}:${boardRgb(i).join(',')}`), `Godot frame ${i + 1}: ${line}`);
      note('godot ok');
    }
    if (WEB && (engine === 'phaser' || engine === 'pixi' || engine === 'css')) {
      try {
        webChecker ??= await require('./web-engines/check.cjs').createWebChecker();
        const refs = [];
        for (let i = 0; i < FRAMES; i++) {
          const ref = path.join(dir, `_ref-${i}.png`);
          sh('convert', ['-size', '32x32', `xc:#${boardHex(i)}`, ref]);
          refs.push(ref);
        }
        const job = {
          engine, dir, image, separate: false, width: 32, height: 32,
          json: names.find((n) => n.endsWith('.json') && !n.endsWith('-anims.json')),
          anims: names.find((n) => n.endsWith('-anims.json')),
          css: names.find((n) => n.endsWith('.css')),
          html: names.find((n) => n.endsWith('.html')),
          animations: [{ name: 'default', fps: FPS, loop: true, count: FRAMES, times: 1, checks: refs.map((ref, i) => ({ i, ref })) }],
        };
        if (engine !== 'css') {
          const data = JSON.parse(fs.readFileSync(path.join(dir, job.json), 'utf8'));
          job.key = image.replace(/\.png$/, '');
          job.frameNames = Object.keys(data.frames);
          job.meta = data.meta.frameling ?? null;
        }
        const r = await webChecker.run(job);
        for (const p of r.problems) check(false, `${engine} in the real engine: ${p}`);
        for (const n of r.notes) note(n);
        note(`${engine} engine ok`);
      } catch (e) {
        check(false, `could not run the ${engine} engine check: ${e?.message ?? e}`);
      }
    }
  }
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
    if (!argv.includes('--only=frames-sheet')) {
      await exportsSection();
      await videoSection();
      await followSection();
    }
    await framesSheetSection();
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  process.exit(report() ? 0 : 1);
})();
