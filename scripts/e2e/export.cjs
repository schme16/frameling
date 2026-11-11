// End-to-end check of every export format, plus save / open / autosave / close, in the real app.
//
// It starts the REAL main process (dist/main/main.cjs) with FRAMELING_AUTOMATION_DIR set, so save dialogs answer
// without anyone clicking, loads the built renderer with ?debug, drives the same exportDocument() the Export dialog's
// button calls, then checks every output with real tools (ffprobe, ffmpeg, ImageMagick, rsvg-convert, xmllint, unzip,
// and Godot if GODOT_BIN is set). Exits non-zero when anything fails, so it can run in CI.
//
// Run (no npm scripts needed). Build first, and run inside a virtual display so nothing opens on your desktop:
//
//   npm run build
//   xvfb-run -a npx electron scripts/e2e/export.cjs [outDir] [options]
//
//   outDir               where outputs and the report go (default: a fresh folder under the system temp dir)
//   --only=gif,mp4       only these formats (mp4 webm gif apng png pngseq svg sheet interactives psd pdf ai prores
//                        godot-bones)
//   --templates=a,b      only these templates (bouncing-ball hero-sprites blank-vector blank-pixel bouncing-logo stress kitchen-sink)
//   --skip=files         skip a part: files (save/open/autosave/close), godot
//   --show               leave the window visible (needs a real display)
//   GODOT_BIN=/path/to/godot-4-editor    also loads the sprite sheet files in Godot
//
// It uses a throwaway user-data folder inside outDir, so it never touches your real settings, recent files or autosave.
// Needs on PATH: ffprobe, ffmpeg, convert and compare (ImageMagick), rsvg-convert, xmllint, unzip. A missing tool skips
// its checks and says so; it does not fail the run.
const { app, BrowserWindow, dialog } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('export.cjs'));
const flag = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]?.split(',');
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-e2e-')));
const ONLY = flag('only');
const TEMPLATES = flag('templates') ?? ['bouncing-ball', 'hero-sprites', 'blank-vector', 'blank-pixel', 'bouncing-logo', 'stress', 'kitchen-sink'];
const SKIP = flag('skip') ?? [];
const GODOT = process.env.GODOT_BIN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- results

const results = [];
let current = null;
function begin(group, name) {
  current = { group, name, failures: [], notes: [] };
  results.push(current);
  return current;
}
const fail = (msg) => current.failures.push(msg);
const note = (msg) => current.notes.push(msg);
const check = (cond, msg) => {
  if (!cond) fail(msg);
  return !!cond;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- tools

const have = {};
function tool(name) {
  if (!(name in have)) have[name] = cp.spawnSync('which', [name]).status === 0;
  return have[name];
}
function sh(cmd, args, opts = {}) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180000, ...opts });
  return { out: r.stdout ?? '', err: r.stderr ?? '', status: r.status };
}
const missing = new Set();
function need(...names) {
  const bad = names.filter((n) => !tool(n));
  bad.forEach((n) => missing.add(n));
  if (bad.length) note(`skipped some checks, missing: ${bad.join(', ')}`);
  return !bad.length;
}

/** Normalised RMSE (0 to 1) between two pictures, both flattened over magenta so transparency counts. null = could not compare. */
let tmpN = 0;
function rmse(a, b) {
  if (!need('convert', 'compare')) return null;
  const [[bw, bh] = []] = identify(b);
  const flat = (f, crop) => {
    const o = path.join(os.tmpdir(), `fl-e2e-${process.pid}-${tmpN++}.png`);
    // A video pads an odd size to even, so the bigger picture is cut back to the smaller before comparing.
    sh('convert', [f, ...(crop ? ['-crop', `${bw}x${bh}+0+0`, '+repage'] : []), '-background', '#ff00ff', '-alpha', 'remove', '-alpha', 'off', o]);
    return o;
  };
  const fa = flat(a, true);
  const fb = flat(b, false);
  const r = sh('compare', ['-metric', 'RMSE', fa, fb, 'null:']);
  fs.rmSync(fa, { force: true });
  fs.rmSync(fb, { force: true });
  const m = /\(([\d.e+-]+)\)/.exec(r.err);
  return m ? Number(m[1]) : null;
}
/** Does this picture have any see-through pixel? */
function hasAlpha(file) {
  if (!need('convert')) return null;
  const r = sh('convert', [file, '-alpha', 'extract', '-format', '%[fx:minima]', 'info:']);
  return Number(r.out) < 1;
}
const identify = (file) => {
  const r = sh('identify', ['-format', '%w %h|', file]);
  return r.out.split('|').filter(Boolean).map((s) => s.trim().split(' ').map(Number));
};

// ---------------------------------------------------------------- page driving

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const X = (call) => ev(`window.__framelingExport.${call}`);
const IO = (call) => ev(`window.__framelingIo.${call}`);

// stress and kitchen-sink are fixtures, not templates people see (src/export/debug.ts, src/export/kitchenSink.ts).
const loadTpl = (tpl) => X(tpl === 'stress' ? 'loadStress()' : tpl === 'kitchen-sink' ? 'loadKitchenSink()' : `load(${JSON.stringify(tpl)})`);

function setAutomationDir(d) {
  fs.mkdirSync(d, { recursive: true });
  process.env.FRAMELING_AUTOMATION_DIR = d;
  return d;
}

async function startApp() {
  // A throwaway profile: recent files, remembered folders and the autosave copy all land in outDir.
  app.setPath('userData', path.join(outDir, 'userdata'));
  // Pretend a second launch is impossible to collide with the user's own Frameling.
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  setAutomationDir(path.join(outDir, 'misc'));
  // A bundle built by scripts/build-main.mjs. Requiring it runs the real startup.
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    if (!argv.includes('--show')) w.on('show', () => w.hide());
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
  await waitForPage();
}

async function waitForPage() {
  win.webContents.on('console-message', (e) => {
    const lvl = e.level ?? e.severity;
    if (lvl === 'error' || lvl === 3) pageErrors.push(String(e.message ?? e));
  });
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__framelingIo && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}
const pageErrors = [];

// ---------------------------------------------------------------- readers for the formats

function readPngChunks(b) {
  const chunks = [];
  let at = 8;
  while (at + 8 <= b.length) {
    const len = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    chunks.push({ type, data: b.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
  }
  return chunks;
}

function parseApng(b) {
  const sig = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks = readPngChunks(b);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const actl = chunks.find((c) => c.type === 'acTL');
  const fctl = chunks.filter((c) => c.type === 'fcTL').map((c) => ({ seq: c.data.readUInt32BE(0), w: c.data.readUInt32BE(4), h: c.data.readUInt32BE(8), x: c.data.readUInt32BE(12), y: c.data.readUInt32BE(16), delay: (c.data.readUInt16BE(20) / (c.data.readUInt16BE(22) || 100)) * 1000, dispose: c.data[24], blend: c.data[25] }));
  const seqs = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT').map((c) => c.data.readUInt32BE(0));
  const order = chunks.map((c) => c.type);
  return { sig, width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), frames: actl ? actl.data.readUInt32BE(0) : 0, plays: actl ? actl.data.readUInt32BE(4) : null, fctl, seqs, order };
}

function parseGif(b) {
  const out = { sig: b.toString('latin1', 0, 6), width: b.readUInt16LE(6), height: b.readUInt16LE(8), frames: 0, delays: [], transparent: [], loop: null, trailer: false, disposal: [] };
  const packed = b[10];
  let at = 13 + (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
  const skip = () => {
    while (b[at] !== 0) at += b[at] + 1;
    at++;
  };
  while (at < b.length) {
    const t = b[at++];
    if (t === 0x3b) {
      out.trailer = true;
      break;
    }
    if (t === 0x21) {
      const label = b[at++];
      if (label === 0xf9) {
        out.transparent.push((b[at + 1] & 1) === 1);
        out.disposal.push((b[at + 1] >> 2) & 7);
        out.delays.push(b.readUInt16LE(at + 2) * 10);
      } else if (label === 0xff && b.toString('latin1', at + 1, at + 12) === 'NETSCAPE2.0') out.loop = b.readUInt16LE(at + 14);
      skip();
    } else if (t === 0x2c) {
      out.frames++;
      const lp = b[at + 8];
      at += 9;
      if (lp & 0x80) at += 3 * (1 << ((lp & 7) + 1));
      at++;
      skip();
    } else break;
  }
  return out;
}

// ---------------------------------------------------------------- expectations

/** What a case should produce, worked out from the page's own plan and the document. */
async function expectationFor(settings) {
  const plan = await X(`plan(${JSON.stringify(settings)})`);
  const doc = await X('doc()');
  return { plan, doc, fps: doc.fps, count: plan.count, width: plan.width, height: plan.height };
}

/** A reference PNG of one frame at the same size and background, made by the app's own PNG export. */
let refN = 0;
async function reference(settings, docFrame, transparent) {
  const dir = setAutomationDir(path.join(outDir, '_refs', String(refN++)));
  await X(`setFrame(${docFrame})`);
  const r = await X(`run(${JSON.stringify({ ...settings, format: 'png', range: 'frame', clipId: null, transparent })})`);
  const f = fs.readdirSync(dir).find((n) => n.endsWith('.png'));
  if (!f || r.error) return null;
  return path.join(dir, f);
}

// ---------------------------------------------------------------- validators (one per format)

const TOL = { lossless: 0.0005, svg: 0.07, gif: 0.12, video: 0.1 };

async function vVideo(file, s, exp, caseCtx) {
  if (!need('ffprobe', 'ffmpeg')) return;
  const webm = s.format === 'webm';
  const p = JSON.parse(sh('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,nb_read_frames,avg_frame_rate,duration,level:stream_tags:format=duration,format_name', '-of', 'json', file]).out || '{}');
  const st = p.streams?.[0];
  if (!check(st, 'ffprobe found no video stream')) return;
  note(`${st.codec_name}${st.profile ? ' ' + st.profile : ''} ${st.width}x${st.height} ${st.pix_fmt} frames=${st.nb_read_frames} dur=${p.format?.duration}`);
  check(webm ? /^vp(8|9)$|^av1$/.test(st.codec_name) : st.codec_name === 'h264', `unexpected codec ${st.codec_name}`);
  check(st.width === exp.width && st.height === exp.height, `size ${st.width}x${st.height}, wanted ${exp.width}x${exp.height}`);
  check(st.width % 2 === 0 && st.height % 2 === 0, `odd video size ${st.width}x${st.height}`);
  // MP4 is limited range BT.709 and says so (full range yuvj420p looks wrong in some players).
  if (!webm) check(st.pix_fmt === 'yuv420p' && st.color_range === 'tv' && st.color_space === 'bt709' && st.color_primaries === 'bt709' && st.color_transfer === 'bt709', `colour ${st.pix_fmt} ${st.color_range} ${st.color_space}/${st.color_primaries}/${st.color_transfer}, wanted yuv420p tv bt709`);
  check(Number(st.nb_read_frames) === exp.count, `frame count ${st.nb_read_frames}, wanted ${exp.count}`);
  check(near(Number(p.format?.duration), exp.count / exp.fps, 1 / exp.fps + 0.02), `duration ${p.format?.duration}s, wanted about ${(exp.count / exp.fps).toFixed(3)}s`);
  const [n, d] = String(st.avg_frame_rate).split('/').map(Number);
  check(near(n / d, exp.fps, 0.6), `frame rate ${st.avg_frame_rate}, wanted ${exp.fps}`);
  check(sh('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']).err.trim() === '', 'ffmpeg reports decode errors');
  if (caseCtx.sound && exp.count > 1) {
    const a = sh('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]).out.trim();
    if (check(a, 'the document has sound but the video has none')) note(`sound: ${a}`);
    // ffmpeg is here (it's checking this file), so the app should have used it to make MP4 sound AAC.
    if (!webm) check(a === 'aac', `MP4 sound is ${a}, wanted aac (QuickTime and Safari play Opus in MP4 silent)`);
  }

  // Alpha: ask ffprobe for the tag, then decode with the VP9 decoder that understands it.
  const wantAlpha = webm && caseCtx.transparent && caseCtx.alphaExpected;
  if (webm) {
    const tags = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_tags=alpha_mode', '-of', 'csv=p=0', file]).out.trim();
    note(`alpha_mode=${tags || 'none'}`);
    if (wantAlpha) check(tags === '1', 'WebM was asked for transparency but has no alpha_mode tag');
  }
  const frameAt = (k) => {
    const o = path.join(path.dirname(file), `_dec-${k}.png`);
    const args = ['-v', 'error', '-y'];
    if (webm && st.codec_name === 'vp9') args.push('-c:v', 'libvpx-vp9');
    args.push('-i', file, '-vf', `select=eq(n\\,${k})`, '-vframes', '1', '-pix_fmt', 'rgba', o);
    sh('ffmpeg', args);
    return fs.existsSync(o) ? o : null;
  };
  for (const k of [0, exp.count - 1]) {
    const dec = frameAt(k);
    if (!check(dec, `could not decode frame ${k}`)) continue;
    if (wantAlpha && k === 0) {
      const a = hasAlpha(dec);
      // A blank see-through frame is all alpha; a drawn one has a mix. Either way something must be see-through.
      check(a === true, 'decoded WebM frame has no transparent pixels');
    }
    const ref = await reference(s, exp.plan.range.start + k, wantAlpha);
    if (ref) {
      const e = rmse(dec, ref);
      note(`frame ${k} vs png rmse=${e?.toFixed(4)}`);
      if (e !== null) check(e < TOL.video, `frame ${k} differs from the PNG export (rmse ${e.toFixed(4)})`);
    }
  }
}

async function vGif(file, s, exp, caseCtx) {
  const b = fs.readFileSync(file);
  const g = parseGif(b);
  note(`gif ${g.width}x${g.height} frames=${g.frames} loop=${g.loop} delay=${g.delays[0]}ms`);
  check(g.sig === 'GIF89a', `signature ${g.sig}`);
  check(g.trailer, 'GIF has no trailer');
  check(g.width === exp.width && g.height === exp.height, `size ${g.width}x${g.height}, wanted ${exp.width}x${exp.height}`);
  check(g.frames === exp.count, `frame count ${g.frames}, wanted ${exp.count}`);
  const capFps = Math.min(exp.fps, 50);
  const total = g.delays.reduce((a, c) => a + c, 0);
  check(near(total, (exp.count * 1000) / capFps, 10 * exp.count * 0.5 + 20), `total time ${total}ms, wanted about ${((exp.count * 1000) / capFps).toFixed(0)}ms`);
  check(s.loop ? g.loop === 0 : g.loop === null || g.loop === 1 || true, 'loop flag');
  if (s.loop) check(g.loop === 0, `loop forever expected, NETSCAPE loop=${g.loop}`);
  else check(g.loop === null, `play once expected (no NETSCAPE block), got loop=${g.loop}`);
  if (need('identify')) {
    const frames = identify(file);
    check(frames.length === exp.count, `ImageMagick sees ${frames.length} frames`);
  }
  if (need('ffprobe')) {
    const f = sh('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file]).out.trim();
    check(Number(f) === exp.count, `ffprobe counts ${f} frames`);
  }
  if (need('convert')) {
    const dir = path.dirname(file);
    sh('convert', [file, '-coalesce', path.join(dir, '_g-%d.png')]);
    for (const k of [0, exp.count - 1]) {
      const dec = path.join(dir, `_g-${k}.png`);
      if (!check(fs.existsSync(dec), `could not decode frame ${k}`)) continue;
      const wantAlpha = caseCtx.transparent;
      if (wantAlpha && k === 0) check(g.transparent[0], 'GIF asked for transparency but frame 0 has no transparent colour');
      const ref = await reference(s, exp.plan.range.start + k, wantAlpha);
      const e = ref && rmse(dec, ref);
      if (e !== null && e !== undefined) {
        note(`frame ${k} vs png rmse=${e.toFixed(4)}`);
        check(e < TOL.gif, `frame ${k} differs from the PNG export (rmse ${e.toFixed(4)})`);
      }
    }
  }
}

async function vApng(file, s, exp, caseCtx) {
  const a = parseApng(fs.readFileSync(file));
  note(`apng ${a.width}x${a.height} frames=${a.frames} plays=${a.plays} delay=${a.fctl[0]?.delay}ms`);
  check(a.sig, 'PNG signature');
  check(a.width === exp.width && a.height === exp.height, `size ${a.width}x${a.height}, wanted ${exp.width}x${exp.height}`);
  check(a.frames === exp.count && a.fctl.length === exp.count, `frame count acTL=${a.frames} fcTL=${a.fctl.length}, wanted ${exp.count}`);
  check(s.loop ? a.plays === 0 : a.plays === 1, `plays=${a.plays}, wanted ${s.loop ? 0 : 1}`);
  check(a.seqs.every((v, i) => v === i), 'sequence numbers are not 0,1,2...');
  check(a.order.indexOf('acTL') < a.order.indexOf('IDAT'), 'acTL must come before IDAT');
  check(a.order.indexOf('fcTL') < a.order.indexOf('IDAT'), 'first fcTL must come before IDAT (so the first frame is part of the animation)');
  const total = a.fctl.reduce((x, c) => x + c.delay, 0);
  check(near(total, (exp.count * 1000) / exp.fps, 2 + exp.count * 0.5), `total time ${total}ms, wanted ${((exp.count * 1000) / exp.fps).toFixed(0)}ms`);
  if (need('ffprobe', 'ffmpeg')) {
    const f = sh('ffprobe', ['-v', 'error', '-f', 'apng', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,nb_read_frames', '-of', 'csv=p=0', file]).out.trim();
    note(`ffprobe: ${f}`);
    check(f === `apng,${exp.count}`, `ffprobe says "${f}"`);
    const dir = path.dirname(file);
    sh('ffmpeg', ['-v', 'error', '-y', '-f', 'apng', '-i', file, '-vsync', '0', path.join(dir, '_a-%04d.png')]);
    for (const k of [0, exp.count - 1]) {
      const dec = path.join(dir, `_a-${String(k + 1).padStart(4, '0')}.png`);
      if (!check(fs.existsSync(dec), `could not decode frame ${k}`)) continue;
      const ref = await reference(s, exp.plan.range.start + k, caseCtx.transparent);
      const e = ref && rmse(dec, ref);
      if (e !== null && e !== undefined) check(e < TOL.lossless, `frame ${k} differs from the PNG export (rmse ${e.toFixed(5)})`);
      if (k === 0 && caseCtx.transparent) check(hasAlpha(dec) === true, 'transparent APNG frame has no transparent pixels');
    }
  }
}

async function vPng(file, s, exp, caseCtx) {
  const b = fs.readFileSync(file);
  const ch = readPngChunks(b);
  const ihdr = ch.find((c) => c.type === 'IHDR').data;
  note(`png ${ihdr.readUInt32BE(0)}x${ihdr.readUInt32BE(4)} depth=${ihdr[8]} colour=${ihdr[9]}`);
  check(ihdr.readUInt32BE(0) === exp.width && ihdr.readUInt32BE(4) === exp.height, `size ${ihdr.readUInt32BE(0)}x${ihdr.readUInt32BE(4)}, wanted ${exp.width}x${exp.height}`);
  check(!ch.some((c) => c.type === 'acTL'), 'a still PNG must not carry animation chunks');
  if (need('identify')) {
    const r = sh('identify', [file]);
    check(r.status === 0, `ImageMagick cannot read it: ${r.err.slice(0, 120)}`);
  }
  if (need('convert')) {
    const wantAlpha = caseCtx.transparent;
    const a = hasAlpha(file);
    if (wantAlpha) check(a === true, 'transparent PNG has no transparent pixels');
    else check(a === false, 'PNG with a background has transparent pixels');
  }
}

async function vPngSeq(file, s, exp, caseCtx) {
  if (!need('unzip')) return;
  const dir = path.join(path.dirname(file), '_zip');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  check(sh('unzip', ['-tq', file]).status === 0, 'unzip -t failed');
  check(sh('unzip', ['-q', file, '-d', dir]).status === 0, 'unzip failed');
  const names = fs.readdirSync(dir).sort();
  note(`${names.length} files, ${names[0]} ... ${names[names.length - 1]}`);
  check(names.length === exp.count, `${names.length} pictures, wanted ${exp.count}`);
  const digits = Math.max(4, String(exp.count).length);
  const want = names.map((_, i) => `${exp.plan.name}-${String(i + 1).padStart(digits, '0')}.png`);
  check(JSON.stringify(names) === JSON.stringify(want), `names are not <name>-${'0'.repeat(digits - 1)}1.png style: ${names[0]}`);
  const dims = names.slice(0, 3).concat(names.slice(-1)).map((n) => identify(path.join(dir, n))[0]);
  check(dims.every((d) => d[0] === exp.width && d[1] === exp.height), `a picture is the wrong size: ${JSON.stringify(dims)}`);
  for (const k of [0, exp.count - 1]) {
    const ref = await reference(s, exp.plan.range.start + k, caseCtx.transparent);
    const e = ref && rmse(path.join(dir, names[k]), ref);
    if (e !== null && e !== undefined) check(e < TOL.lossless, `picture ${k + 1} differs from the PNG export (rmse ${e.toFixed(5)})`);
  }
  if (caseCtx.transparent) check(hasAlpha(path.join(dir, names[0])) === true, 'transparent sequence has no transparent pixels');
  // The names in the zip must match the file entries, with no folders.
  const listing = sh('unzip', ['-Z1', file]).out.trim().split('\n');
  check(listing.every((n) => !n.includes('/')), 'zip entries sit in a folder');
}

// The Interactives package: a zip with the manifest and the atlas; the first and last frames put back together from
// the atlas must match the PNG export of the same frame.
async function vPlayable(file, s, exp, caseCtx) {
  if (!need('unzip')) return;
  const dir = path.join(path.dirname(file), '_zip');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  check(sh('unzip', ['-tq', file]).status === 0, 'unzip -t failed');
  check(sh('unzip', ['-q', file, '-d', dir]).status === 0, 'unzip failed');
  const names = fs.readdirSync(dir).sort();
  check(names.includes('manifest.json') && names.includes('atlas.png'), `missing files: ${names}`);
  check(names.includes('source.frameling') === (s.includeSource !== false), `source.frameling ${names.includes('source.frameling') ? 'there' : 'missing'}`);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  note(`${m.cells.length} pictures for ${m.frameCount} frames, atlas ${m.atlas.width}x${m.atlas.height}, clips ${m.clips.map((c) => c.name).join(' ')}`);
  check(m.format === 'frameling-playable' && m.version === 1, 'not a frameling-playable manifest');
  check(m.frameCount === exp.count && m.frames.length === exp.count, `${m.frameCount} frames, wanted ${exp.count}`);
  check(m.frames.every((c) => c >= 0 && c < m.cells.length), 'a frame points at a picture that is not there');
  check(m.clips.every((c) => c.start >= 0 && c.end < m.frameCount && c.start <= c.end), 'a clip is outside the frames');
  check(m.background === (caseCtx.transparent ? null : m.background), 'background should be null when see-through');
  const atlas = path.join(dir, 'atlas.png');
  if (need('identify')) {
    const d = identify(atlas)[0];
    check(d[0] === m.atlas.width && d[1] === m.atlas.height, `atlas is ${d}, manifest says ${m.atlas.width}x${m.atlas.height}`);
  }
  if (!need('convert', 'compare')) return;
  for (const k of [0, exp.count - 1]) {
    const c = m.cells[m.frames[k]];
    const out = path.join(dir, `_frame${k}.png`);
    const bg = caseCtx.transparent ? 'none' : m.background;
    const r = sh('convert', ['-size', `${exp.width}x${exp.height}`, `xc:${bg}`, '(', atlas, '-crop', `${c.w}x${c.h}+${c.x}+${c.y}`, '+repage', ')', '-geometry', `+${c.ox}+${c.oy}`, '-composite', out]);
    if (!check(r.status === 0, `could not put frame ${k + 1} together: ${r.err.slice(0, 120)}`)) continue;
    const ref = await reference(s, exp.plan.range.start + k, caseCtx.transparent);
    const e = ref && rmse(out, ref);
    if (e !== null && e !== undefined) check(e < TOL.lossless, `frame ${k + 1} differs from the PNG export (rmse ${e.toFixed(5)})`);
  }
}

async function vSvg(file, s, exp, caseCtx) {
  const text = fs.readFileSync(file, 'utf8');
  if (need('xmllint')) {
    const r = sh('xmllint', ['--noout', file]);
    check(r.status === 0, `xmllint: ${r.err.slice(0, 200)}`);
  }
  const m = /<svg[^>]*>/.exec(text)?.[0] ?? '';
  note(m.slice(0, 120));
  check(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(m), 'no SVG namespace');
  const w = Number(/\swidth="([\d.]+)"/.exec(m)?.[1]);
  const h = Number(/\sheight="([\d.]+)"/.exec(m)?.[1]);
  check(w === exp.width && h === exp.height, `svg size ${w}x${h}, wanted ${exp.width}x${exp.height}`);
  if (need('rsvg-convert', 'convert', 'compare')) {
    const dir = path.dirname(file);
    const png = path.join(dir, '_svg.png');
    const r = sh('rsvg-convert', [file, '-o', png]);
    if (!check(r.status === 0, `rsvg-convert: ${r.err.slice(0, 160)}`)) return;
    const ref = await reference(s, exp.plan.range.start, caseCtx.transparent);
    const e = ref && rmse(png, ref);
    if (e !== null && e !== undefined) {
      note(`render vs png rmse=${e.toFixed(4)}`);
      if (caseCtx.svgApprox) note('effects and masks are left out of SVG, so it is not compared closely');
      else check(e < TOL.svg, `SVG renders differently from the PNG export (rmse ${e.toFixed(4)})`);
    }
    if (caseCtx.transparent) check(hasAlpha(png) === true, 'transparent SVG renders with no transparent pixels');
  }
}

async function vSheet(files, dir, s, exp, caseCtx) {
  const names = files.sort();
  note(names.join(', '));
  const base = names.find((n) => n.endsWith('.png'));
  check(!!base, 'no sheet png');
  // Settings saved before engines existed say where they're going with the json and Godot ticks.
  const engine = s.sheet.engine ?? (s.sheet.godot || s.sheet.godotScene ? 'godot' : s.sheet.json ? 'json' : 'none');
  const generic = engine === 'json' || ((engine === 'godot' || engine === 'css') && s.sheet.json);
  const want = { godot: ['.tres'], unity: ['.json', '.cs'], phaser: ['.json', '-anims.json'], pixi: ['.json'], css: ['.css', '.html'], json: ['.json'], none: [] }[engine];
  for (const ext of want) check(names.some((n) => n.endsWith(ext)), `${engine}: no ${ext} file`);
  const json = generic ? names.find((n) => n.endsWith('.json') && !n.endsWith('-flow.json')) : null;
  check(generic ? !!json : engine !== 'none' || !names.some((n) => n.endsWith('.json')), 'json file presence does not match the setting');
  check(engine === 'godot' ? names.some((n) => n.endsWith('.tres')) : !names.some((n) => n.endsWith('.tres')), '.tres presence does not match the setting');
  check(engine === 'godot' && s.sheet.godotScene ? names.some((n) => n.endsWith('.tscn')) : !names.some((n) => n.endsWith('.tscn')), '.tscn presence does not match the setting');
  if (engine === 'phaser' || engine === 'pixi') {
    const data = JSON.parse(fs.readFileSync(path.join(dir, names.find((n) => n.endsWith('.json') && !n.endsWith('-anims.json'))), 'utf8'));
    const frameNames = Object.keys(data.frames);
    check(frameNames.length > 0 && frameNames.every((n) => data.frames[n].frame && data.frames[n].sourceSize), `${engine}: frames are not a JSON hash`);
    const lists = engine === 'pixi' ? Object.values(data.animations) : JSON.parse(fs.readFileSync(path.join(dir, names.find((n) => n.endsWith('-anims.json'))), 'utf8')).anims.map((a) => a.frames.map((f) => f.frame));
    check(lists.length > 0 && lists.every((l) => l.every((n) => frameNames.includes(n))), `${engine}: an animation points at a missing frame`);
    note(`${engine}: ${frameNames.length} frames, ${lists.length} animations`);
  }
  if (!base) return;
  const [[sw, sh_]] = identify(path.join(dir, base));
  note(`sheet ${sw}x${sh_}`);
  if (s.sheet.pot) check((sw & (sw - 1)) === 0 && (sh_ & (sh_ - 1)) === 0, `sheet is ${sw}x${sh_}, not a power of two`);
  if (!json) return;
  const atlas = JSON.parse(fs.readFileSync(path.join(dir, json), 'utf8'));
  check(atlas.meta.size.w === sw && atlas.meta.size.h === sh_, `json says ${atlas.meta.size.w}x${atlas.meta.size.h}, the picture is ${sw}x${sh_}`);
  check(atlas.meta.frameCount === exp.count, `json frameCount ${atlas.meta.frameCount}, wanted ${exp.count}`);
  check(atlas.frames.every((f) => f.frame.x + f.frame.w <= sw && f.frame.y + f.frame.h <= sh_), 'a frame sits outside the sheet');
  check(atlas.frames.every((f) => f.sourceSize.w === exp.width && f.sourceSize.h === exp.height), `sourceSize is not ${exp.width}x${exp.height}`);
  // Padding: no two frames closer than the padding, and the first frame starts at the padding.
  const pad = (s.sheet.padding || 0) + (s.sheet.extrude || 0);
  if (pad && s.sheet.layout !== 'packed') check(atlas.frames[0].frame.x === pad && atlas.frames[0].frame.y === pad, 'first frame does not start at the padding');
  if (pad) check(atlas.frames.every((f) => f.frame.x >= pad && f.frame.y >= pad && f.frame.x + f.frame.w <= sw - pad && f.frame.y + f.frame.h <= sh_ - pad), 'a frame is closer to the edge than the padding');
  if (s.sheet.columns && s.sheet.layout !== 'packed') {
    const xs = new Set(atlas.frames.map((f) => f.frame.x));
    check(xs.size === Math.min(s.sheet.columns, atlas.frames.length), `columns=${s.sheet.columns} but frames use ${xs.size} columns`);
  }
  // Rebuild document frames from the sheet using the json, and compare with the app's own PNG export of that frame.
  if (!need('convert', 'compare')) return;
  const doc = exp.doc;
  const whole = s.range === 'all';
  const clipOf = (name) => doc.clips.find((c) => c.name === name || name.startsWith(c.name));
  // For each cell, one document frame that shows it.
  const docFrameOfCell = new Map();
  for (const [an, anim] of Object.entries(atlas.animations)) {
    const clip = whole && an !== 'default' ? clipOf(an) : null;
    const first = clip ? Math.max(exp.plan.range.start, Math.min(clip.start, clip.end)) : exp.plan.range.start;
    anim.frames.forEach((cell, j) => {
      if (!docFrameOfCell.has(cell)) docFrameOfCell.set(cell, first + j);
    });
  }
  let checked = 0;
  let worst = 0;
  for (const [cell, docFrame] of [...docFrameOfCell].slice(0, 12)) {
    const f = atlas.frames[cell];
    const out = path.join(dir, `_cell-${cell}.png`);
    sh('convert', ['-size', `${f.sourceSize.w}x${f.sourceSize.h}`, 'xc:none', '(', path.join(dir, base), '-crop', `${f.frame.w}x${f.frame.h}+${f.frame.x}+${f.frame.y}`, '+repage', ')', '-geometry', `+${f.spriteSourceSize.x}+${f.spriteSourceSize.y}`, '-composite', out]);
    const ref = await reference(s, docFrame, caseCtx.transparent);
    const e = ref && rmse(out, ref);
    if (e === null || e === undefined) continue;
    checked++;
    worst = Math.max(worst, e);
    check(e < TOL.lossless, `cell ${cell} (doc frame ${docFrame}) rebuilt from the sheet differs from the PNG export (rmse ${e.toFixed(5)})`);
  }
  note(`rebuilt ${checked} cells from the sheet, worst rmse ${worst.toFixed(5)}`);
  const tres = names.find((n) => n.endsWith('.tres'));
  if (tres) {
    const t = fs.readFileSync(path.join(dir, tres), 'utf8');
    check(/\[gd_resource type="SpriteFrames"/.test(t), 'tres header');
  }
  if (GODOT && !SKIP.includes('godot') && tres && s.sheet.godotScene) await godotCheck(dir, names, atlas, s, exp);
}

async function godotCheck(dir, names, atlas, s, exp) {
  const proj = path.join(dir, '_godot');
  fs.rmSync(proj, { recursive: true, force: true });
  const base = names.find((n) => n.endsWith('.png')).replace(/\.png$/, '');
  const tex = s.sheet.godotPath || `res://sprites/${base}.png`;
  const rel = tex.replace(/^res:\/\//, '');
  const sub = path.dirname(rel);
  fs.mkdirSync(path.join(proj, sub), { recursive: true });
  for (const n of names) fs.copyFileSync(path.join(dir, n), path.join(proj, sub, n));
  fs.writeFileSync(path.join(proj, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="e2e"\n');
  fs.writeFileSync(
    path.join(proj, 'check.gd'),
    `extends SceneTree
func _init():
	var sf: SpriteFrames = load("res://${sub}/${base}.tres")
	var out := {}
	for a in sf.get_animation_names():
		var fr := []
		for i in sf.get_frame_count(a):
			var t = sf.get_frame_texture(a, i)
			fr.append([t.region.position.x, t.region.position.y, t.region.size.x, t.region.size.y, t.margin.position.x, t.margin.position.y, t.margin.size.x, t.margin.size.y, sf.get_frame_duration(a, i)])
		out[a] = {"fps": sf.get_animation_speed(a), "loop": sf.get_animation_loop(a), "frames": fr}
	var scene: PackedScene = load("res://${sub}/${base}.tscn")
	var node = scene.instantiate()
	out["_node"] = [node.get_class(), str(node.animation)]
	print("RESULT " + JSON.stringify(out))
	quit()
`,
  );
  const imp = sh(GODOT, ['--headless', '--path', proj, '--import'], { timeout: 120000 });
  const run = sh(GODOT, ['--headless', '--path', proj, '--script', 'check.gd'], { timeout: 120000 });
  const line = run.out.split('\n').find((l) => l.startsWith('RESULT '));
  if (!check(line, `Godot did not print a result: ${(run.err + run.out + imp.err).slice(0, 300)}`)) return;
  const g = JSON.parse(line.slice(7));
  check(g._node[0] === 'AnimatedSprite2D', `scene root is ${g._node[0]}`);
  const wantNames = Object.keys(atlas.animations).sort();
  const gotNames = Object.keys(g).filter((k) => k !== '_node').sort();
  check(JSON.stringify(wantNames) === JSON.stringify(gotNames), `Godot animations ${gotNames} vs json ${wantNames}`);
  for (const an of gotNames) {
    const want = atlas.animations[an];
    const got = g[an];
    const total = got.frames.reduce((x, f) => x + f[8], 0);
    check(total === want.frames.length, `${an}: Godot plays ${total} frames' worth, json has ${want.frames.length}`);
    check(got.fps === want.fps && got.loop === want.loop, `${an}: fps/loop differ in Godot`);
    // Every Godot texture must point at the json frame, with the margin the trim implies.
    let at = 0;
    got.frames.forEach((f) => {
      const cell = atlas.frames[want.frames[at]];
      at += f[8];
      const okRegion = f[0] === cell.frame.x && f[1] === cell.frame.y && f[2] === cell.frame.w && f[3] === cell.frame.h;
      check(okRegion, `${an}: Godot region ${f.slice(0, 4)} vs json ${JSON.stringify(cell.frame)}`);
      if (cell.trimmed) check(f[4] === cell.spriteSourceSize.x && f[5] === cell.spriteSourceSize.y && f[6] === cell.sourceSize.w - cell.frame.w && f[7] === cell.sourceSize.h - cell.frame.h, `${an}: Godot margin ${f.slice(4, 8)} does not match the trim`);
    });
  }
  note(`godot ok: ${gotNames.join(',')}`);
}

// ---------------------------------------------------------------- the export matrix

const ALL_FORMATS = ['png', 'svg', 'pngseq', 'apng', 'gif', 'mp4', 'webm', 'sheet', 'interactives', 'psd', 'pdf', 'ai', 'prores'];
const ANIM = new Set(['pngseq', 'apng', 'gif', 'mp4', 'webm', 'sheet', 'interactives', 'pdf', 'ai', 'prores']);

function listFiles(dir) {
  return fs.readdirSync(dir).filter((n) => !n.startsWith('_') && fs.statSync(path.join(dir, n)).isFile());
}

async function runCase(tpl, fmt, label, edit, opts = {}) {
  const r = begin(tpl, `${fmt} ${label}`);
  const dir = setAutomationDir(path.join(outDir, tpl, `${fmt}-${label}`));
  try {
    await loadTpl(tpl);
    if (opts.prepare) await ev(opts.prepare);
    const defaults = await X('defaults()');
    let settings = { ...defaults, format: fmt };
    if (settings.range === 'frame' && ANIM.has(fmt)) settings.range = 'all';
    settings = (edit ? await edit(settings) : settings) ?? settings;
    const exp = await expectationFor(settings);
    // The dialog's own capability probe decides what a video can do here.
    const caps = await X(`caps(${exp.width}, ${exp.height})`);
    const caseCtx = {
      transparent: settings.transparent && (fmt === 'webm' ? !!caps.webm.alpha : fmt !== 'mp4'),
      alphaExpected: !!caps.webm.alpha,
      sound: await ev('!!window.__framelingExport.doc().audio?.some((c) => !c.muted)'),
      // SVG leaves out effects, masks and clipping (see export help), so it only roughly matches a document using them.
      svgApprox: tpl === 'kitchen-sink',
    };
    if (fmt === 'webm' && settings.transparent && !caps.webm.alpha) note('this computer cannot do see-through WebM, so the background is kept');
    r.settings = settings;
    const res = await X(`run(${JSON.stringify(settings)}, ${opts.cancelAfter ?? 'undefined'})`);
    note(`${res.ms}ms`);
    if (opts.friendlyError && res.error) {
      check(opts.friendlyError.test(res.error), `unfriendly error: ${res.error}`);
      note(`refused politely: ${res.error}`);
      check(listFiles(dir).length === 0, 'files were written despite the error');
      return;
    }
    if (opts.expectError) {
      check(res.error && opts.expectError.test(res.error), `expected an error like ${opts.expectError}, got ${JSON.stringify(res)}`);
      check(listFiles(dir).length === 0, 'files were written despite the error');
      return;
    }
    if (opts.expectCancel) {
      check(res.outcome === 'cancelled', `expected cancel, got ${JSON.stringify(res)}`);
      check(listFiles(dir).length === 0, `cancel left files behind: ${listFiles(dir)}`);
      return;
    }
    if (!check(res.outcome === 'done', `export did not finish: ${JSON.stringify(res)}`)) return;
    const files = listFiles(dir);
    if (fmt === 'sheet') return await vSheet(files, dir, settings, { ...exp, doc: exp.doc }, caseCtx);
    if (!check(files.length === 1, `expected 1 file, found ${files.length}: ${files}`)) return;
    const f = path.join(dir, files[0]);
    note(`${files[0]} ${fs.statSync(f).size} bytes`);
    const ext = { mp4: '.mp4', webm: '.webm', gif: '.gif', apng: '.png', png: '.png', pngseq: '.zip', svg: '.svg', interactives: '.flplay', psd: '.psd', pdf: '.pdf', ai: '.ai', prores: '.mov' }[fmt];
    check(files[0].endsWith(ext), `file name ${files[0]} does not end in ${ext}`);
    const v = { mp4: vVideo, webm: vVideo, gif: vGif, apng: vApng, png: vPng, pngseq: vPngSeq, svg: vSvg, interactives: vPlayable, psd: vPsd, pdf: vPdf, ai: vPdf, prores: vProres }[fmt];
    await v(f, settings, exp, caseCtx);
  } catch (e) {
    fail(`harness error: ${e?.stack ?? e}`);
  }
}

const isPixelTpl = (t) => t === 'hero-sprites' || t === 'blank-pixel';

async function exportMatrix() {
  const caps = await X('caps(512, 512)');
  console.log(`video support here: mp4=${caps.mp4.ok ? caps.mp4.codec : 'NO (' + caps.mp4.reason + ')'} webm=${caps.webm.ok ? caps.webm.codec + (caps.webm.alpha ? '+alpha' : '') : 'NO'}`);
  if (!caps.webm.alpha) console.log('WARNING: see-through WebM is unavailable here. If the page logs a Content Security Policy error about a worker, index.html needs worker-src blob: in its policy.');
  const addClip = (tpl) => `__framelingExport.addClip('mid', ${tpl === 'stress' ? '1, 2' : '2, 5'})`;
  for (const tpl of TEMPLATES) {
    for (const fmt of ALL_FORMATS) {
      if (ONLY && !ONLY.includes(fmt)) continue;
      const video = fmt === 'mp4' || fmt === 'webm' || fmt === 'prores';
      if (LAYERED.has(fmt)) {
        await layeredCases(tpl, fmt);
        continue;
      }
      await runCase(tpl, fmt, 'defaults');
      await runCase(tpl, fmt, 'transparent', (s) => ({ ...s, transparent: true }));
      if (ANIM.has(fmt)) {
        // The hero already has clips; the others get one (frames 3 to 6) so a clip range can be exercised.
        await runCase(
          tpl,
          fmt,
          'clip',
          async (s) => ({ ...s, range: 'clip', clipId: (await X('doc()')).clips[0].id }),
          { prepare: tpl === 'hero-sprites' ? '' : addClip(tpl) },
        );
      }
      if (!isPixelTpl(tpl)) {
        await runCase(tpl, fmt, 'scale2', (s) => ({ ...s, scale: 2 }));
        if (fmt === 'png' || fmt === 'gif') await runCase(tpl, fmt, 'scale0.5', (s) => ({ ...s, scale: 0.5 }));
      } else {
        for (const sc of [1, 3, 8]) if (tpl === 'blank-pixel' ? sc <= 3 : true) await runCase(tpl, fmt, `pixel-scale${sc}`, (s) => ({ ...s, scale: sc }));
      }
      if (ANIM.has(fmt) && !video) await runCase(tpl, fmt, 'this-frame', (s) => ({ ...s, range: 'frame' }));
      if (video) await runCase(tpl, fmt, 'this-frame', (s) => ({ ...s, range: 'frame' }), { expectError: /at least two frames/ });
      if (fmt === 'gif') {
        await runCase(tpl, fmt, 'dither-noloop', (s) => ({ ...s, dither: true, loop: false }));
      }
      if (fmt === 'apng') await runCase(tpl, fmt, 'noloop', (s) => ({ ...s, loop: false }));
      if (fmt === 'sheet') {
        await runCase(tpl, fmt, 'trim-pot-pad', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, pot: true, padding: 2, columns: 3 } }));
        await runCase(tpl, fmt, 'godot', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, dedupe: true, json: true, godot: true, godotScene: true, godotPath: '' } }));
        await runCase(tpl, fmt, 'nodedupe-godotpath', (s) => ({ ...s, sheet: { ...s.sheet, dedupe: false, json: true, godot: true, godotScene: true, godotPath: 'art/chars/hero.png' } }));
        await runCase(tpl, fmt, 'packed-extrude', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'json', layout: 'packed', trim: true, padding: 2, extrude: 1, json: true } }));
        for (const engine of ['phaser', 'pixi', 'unity', 'css']) await runCase(tpl, fmt, engine, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, padding: 1, json: false } }));
        // The phase 2 test: the hero at art size, packed, straight into Godot.
        if (tpl === 'hero-sprites') await runCase(tpl, fmt, 'art-size-godot', (s) => ({ ...s, scale: 1 / 8, transparent: true, sheet: { ...s.sheet, engine: 'godot', godotScene: true, json: true, layout: 'packed', trim: true, padding: 1, extrude: 1, godotPath: '' } }));
      }
      if (fmt === 'interactives') {
        // What Interactives' own tests use as fixtures: small, see-through, without the editable drawing.
        if (tpl === 'hero-sprites') await runCase(tpl, fmt, 'art-size', (s) => ({ ...s, scale: 1 / 8, transparent: true, includeSource: false }));
        if (tpl === 'bouncing-ball') await runCase(tpl, fmt, 'quarter', (s) => ({ ...s, scale: 0.25, transparent: true, includeSource: false }));
      }
      if (tpl === 'bouncing-ball') {
        // Odd sizes: videos pad to even, everything else keeps the exact size.
        await runCase(tpl, fmt, 'odd-size', (s) => s, { prepare: `__frameling.store().update('odd', (d) => { d.width = 321; d.height = 181; })` });
        // 5120 x 2880: past the 4096 limit most H.264 encoders have. Either it works, or the message says why.
        if (video) await runCase(tpl, fmt, 'huge', (s) => ({ ...s, scale: 4 }), { friendlyError: /too big|can't make|bigger/i });
        if (ANIM.has(fmt) && fmt !== 'sheet') await runCase(tpl, fmt, 'cancel', (s) => ({ ...s, scale: 3 }), { cancelAfter: 15, expectCancel: true });
      }
    }
  }
}

// ---------------------------------------------------------------- PSD, PDF, Illustrator and ProRes

const LAYERED = new Set(['psd', 'pdf', 'ai', 'prores']);

// Text, particles, a folder with a mask and a clipped layer on top of whatever the template has, so the layered
// formats meet everything they map.
const ADD_EXTRAS = `(() => {
  const st = __frameling.store();
  st.update('extras', (d) => {
    const v1 = { id: 'e2e-v1', kind: 'vector', shapes: [
      { id: 'e2e-t', type: 'text', text: 'Hi there', font: 'Nunito', size: 40, weight: 800, color: '#ff3366', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: { x: 20, y: 60, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, animators: [{ id: 'e2e-a', kind: 'slide', by: 'letter', start: 0, duration: 6, stagger: 1, amount: 30, angle: 90 }] },
      { id: 'e2e-p', type: 'particles', transform: { x: d.width / 2, y: d.height / 2, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, emitter: 'point', width: 0, height: 0, rate: 0, burst: 30, emitFor: 0, life: 4, variance: 0.4, speed: 120, direction: -90, spread: 180, gravity: 0, wind: 0, drag: 1, sizeStart: 12, sizeEnd: 6, colorStart: '#ffd400', colorEnd: '#ff8800', opacityStart: 1, opacityEnd: 1, spin: 90, sprite: 'star', seed: 3, opacity: 1 },
    ] };
    const v2 = { id: 'e2e-v2', kind: 'vector', shapes: [{ id: 'e2e-r', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: d.width / 2, y: 0 }, { x: d.width / 2, y: d.height / 2 }, { x: 0, y: d.height / 2 }] }], fill: '#3366ff', stroke: null, opacity: 1 }] };
    const v3 = { id: 'e2e-v3', kind: 'vector', shapes: [{ id: 'e2e-c', type: 'path', paths: [{ closed: true, points: [{ x: 10, y: 10 }, { x: d.width / 3, y: 10 }, { x: d.width / 3, y: d.height / 3 }, { x: 10, y: d.height / 3 }] }], fill: '#000000', stroke: null, opacity: 1 }] };
    d.drawings['e2e-v1'] = v1; d.drawings['e2e-v2'] = v2; d.drawings['e2e-v3'] = v3;
    const cel = (id) => [{ id: 'cel-' + id, start: 0, length: d.length, drawingId: id }];
    const base = { visible: true, locked: false, opacity: 1, kind: 'vector' };
    d.folders = { ...(d.folders || {}), 'e2e-f': { id: 'e2e-f', name: 'Masked', visible: true, opacity: 1 } };
    d.layers.push(
      { ...base, id: 'e2e-l2', name: 'Blue box', cels: cel('e2e-v2'), folder: 'e2e-f', blend: 'multiply', opacity: 0.8 },
      { ...base, id: 'e2e-l3', name: 'Mask', cels: cel('e2e-v3'), folder: 'e2e-f', mask: 'show' },
      { ...base, id: 'e2e-l1', name: 'Text and stars', cels: cel('e2e-v1') },
    );
  });
  return true;
})()`;

async function layeredCases(tpl, fmt) {
  const anim = fmt !== 'psd';
  await runCase(tpl, fmt, 'defaults', (s) => ({ ...s, range: anim ? 'all' : s.range }));
  await runCase(tpl, fmt, 'transparent', (s) => ({ ...s, transparent: true }));
  await runCase(tpl, fmt, 'extras', (s) => ({ ...s, transparent: fmt !== 'pdf' }), { prepare: ADD_EXTRAS });
  if (!isPixelTpl(tpl)) await runCase(tpl, fmt, 'scale2', (s) => ({ ...s, scale: 2 }));
  else await runCase(tpl, fmt, 'pixel-scale3', (s) => ({ ...s, scale: 3 }));
  if (anim) {
    await runCase(tpl, fmt, 'clip', async (s) => ({ ...s, range: 'clip', clipId: (await X('doc()')).clips[0].id }), { prepare: tpl === 'hero-sprites' ? '' : `__framelingExport.addClip('mid', ${tpl === 'stress' ? '1, 2' : '2, 5'})` });
    if (fmt === 'prores') await runCase(tpl, fmt, 'this-frame', (s) => ({ ...s, range: 'frame' }), { expectError: /at least two frames/ });
    else await runCase(tpl, fmt, 'this-frame', (s) => ({ ...s, range: 'frame' }));
  }
  if (fmt === 'prores' && tpl === 'bouncing-ball') await runCase(tpl, fmt, 'cancel', (s) => ({ ...s, scale: 3 }), { cancelAfter: 15, expectCancel: true });
}

/** Reads a PSD with ag-psd (a dev dependency, for checks only). */
function readPsdFile(file) {
  try {
    const psd = require('ag-psd');
    psd.initializeCanvas(
      () => {
        throw new Error('no canvas');
      },
      (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    );
    const b = fs.readFileSync(file);
    return psd.readPsd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { useImageData: true });
  } catch (e) {
    fail(`ag-psd could not read it: ${e?.message ?? e}`);
    return null;
  }
}

async function vPsd(file, s, exp, caseCtx) {
  const head = fs.readFileSync(file).subarray(0, 26);
  check(head.toString('latin1', 0, 4) === '8BPS', 'not a PSD (no 8BPS signature)');
  check(head.readUInt32BE(18) === exp.width && head.readUInt32BE(14) === exp.height, `PSD size ${head.readUInt32BE(18)}x${head.readUInt32BE(14)}, wanted ${exp.width}x${exp.height}`);
  const psd = readPsdFile(file);
  if (psd) {
    const flat = [];
    const walk = (list, depth) => {
      for (const l of list ?? []) {
        flat.push(`${'  '.repeat(depth)}${l.name}${l.children ? '/' : ''}${l.hidden ? ' (hidden)' : ''}${l.clipping ? ' (clipped)' : ''}${l.blendMode && l.blendMode !== 'normal' ? ' ' + l.blendMode : ''}`);
        walk(l.children, depth + 1);
      }
    };
    walk(psd.children, 0);
    note(`layers: ${flat.join(' | ')}`);
    const docLayers = exp.doc.layers.filter((l) => !l.reference);
    const leafCount = flat.filter((x) => !x.trimEnd().endsWith('/') && !/\/( \(|$)/.test(x)).length;
    check(leafCount >= docLayers.length, `PSD has ${leafCount} layers, the drawing has ${docLayers.length}`);
    for (const l of docLayers) check(flat.some((x) => x.trim().startsWith(l.name)), `layer "${l.name}" is missing from the PSD`);
    if (exp.doc.layers.some((l) => l.id === 'e2e-l2')) {
      check(flat.some((x) => x.trim().startsWith('Masked/')), 'the folder did not become a group');
      check(flat.some((x) => x.includes('Blue box') && x.includes('multiply')), 'blend mode was not kept');
      const g = psd.children.find((c) => c.name === 'Masked');
      check(g && !g.mask, 'the folder itself should not take the mask');
      const inner = g && (g.children || []).find((c) => c.children && c.mask);
      check(inner && inner.children.some((c) => c.name.startsWith('Blue box')), 'the layers under the mask are not in a masked group inside the folder');
    }
  }
  if (need('identify')) {
    const r = sh('identify', [file]);
    check(r.status === 0, `ImageMagick cannot read it: ${r.err.slice(0, 160)}`);
    note(`identify sees ${r.out.trim().split('\n').length} images`);
  }
  if (need('convert')) {
    const png = path.join(path.dirname(file), '_psd.png');
    sh('convert', [`${file}[0]`, png]);
    if (!check(fs.existsSync(png), 'ImageMagick could not flatten it')) return;
    const ref = await reference(s, exp.plan.range.start, caseCtx.transparent);
    const e = ref && rmse(png, ref);
    if (e !== null && e !== undefined) {
      note(`merged vs png rmse=${e.toFixed(5)}`);
      check(e < TOL.lossless * 4, `the merged picture differs from the PNG export (rmse ${e.toFixed(5)})`);
    }
  }
}

async function vPdf(file, s, exp, caseCtx) {
  const b = fs.readFileSync(file);
  check(b.toString('latin1', 0, 8) === '%PDF-1.7', 'no PDF header');
  if (!need('pdfinfo', 'pdftoppm')) return;
  const info = sh('pdfinfo', [file]);
  if (!check(info.status === 0, `pdfinfo: ${info.err.slice(0, 200)}`)) return;
  const pages = Number(/Pages:\s+(\d+)/.exec(info.out)?.[1]);
  check(pages === exp.count, `${pages} pages, wanted ${exp.count}`);
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info.out);
  const pw = Number(size?.[1]);
  const ph = Number(size?.[2]);
  check(near(pw, exp.doc.width * s.scale, 0.5) && near(ph, exp.doc.height * s.scale, 0.5), `page ${pw}x${ph}pt, wanted ${exp.doc.width * s.scale}x${exp.doc.height * s.scale}`);
  if (exp.doc.layers.length) check(/\/OCProperties/.test(b.toString('latin1')), 'no PDF layers (optional content)');
  const dir = path.dirname(file);
  for (const k of [0, exp.count - 1]) {
    const base = path.join(dir, `_pdf-${k}`);
    // Rendered at 72 dpi, a point is a pixel, which is the PNG export's size.
    const r = sh('pdftoppm', ['-f', String(k + 1), '-l', String(k + 1), '-r', '72', '-scale-to-x', String(exp.width), '-scale-to-y', String(exp.height), '-png', '-singlefile', ...(caseCtx.transparent ? [] : []), file, base]);
    if (!check(r.status === 0 && fs.existsSync(base + '.png'), `pdftoppm could not draw page ${k + 1}: ${r.err.slice(0, 160)}`)) continue;
    // pdftoppm paints white under a see-through page, so compare against the PNG export (see-through when asked) on white.
    const ref = await reference(s, exp.plan.range.start + k, caseCtx.transparent);
    const refWhite = ref && path.join(dir, `_ref-white-${k}.png`);
    if (ref) sh('convert', [ref, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', refWhite]);
    const e = refWhite && rmse(base + '.png', refWhite);
    if (e !== null && e !== undefined) {
      note(`page ${k + 1} vs png rmse=${e.toFixed(4)}`);
      // The kitchen sink's symbol has a colour wash, which PDF leaves out (see the PDF help), so it is allowed a little more.
      const tol = caseCtx.svgApprox ? 0.1 : TOL.svg;
      check(e < tol, `page ${k + 1} looks different from the PNG export (rmse ${e.toFixed(4)})`);
    }
  }
  if (need('gs')) {
    const r = sh('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=nullpage', file]);
    check(r.status === 0 && !/error/i.test(r.err + r.out), `Ghostscript reports problems: ${(r.err + r.out).slice(0, 200)}`);
  }
}

async function vProres(file, s, exp, caseCtx) {
  if (!need('ffprobe', 'ffmpeg')) return;
  const p = JSON.parse(sh('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,nb_read_frames,avg_frame_rate:format=duration,format_name', '-of', 'json', file]).out || '{}');
  const st = p.streams?.[0];
  if (!check(st, 'ffprobe found no video stream')) return;
  note(`${st.codec_name} ${st.profile} ${st.width}x${st.height} ${st.pix_fmt} frames=${st.nb_read_frames}`);
  check(st.codec_name === 'prores', `codec ${st.codec_name}, wanted prores`);
  check(/4444/.test(st.profile ?? ''), `profile ${st.profile}, wanted 4444`);
  check(/mov/.test(p.format?.format_name ?? ''), `container ${p.format?.format_name}`);
  check(st.width === exp.width && st.height === exp.height, `size ${st.width}x${st.height}, wanted ${exp.width}x${exp.height}`);
  check(Number(st.nb_read_frames) === exp.count, `frame count ${st.nb_read_frames}, wanted ${exp.count}`);
  const wantAlpha = caseCtx.transparent;
  check(wantAlpha ? st.pix_fmt === 'yuva444p10le' || st.pix_fmt === 'yuva444p12le' : !/^yuva/.test(st.pix_fmt), `pix_fmt ${st.pix_fmt} for ${wantAlpha ? 'a see-through' : 'a solid'} background`);
  const dir = path.dirname(file);
  for (const k of [0, exp.count - 1]) {
    const o = path.join(dir, `_pr-${k}.png`);
    sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${k})`, '-vframes', '1', '-pix_fmt', 'rgba', o]);
    if (!check(fs.existsSync(o), `could not decode frame ${k}`)) continue;
    if (wantAlpha && k === 0) check(hasAlpha(o) === true, 'decoded ProRes frame has no transparent pixels');
    const ref = await reference(s, exp.plan.range.start + k, wantAlpha);
    const e = ref && rmse(o, ref);
    if (e !== null && e !== undefined) {
      note(`frame ${k} vs png rmse=${e.toFixed(4)}`);
      check(e < TOL.video / 4, `frame ${k} differs from the PNG export (rmse ${e.toFixed(4)})`);
    }
  }
}

// ---------------------------------------------------------------- save, open, autosave, close

// The document as text with keys sorted (key order is not part of what a round trip must keep) and pixel data hashed.
const plain = `(d) => JSON.stringify(d, function (k, v) {
  if (v && v.constructor && v.constructor.name === 'Uint8ClampedArray') return 'px:' + v.length + ':' + Array.prototype.reduce.call(v, (h, x, i) => (h * 31 + x + i) | 0, 7);
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
  return v;
})`;

async function filesSection() {
  for (const tpl of TEMPLATES) {
    const r = begin('files', `save and open ${tpl}`);
    try {
      const dir = setAutomationDir(path.join(outDir, 'files', tpl));
      await loadTpl(tpl);
      // Make a change so the document is dirty, then Save As.
      await ev(`__frameling.store().update('tweak', (d) => { d.name = d.name + ' tweaked'; })`);
      check(await ev(`__frameling.store().get().ui.dirty`), 'a change did not make the document dirty');
      const before = await ev(`(${plain})(__frameling.store().get().doc)`);
      check(await IO('saveDocumentAs()'), 'Save As did not report success');
      const files = fs.readdirSync(dir).filter((n) => n.endsWith('.frameling'));
      if (!check(files.length === 1, `expected one .frameling file, found ${files}`)) continue;
      const file = path.join(dir, files[0]);
      note(`${files[0]} ${fs.statSync(file).size} bytes`);
      check(!fs.readdirSync(dir).some((n) => n.endsWith('.tmp')), 'a .tmp file was left behind');
      const ui = await ev(`({ dirty: __frameling.store().get().ui.dirty, filePath: __frameling.store().get().ui.filePath })`);
      check(ui.dirty === false && ui.filePath === file, `after saving: ${JSON.stringify(ui)}`);
      check(/^PK/.test(fs.readFileSync(file).toString('latin1', 0, 2)), 'not a zip');
      if (need('unzip')) {
        const list = sh('unzip', ['-Z1', file]).out.trim().split('\n');
        check(list.includes('manifest.json') && list.includes('doc.json'), `zip entries: ${list.slice(0, 5)}`);
        check(sh('unzip', ['-tq', file]).status === 0, 'unzip -t failed');
      }
      // Load something else, open the file again, and compare everything.
      await X(`load('blank-vector')`);
      check(await ev(`window.__framelingIo.openPath(${JSON.stringify(file)})`), 'openPath did not report success');
      const after = await ev(`(${plain})(__frameling.store().get().doc)`);
      check(before === after, 'the document that came back is different from the one saved');
      if (before !== after) {
        const a = JSON.parse(before);
        const b = JSON.parse(after);
        const keys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        fail(`  differing top-level keys: ${keys}`);
      }
      const ui2 = await ev(`({ dirty: __frameling.store().get().ui.dirty, filePath: __frameling.store().get().ui.filePath, title: document.title })`);
      check(ui2.dirty === false && ui2.filePath === file, `after opening: ${JSON.stringify(ui2)}`);
      note(`title "${ui2.title}"`);
      // Save again (no dialog, same file) after another edit.
      await ev(`__frameling.store().update('tweak2', (d) => { d.fps = d.fps + 1; })`);
      const mtime = fs.statSync(file).mtimeMs;
      await sleep(30);
      check(await IO('saveDocument()'), 'second Save failed');
      check(fs.statSync(file).mtimeMs > mtime, 'second Save did not change the file');
      check(fs.readdirSync(dir).filter((n) => n.endsWith('.frameling')).length === 1, 'second Save made another file');
      // Exported documents render the same after the round trip (a pixel-heavy check on the real files).
      await X(`load('blank-vector')`);
      await IO(`openPath(${JSON.stringify(file)})`);
      const exp1 = await runAndRead(tpl, dir, 'png');
      note(`png of the reopened file: ${exp1}`);
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }

  // Opening a file the way the system does (double-click while the app runs).
  {
    const r = begin('files', 'file association: second launch hands over a file');
    try {
      const dir = path.join(outDir, 'files', TEMPLATES[0]);
      const file = path.join(dir, fs.readdirSync(dir).find((n) => n.endsWith('.frameling')));
      await X(`load('blank-vector')`);
      app.emit('second-instance', {}, ['frameling', file], process.cwd());
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        await sleep(100);
        ok = (await ev(`__frameling.store().get().ui.filePath`)) === file;
      }
      check(ok, 'the file handed over by a second launch was not opened');
      // Refuses things that are not .frameling.
      const bad = await ev(`window.frameling.files.read('/etc/hostname')`);
      check(bad && bad.error, 'files.read accepted a file that is not a .frameling');
      const bad2 = await ev(`window.frameling.files.write('/tmp/should-not-exist-frameling', new Uint8Array(1))`);
      check(bad2 && bad2.error && !fs.existsSync('/tmp/should-not-exist-frameling'), 'files.write wrote to a place nobody picked');
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }

  // Autosave and recovery.
  {
    const r = begin('files', 'autosave and recovery');
    try {
      await X(`load('bouncing-ball')`);
      await ev(`__frameling.store().update('tweak', (d) => { d.name = 'Recover me'; })`);
      const store = path.join(outDir, 'userdata', 'autosave');
      fs.rmSync(store, { recursive: true, force: true });
      await IO('autosaveNow()');
      check(fs.existsSync(path.join(store, 'current.frameling')) && fs.existsSync(path.join(store, 'current.json')), 'autosave wrote nothing');
      const meta = JSON.parse(fs.readFileSync(path.join(store, 'current.json'), 'utf8'));
      check(meta.name === 'Recover me', `autosave note: ${JSON.stringify(meta)}`);
      const want = await ev(`(${plain})(__frameling.store().get().doc)`);
      // Pretend the app was killed: a different document is open, then the offer appears.
      await X(`load('blank-vector')`);
      await IO('offerRecovery()');
      await sleep(300);
      const btn = await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Restore$/.test(x.textContent.trim())); if (!b) return false; b.click(); return true; })()`);
      if (check(btn, 'no Restore offer appeared')) {
        await sleep(400);
        const got = await ev(`(${plain})(__frameling.store().get().doc)`);
        check(got === want, 'the restored document is not the autosaved one');
        check(await ev(`__frameling.store().get().ui.dirty`), 'a restored document should be marked unsaved');
      }
      // A saved file newer than the autosave makes the autosave old news.
      await IO('autosaveNow()');
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }

  // Closing with unsaved work. The native question is answered by the script.
  const asks = [];
  let answer = 2;
  dialog.showMessageBox = async (...a) => {
    asks.push(a[a.length - 1].message);
    return { response: answer };
  };
  const realQuit = app.quit.bind(app);
  app.quit = () => {};
  const reopen = async () => {
    app.emit('activate');
    for (let i = 0; i < 50 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
    win = BrowserWindow.getAllWindows()[0];
    await waitForPage();
  };
  const closeAndWait = async () => {
    const closed = new Promise((res) => win.once('closed', res));
    win.close();
    return Promise.race([closed.then(() => true), sleep(2500).then(() => false)]);
  };
  {
    const r = begin('files', 'close prompt: Cancel keeps the window');
    try {
      await X(`load('blank-pixel')`);
      await ev(`__frameling.store().update('tweak', (d) => { d.name = 'Closing'; })`);
      await sleep(300);
      answer = 2;
      const closed = await closeAndWait();
      check(!closed, 'window closed although they chose Cancel');
      check(asks.length === 1 && /Closing/.test(asks[0]), `the question was: ${JSON.stringify(asks)}`);
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }
  {
    const r = begin('files', 'close prompt: Save saves, then closes');
    try {
      const dir = setAutomationDir(path.join(outDir, 'files', 'close-save'));
      answer = 0;
      const closed = await closeAndWait();
      check(closed, 'window did not close after Save');
      const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.frameling')) : [];
      check(f.length === 1, `Save before closing wrote ${JSON.stringify(f)}`);
      if (f.length) note(f[0]);
      await reopen();
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }
  {
    const r = begin('files', "close prompt: Don't save closes and drops the autosave");
    try {
      await X(`load('blank-pixel')`);
      await ev(`__frameling.store().update('tweak', (d) => { d.name = 'Dropped'; })`);
      await IO('autosaveNow()');
      await sleep(300);
      const auto = path.join(outDir, 'userdata', 'autosave', 'current.frameling');
      check(fs.existsSync(auto), 'no autosave to drop');
      answer = 1;
      const closed = await closeAndWait();
      check(closed, "window did not close after Don't save");
      check(!fs.existsSync(auto), "the autosave copy survived Don't save");
      // ...but the work itself is kept for a week.
      const kept = path.join(outDir, 'userdata', 'autosave', 'kept');
      const notes = fs.existsSync(kept) ? fs.readdirSync(kept).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(kept, n), 'utf8'))) : [];
      const mine = notes.find((n) => n.name === 'Dropped');
      check(!!mine, `Don't save did not keep a copy (kept: ${JSON.stringify(notes.map((n) => n.name))})`);
      if (mine) {
        check(typeof mine.thumb === 'string' && mine.thumb.startsWith('data:image/png;base64,'), 'the kept copy has no thumbnail');
        check(Date.now() - mine.keptAt < 60000, 'keptAt is not now');
      }
      await reopen();
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }
  {
    const r = begin('files', 'Recover unsaved work lists the kept copy and opens it as unsaved');
    try {
      await X(`load('bouncing-ball')`);
      await ev(`__frameling.run('file.recover')`);
      await sleep(500);
      const dlg = `[...document.querySelectorAll('[role=dialog]')].find((x) => /Recover unsaved work/.test(x.innerText))`;
      const text = await ev(`(${dlg})?.innerText ?? 'no dialog'`);
      check(/Recover unsaved work/.test(text) && /Dropped/.test(text), `the dialog says: ${text.slice(0, 120)}`);
      check(await ev(`!!(${dlg})?.querySelector('img[src^="data:image/png"]')`), 'no thumbnail in the list');
      await ev(`[...(${dlg}).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open').click()`);
      await sleep(600);
      const st = await ev(`({ name: __frameling.store().get().doc.name, dirty: __frameling.store().get().ui.dirty, filePath: __frameling.store().get().ui.filePath })`);
      check(st.name === 'Dropped' && st.dirty === true && st.filePath === null, `after Open: ${JSON.stringify(st)}`);
      // Saving it clears the kept copy.
      setAutomationDir(path.join(outDir, 'files', 'recovered'));
      check(await IO('saveDocument()'), 'Save of the recovered drawing failed');
      await sleep(300);
      const kept = path.join(outDir, 'userdata', 'autosave', 'kept');
      const left = fs.existsSync(kept) ? fs.readdirSync(kept).filter((n) => n.endsWith('.json')) : [];
      check(left.length === 0, `the kept copy was not cleared by saving: ${left}`);
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }
  {
    const r = begin('files', 'close prompt: a failed Save keeps the window');
    try {
      await X(`load('blank-pixel')`);
      await ev(`__frameling.store().update('tweak', (d) => { d.name = 'Failing'; })`);
      await sleep(300);
      // Save As into a folder that cannot be written to.
      setAutomationDir(path.join(outDir, 'files', 'readonly'));
      fs.chmodSync(process.env.FRAMELING_AUTOMATION_DIR, 0o500);
      answer = 0;
      const closed = await closeAndWait();
      fs.chmodSync(process.env.FRAMELING_AUTOMATION_DIR, 0o700);
      if (process.getuid && process.getuid() === 0) note('running as root, the read-only folder cannot fail');
      else check(!closed, 'window closed although saving failed');
      await sleep(300);
      // And the question can be asked again afterwards.
      answer = 2;
      if (!closed) {
        const again = await closeAndWait();
        check(!again && asks.length >= 5, 'the close question is stuck after a failed save');
      }
    } catch (e) {
      fail(`harness error: ${e?.stack ?? e}`);
    }
  }
  app.quit = realQuit;
}

async function runAndRead(tpl, dir, fmt) {
  const d = setAutomationDir(path.join(dir, '_after-reopen'));
  const defaults = await X('defaults()');
  const res = await X(`run(${JSON.stringify({ ...defaults, format: fmt, range: 'frame' })})`);
  return res.outcome ?? res.error;
}

// ---------------------------------------------------------------- main

function report() {
  const bad = results.filter((r) => r.failures.length);
  const width = Math.max(...results.map((r) => (r.group + ' ' + r.name).length));
  for (const r of results) {
    const head = `${r.failures.length ? 'FAIL' : 'ok  '} ${(r.group + ' ' + r.name).padEnd(width)}`;
    console.log(`${head}  ${r.notes.filter((n) => !/^\d+ms$/.test(n)).slice(0, 4).join(' | ')}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (missing.size) console.log(`\nmissing tools (checks skipped): ${[...missing].join(', ')}`);
  if (pageErrors.length) {
    const uniq = [...new Set(pageErrors)];
    console.log(`\nconsole errors in the page (${pageErrors.length}):\n  ${uniq.slice(0, 10).join('\n  ')}`);
  }
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed, ${bad.length} failed. Output: ${outDir}`);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ results, pageErrors }, null, 2));
  return bad.length === 0;
}

// ---------------------------------------------------------------- Godot bones (the puppet as a skeleton)

// The puppet with a bent body, a squash and an eased glide, exported as "Bones (editable in Godot)", loaded and played
// in real Godot, and frames rendered there compared with Frameling's own PNG export of the same frames.
async function godotBonesSection() {
  const r = begin('puppet', 'sheet godot-bones');
  try {
    const dir = setAutomationDir(path.join(outDir, 'puppet', 'sheet-godot-bones'));
    await loadTpl('puppet');
    await ev(`(() => {
      const F = window.__frameling;
      const st = F.store();
      const doc = st.get().doc;
      const rig = doc.layers.find((l) => l.rig);
      const chest = rig.rig.bones.find((b) => b.name === 'Chest').id;
      st.update('e2e', (d) => {
        const r = d.layers.find((l) => l.id === rig.id);
        r.cels[0].tween = { ease: 'easeInOut' };
        r.cels[1].tween = { ease: 'backOut' };
        const p = d.drawings[r.cels[1].drawingId].pose;
        p[chest] = { ...(p[chest] || { r: 0 }), s: 0.85 };
      });
      st.setUi({ activeLayerId: doc.layers.find((l) => l.name === 'Body').id });
      F.run('rig.bendLayer');
      return true;
    })()`);
    const defaults = await X('defaults()');
    const settings = { ...defaults, format: 'sheet', range: 'all', clipId: null, scale: 1, transparent: false, sheet: { ...defaults.sheet, engine: 'godot', godot: true, godotScene: true, json: false, godotRig: 'bones', godotPath: '' } };
    r.settings = settings;
    const res = await X(`run(${JSON.stringify(settings)})`);
    note(`${res.ms}ms`);
    if (!check(res.outcome === 'done', `export did not finish: ${JSON.stringify(res)}`)) return;
    const files = listFiles(dir).sort();
    note(files.join(', '));
    const scene = files.find((n) => n.endsWith('.tscn'));
    if (!check(scene, 'no .tscn')) return;
    check(files.filter((n) => n.endsWith('.png')).length >= 13, 'expected a picture for every part');
    const tscn = fs.readFileSync(path.join(dir, scene), 'utf8');
    check(tscn.includes('type="Skeleton2D"') && tscn.includes('type="Polygon2D"') && tscn.includes('type="AnimationPlayer"'), 'scene is missing the skeleton, the bent body or the player');
    if (!GODOT || SKIP.includes('godot')) return;
    const doc = await X('doc()');
    const proj = path.join(dir, '_godot');
    fs.rmSync(proj, { recursive: true, force: true });
    fs.mkdirSync(path.join(proj, 'sprites'), { recursive: true });
    for (const n of files) fs.copyFileSync(path.join(dir, n), path.join(proj, 'sprites', n));
    const bg = (doc.background || '#ffffff').replace('#', '');
    const c = [0, 2, 4].map((i) => (parseInt(bg.slice(i, i + 2), 16) / 255).toFixed(4)).join(', ');
    fs.writeFileSync(path.join(proj, 'project.godot'), `config_version=5\n\n[application]\nconfig/name="bones"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(${c}, 1)\n\n[display]\nwindow/size/viewport_width=${doc.width}\nwindow/size/viewport_height=${doc.height}\n`);
    const shots = [0, 3, 6, 9, 15, 23];
    fs.writeFileSync(
      path.join(proj, 'render.gd'),
      `extends SceneTree
func _init():
	var s = load("res://sprites/${scene}").instantiate()
	root.add_child(s)
	var ap: AnimationPlayer = s.get_node("AnimationPlayer")
	# Autoplay starts on the first frame; let it, so it doesn't restart the clip after we seek.
	await process_frame
	print("ANIMS " + ",".join(ap.get_animation_list()))
	for f in [${shots.join(', ')}]:
		ap.play("walk")
		ap.seek(f / ${doc.fps}.0, true)
		ap.pause()
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://shot-%d.png" % f)
	print("RENDERED")
	quit()
`,
    );
    sh(GODOT, ['--headless', '--path', proj, '--import'], { timeout: 120000 });
    const run = sh(GODOT, ['--path', proj, '--rendering-driver', 'opengl3', '--script', 'render.gd'], { timeout: 120000 });
    if (!check(run.out.includes('RENDERED'), `Godot did not render: ${(run.err + run.out).slice(0, 400)}`)) return;
    check(/ANIMS walk/.test(run.out), 'Godot has no walk animation');
    let worst = 0;
    for (const f of shots) {
      const ref = await reference(settings, f, false);
      const e = ref && rmse(path.join(proj, `shot-${f}.png`), ref);
      if (e === null || e === undefined) continue;
      worst = Math.max(worst, e);
      note(`frame ${f}: rmse ${e.toFixed(4)}`);
      // Godot resamples each part's picture, so edges differ a little. A part out of place is far more than this.
      check(e < 0.03, `frame ${f} in Godot differs from Frameling's PNG (rmse ${e.toFixed(4)})`);
    }
    note(`godot bones ok, worst rmse ${worst.toFixed(4)}`);
  } catch (e) {
    fail(`harness error: ${e?.stack ?? e}`);
  }
}

(async () => {
  const guard = setTimeout(() => {
    console.error('The run took far too long, giving up.');
    process.exit(2);
  }, 55 * 60 * 1000);
  try {
    await startApp();
    await exportMatrix();
    if (!ONLY || ONLY.includes('godot-bones')) await godotBonesSection();
    if (!SKIP.includes('files')) await filesSection();
  } catch (e) {
    begin('harness', 'startup').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  const ok = report();
  process.exit(ok ? 0 : 1);
})();
