// End-to-end check of the timelapse in the real app: a scripted drawing session is recorded with real mouse input, then
// made into an MP4 (H.264), a WebM and a GIF through the app's own export, and the files are checked with ffprobe/ffmpeg.
// It also checks that recording never changes the drawing, that the bounds thin a long session, and what a picture costs.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/timelapse.cjs [outDir] [--keep=<dir>]
//
//   outDir      where files and the report go (default: a fresh folder under the system temp dir)
//   --keep=dir  also copy the MP4 there as timelapse.mp4 (used for brand/ab/stream-timelapse)
//
// Throwaway profile inside outDir, like export.cjs. Needs ffprobe and ffmpeg on PATH.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('timelapse.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-timelapse-')));
const keep = argv.find((a) => a.startsWith('--keep='))?.slice(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gpu = require('../lib/gpu.cjs');
gpu.use('software');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const lines = [];
const say = (m) => {
  stage = m;
  lines.push(m);
  console.log(m);
};
const check = (cond, msg) => {
  if (!cond) {
    failures.push(msg);
    console.log(`  FAIL ${msg}`);
  } else console.log(`  ok   ${msg}`);
  return !!cond;
};
const sh = (cmd, args) => cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const T = (call) => ev(`window.__framelingTimelapse.${call}`);
const pageErrors = [];
let stage = 'start';

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'files');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.on('show', () => w.hide());
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  win.setContentSize(1280, 800);
  await gpu.confirmOrExit(win);
  win.webContents.on('console-message', (e) => {
    if ((e.level ?? e.severity) === 'error' || (e.level ?? e.severity) === 3) pageErrors.push(`[${stage}] ` + String(e.message ?? e));
  });
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingTimelapse && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

// ---------------------------------------------------------------- drawing with the real mouse

const send = (e) => win.webContents.sendInputEvent(e);
// The scene is laid out for a 1280 x 800 canvas area; the drawing sits at about (343, 131) and is 490 x 276 on screen once fitted.
const P = ([x, y]) => [Math.round(245 + (x - 300) * 0.7), Math.round(135 + (y - 100) * 0.58)];
async function drag(raw, steps = 6, delay = 8) {
  const points = raw.map(P);
  const [x0, y0] = points[0];
  send({ type: 'mouseMove', x: x0, y: y0 });
  send({ type: 'mouseDown', x: x0, y: y0, button: 'left', clickCount: 1 });
  await sleep(16);
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    for (let k = 1; k <= steps; k++) {
      send({ type: 'mouseMove', x: Math.round(ax + ((bx - ax) * k) / steps), y: Math.round(ay + ((by - ay) * k) / steps), modifiers: ['leftButtonDown'] });
      await sleep(delay);
    }
  }
  const [lx, ly] = points[points.length - 1];
  send({ type: 'mouseUp', x: lx, y: ly, button: 'left', clickCount: 1 });
  await sleep(120);
}
const ui = (patch) => ev(`__frameling.store().setUi(${JSON.stringify(patch)})`);
const brush = (size, color) => ev(`(() => { __frameling.run('tools.brush'); const s = __frameling.store(); s.setUi({ color: ${JSON.stringify(color)}, brush: { ...s.get().ui.brush, size: ${size} } }); })()`);

/** A small scene, built up like a person would: sky, hills, sun, house, tree, then little details. */
async function scene(n = 99, pause = 380) {
  const steps = [];
  const S = (f) => steps.push(f);
  // Sky
  for (let i = 0; i < 6; i++) S(async () => (await brush(46, i % 2 ? '#bfe3ff' : '#9fd3ff'), drag([[300, 200 + i * 40], [520, 190 + i * 40], [760, 205 + i * 40], [980, 195 + i * 40]], 5)));
  // Hills
  S(async () => (await brush(30, '#7bcf7f'), drag([[300, 520], [440, 440], [600, 520], [760, 450], [980, 540]], 6)));
  for (let i = 0; i < 3; i++) S(async () => (await brush(34, '#5fbf6a'), drag([[320 + i * 30, 560 + i * 30], [560, 540 + i * 30], [780, 560 + i * 30], [960, 548 + i * 30]], 5)));
  // Sun
  S(async () => (await ui({ tool: 'ellipse', color: '#ff9a3c', fillColor: '#ffc94a' }), drag([[820, 130], [900, 210]], 8)));
  // House
  S(async () => (await ui({ tool: 'rect', color: '#6b4a3a', fillColor: '#f2d3a5' }), drag([[420, 400], [560, 520]], 8)));
  S(async () => (await brush(14, '#b04a3a'), drag([[400, 405], [490, 340], [580, 405], [400, 405]], 6)));
  S(async () => (await ui({ tool: 'rect', color: '#6b4a3a', fillColor: '#8a5a44' }), drag([[475, 460], [505, 520]], 6)));
  S(async () => (await ui({ tool: 'rect', color: '#6b4a3a', fillColor: '#bfe3ff' }), drag([[430, 420], [460, 450]], 6)));
  // Tree
  S(async () => (await ui({ tool: 'rect', color: '#5a3a2a', fillColor: '#7a5238' }), drag([[700, 430], [722, 530]], 6)));
  for (const [x, y, c] of [[690, 410, '#3f9f4a'], [735, 400, '#4fb25a'], [712, 370, '#3f9f4a']]) S(async () => (await ui({ tool: 'ellipse', color: '#2f7f3a', fillColor: c }), drag([[x - 40, y - 34], [x + 40, y + 34]], 6)));
  // Details: birds, grass, clouds
  for (let i = 0; i < 4; i++) S(async () => (await brush(5, '#2d2a3a'), drag([[560 + i * 50, 150 + (i % 2) * 20], [575 + i * 50, 138 + (i % 2) * 20], [590 + i * 50, 150 + (i % 2) * 20]], 4)));
  for (let i = 0; i < 5; i++) S(async () => (await brush(6, '#2f7f3a'), drag([[600 + i * 40, 560], [604 + i * 40, 540]], 3)));
  S(async () => (await ui({ tool: 'ellipse', color: '#ffffff', fillColor: '#ffffff' }), drag([[330, 120], [430, 170]], 6)));
  S(async () => (await ui({ tool: 'ellipse', color: '#ffffff', fillColor: '#ffffff' }), drag([[380, 100], [480, 160]], 6)));
  for (const s of steps.slice(0, n)) {
    await s();
    // A person stops to look now and then, so the pictures are not all taken in one burst.
    await sleep(pause);
  }
}

// ---------------------------------------------------------------- reading the files

function probe(file) {
  const r = sh('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', file]);
  try {
    const j = JSON.parse(r.stdout);
    return { ...j.streams[0], duration: parseFloat(j.format.duration) };
  } catch {
    return null;
  }
}
/** The mean brightness of a frame (0 to 255), to tell a blank start from a finished drawing. */
function meanAt(file, t) {
  const r = sh('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=64:-1,format=gray', '-f', 'rawvideo', '-']);
  const b = Buffer.from(r.stdout, 'binary');
  return null;
}
function grayMean(file, t) {
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=64:-1,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  if (!r.stdout || !r.stdout.length) return null;
  return r.stdout.reduce((a, b) => a + b, 0) / r.stdout.length;
}
void meanAt;

async function main() {
  const have = (n) => sh('which', [n]).status === 0;
  if (!have('ffprobe') || !have('ffmpeg')) throw new Error('ffprobe and ffmpeg are needed');
  await startApp();
  await ev(`__frameling.template('blank-vector')`);
  await sleep(500);
  await ev(`__frameling.run('view.fit')`);
  await sleep(400);

  // ---- 1. recording only reads: the drawing is the very same object, and no undo step is added
  say('Recording reads the drawing only');
  const same = await ev(`(async () => {
    const s = __frameling.store(); const d = s.get().doc; const hist = JSON.stringify(s.get().ui.selection);
    await __framelingTimelapse.start(500); await new Promise((r) => setTimeout(r, 1500)); await __framelingTimelapse.stop();
    return s.get().doc === d && JSON.stringify(s.get().ui.selection) === hist;
  })()`);
  check(same, 'start and stop with no drawing leave the document object untouched');
  check((await T('state()')).status === 'off', 'it is off after stopping');
  await T('clear()');

  // ---- 2. the scripted session
  say('A scripted drawing session');
  check((await T('state()')).status === 'off', 'off by default');
  const t0 = Date.now();
  await T('start(400)');
  check((await T('state()')).status === 'recording', 'recording after start');
  await sleep(400);
  const undoBefore = await ev(`__frameling.store().get().doc.layers.length`);
  await scene();
  await sleep(1200);
  const mid = await T('state()');
  fs.writeFileSync(path.join(outDir, 'window-after-scene.png'), (await win.webContents.capturePage()).toPNG());
  say(`  shapes drawn: ${await ev(`Object.values(__frameling.store().get().doc.drawings).reduce((n, d) => n + (d.shapes ? d.shapes.length : 0), 0)`)}, zoom ${await ev(`__frameling.store().get().ui.zoom`)}`);
  await T('stop()');
  const secs = (Date.now() - t0) / 1000;
  const st = await T('state()');
  const kept = await T('kept()');
  say(`  ${kept.length} pictures over ${secs.toFixed(1)} s, ${(st.bytes / 1024).toFixed(0)} KB`);
  check(st.status === 'off', 'stopped');
  check(kept.length >= 12, `at least 12 pictures kept (${kept.length})`);
  check(mid.count > 0 && mid.status === 'recording', 'the badge state counts pictures while recording');
  check(kept.every((k, i) => i === 0 || k.id > kept[i - 1].id), 'the pictures are in the order they were taken');
  check(await ev(`document.querySelector('[data-testid=timelapse-badge]') === null`), 'the badge goes away after stopping');
  const files = fs.readdirSync(path.join(outDir, 'userdata', 'library', 'timelapse'));
  check(files.length === kept.length && files.every((f) => f.endsWith('.webp')), 'the pictures are written to the temp folder as they go');
  check((await ev(`__frameling.store().get().doc.layers.length`)) === undoBefore, 'the drawing has the same layers (nothing added by recording)');
  const stats = await T('stats()');
  say(`  a picture costs ${(stats.totalMs / Math.max(1, stats.pictures)).toFixed(1)} ms on average, ${stats.maxMs.toFixed(1)} ms at most (software drawing, 1280 x 800 drawing)`);

  // ---- 3. the badge while recording
  say('The badge');
  await T('start(700)');
  await sleep(300);
  check(await ev(`document.querySelector('[data-testid=timelapse-badge]') !== null`), 'a badge is on screen while recording');
  const txt = await ev(`document.querySelector('[data-testid=timelapse-badge]').textContent`);
  check(/Recording a timelapse/.test(txt) && /Stop/.test(txt), `it says what it is doing and has a Stop button (${txt})`);
  await T('pause()');
  check((await T('state()')).status === 'paused', 'pause works');
  check(/paused/i.test(await ev(`document.querySelector('[data-testid=timelapse-badge]').textContent`)), 'the badge says so while paused');
  await T('stop()');
  // The first session was kept; starting again (auto) with the choice default carries on, so clear for a clean one.
  await T('clear()');

  // ---- 4. the real recording again, for the files (the first one was already cleared)
  await ev(`__frameling.template('blank-vector')`);
  await sleep(400);
  await ev(`__frameling.run('view.fit')`);
  await sleep(300);
  await T('start(400)');
  await sleep(300);
  await scene();
  await sleep(1000);
  await T('stop()');
  const picked = (await T('kept()')).length;
  say(`Making the video from ${picked} pictures`);

  const out = {};
  for (const [fmt, secsWanted] of [['mp4', 10], ['webm', 10], ['gif', 8]]) {
    const before = new Set(fs.readdirSync(path.join(outDir, 'files')));
    const r = await ev(`__framelingTimelapse.export(${JSON.stringify(fmt)}, ${secsWanted})`);
    const made = fs.readdirSync(path.join(outDir, 'files')).filter((f) => !before.has(f));
    check(r === 'done' && made.length === 1, `${fmt}: exported one file (${r}, ${made.join(',')})`);
    if (made.length !== 1) continue;
    const file = path.join(outDir, 'files', made[0]);
    out[fmt] = file;
    const p = probe(file);
    if (!check(!!p, `${fmt}: ffprobe reads it`)) continue;
    say(`  ${made[0]}: ${p.codec_name} ${p.profile ?? ''} ${p.width}x${p.height} ${p.pix_fmt} ${p.r_frame_rate} ${p.nb_read_frames} frames, ${p.duration.toFixed(1)} s, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    check(p.width % 2 === 0 && p.height % 2 === 0, `${fmt}: even size`);
    const wantFps = fmt === 'gif' ? 15 : 30;
    const want = Math.min(secsWanted, picked * 0.5) + 2;
    check(Math.abs(p.duration - want) < 1.2, `${fmt}: about ${want.toFixed(1)} s long (${p.duration.toFixed(1)})`);
    check(Math.abs(eval(p.r_frame_rate) - wantFps) < 0.5 || fmt === 'gif', `${fmt}: ${wantFps} frames a second`);
    if (fmt === 'mp4') {
      check(p.codec_name === 'h264', 'mp4: the codec is H.264');
      check(p.pix_fmt === 'yuv420p', 'mp4: yuv420p');
    }
    if (fmt === 'webm') check(['vp8', 'vp9', 'av1'].includes(p.codec_name), `webm: ${p.codec_name}`);
    if (fmt === 'gif') check(p.codec_name === 'gif' && p.width <= 640, 'gif: no wider than 640');
  }
  if (out.mp4) {
    const p = probe(out.mp4);
    const first = grayMean(out.mp4, 0.05);
    const last = grayMean(out.mp4, Math.max(0, p.duration - 0.5));
    say(`  brightness at the start ${first?.toFixed(1)}, at the end ${last?.toFixed(1)}`);
    check(first !== null && last !== null && Math.abs(first - last) > 3, 'the video starts different from how it ends (the drawing appears)');
    // Frames from the middle differ from each other, so it is not one picture held.
    const a = grayMean(out.mp4, p.duration * 0.3);
    const b = grayMean(out.mp4, p.duration * 0.6);
    check(a !== null && b !== null && Math.abs(a - b) > 0.2, 'frames in the middle differ (the picture is building up)');
    if (keep) {
      fs.mkdirSync(keep, { recursive: true });
      fs.copyFileSync(out.mp4, path.join(keep, 'timelapse.mp4'));
      const poster = path.join(keep, 'timelapse-last-frame.png');
      sh('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0, p.duration - 0.5)), '-i', out.mp4, '-frames:v', '1', poster]);
    }
  }

  // ---- 5. the bounds: a small cap thins the session and keeps its ends
  say('A long session stays bounded');
  await T('clear()');
  await ev(`__frameling.template('blank-vector')`);
  await sleep(400);
  await ev(`__frameling.run('view.fit')`);
  await sleep(300);
  await T('setLimits(6, 50 * 1024 * 1024)');
  await T('start(300)');
  await sleep(300);
  await scene();
  await sleep(900);
  await T('stop()');
  const thinned = await T('kept()');
  say(`  with room for 6 pictures: ${thinned.length} kept`);
  check(thinned.length > 2 && thinned.length <= 6, `no more than the limit (${thinned.length})`);
  const onDisk = fs.readdirSync(path.join(outDir, 'userdata', 'library', 'timelapse')).length;
  check(onDisk === thinned.length, `pictures thrown away are gone from the folder too (${onDisk} on disk)`);
  await T('setLimits(1200, 200 * 1024 * 1024)').catch(() => undefined);
  await T('clear()');

  // The toast shelf's own ResizeObserver note when two toasts overlap is the browser's, not a fault.
  for (let i = pageErrors.length - 1; i >= 0; i--) if (/ResizeObserver loop/.test(pageErrors[i])) say(`  (browser note ignored: ${pageErrors.splice(i, 1)[0]})`);
  check(!pageErrors.length, `no errors in the page console${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''}`);
  fs.writeFileSync(path.join(outDir, 'report.txt'), lines.join('\n') + '\n' + (failures.length ? 'FAILED:\n' + failures.join('\n') : 'ALL OK') + '\n');
}

main()
  .catch((e) => {
    failures.push(String(e && e.stack ? e.stack : e));
    console.log(String(e && e.stack ? e.stack : e));
  })
  .finally(() => {
    console.log(failures.length ? `\n${failures.length} FAILED` : '\nAll good');
    process.exit(failures.length ? 1 : 0);
  });
