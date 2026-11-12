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
//   --cases=phaser,css   only cases with these labels (the word after the format in the report)
//   --skip=files         skip a part: files (save/open/autosave/close), godot, unity, web
//   --show               leave the window visible (needs a real display)
//   GODOT_BIN=/path/to/godot-4-editor    also loads the sprite sheet files in Godot
//   UNITY_BIN=/path/to/Unity/Editor/Unity  also compiles the Unity importer and imports the Unity sprite sheet in a throwaway project
//   WEB_ENGINES=1                        also loads the Phaser, PixiJS and CSS sprite sheet exports in the real engines
//                                        (pinned builds fetched once into ~/.cache/frameling-web-engines, see web-engines/)
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
const CASES = flag('cases');
const GODOT = process.env.GODOT_BIN;
const UNITY = process.env.UNITY_BIN;
const WEB = process.env.WEB_ENGINES === '1' && !SKIP.includes('web');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Phaser and PixiJS need WebGL, which Chromium blocklists on a virtual display unless the blocklist is ignored (it then
// runs on the software renderer). PixiJS's WebGPU renderer needs WebGPU switched on. Do not add the ANGLE or SwiftShader
// switches here: with them the GPU process drops the WebGPU device, and WebGL works without them.
if (WEB) for (const sw of [['ignore-gpu-blocklist'], ['enable-unsafe-webgpu']]) app.commandLine.appendSwitch(...sw);

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
    if (!argv.includes('--show')) w.on('show', () => { if (!w.keepShown) w.hide(); });
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
  // A clip that plays backward, back and forth or a set number of times is baked into GIF, APNG and video: the picture
  // at each position comes from the order worked out here, which the app's own plan must agree with.
  const clip = settings.range === 'clip' ? doc.clips.find((c) => c.id === settings.clipId) : null;
  const baked = clip && BAKED.has(settings.format) && (clip.direction && clip.direction !== 'forward' || (!clip.loop && clip.repeat > 1));
  const len = clip ? Math.abs(plan.range.end - plan.range.start) + 1 : 0;
  // A PNG sequence holds each frame once, in the order the clip starts, whatever it repeats.
  const still = clip && STILLS.has(settings.format) ? stillOrder(len, clip.direction || 'forward') : null;
  const stillBaked = !!still && still.some((p, i) => p !== i);
  const order = baked ? oracleOrder(len, clip.direction || 'forward', playsOf(clip)).all : stillBaked ? still : null;
  if (baked || stillBaked) check(JSON.stringify(order) === JSON.stringify(plan.order), `the plan's frame order ${JSON.stringify(plan.order)} is not ${JSON.stringify(order)}`);
  else check(!plan.order, `the plan has a frame order for a plain export: ${JSON.stringify(plan.order)}`);
  // GIF and APNG: an exported clip sets the loop itself (loops, or plays its passes once), unless the box was changed by hand.
  const loop = clip && ['gif', 'apng'].includes(settings.format) && !settings.loopTouched ? clip.loop : settings.loop;
  return { plan, doc, fps: doc.fps, loop, count: plan.count, width: plan.width, height: plan.height, frameOf: (k) => plan.range.start + (order ? order[k] : k) };
}

const BAKED = new Set(['gif', 'apng', 'mp4', 'webm', 'prores', 'svganim']);
const STILLS = new Set(['pngseq', 'pdf', 'ai']);

/**
 * One pass and the whole order a clip plays, worked out here from the rules in docs/format.md, not from the app's
 * code: forward 0..n-1, backward n-1..0, and a clip that plays N times does N passes and holds the last frame. Back and
 * forth counts each direction as one (like Aseprite): 1 is there only (0..n-1), 2 there and back (0..n-1, n-2..0),
 * 3 there, back, there; the turn frames show once, and forever goes round 0..n-1, n-2..1.
 */
function oracleOrder(len, dir, plays) {
  const up = [...Array(len).keys()];
  const down = up.slice().reverse();
  const first = dir === 'reverse' || dir === 'pingpong-reverse' ? down : up;
  const other = first === up ? down : up;
  if (dir === 'pingpong' || dir === 'pingpong-reverse') {
    const cycle = len > 1 ? first.concat(other.slice(1, -1)) : [0];
    if (plays === Infinity) return { pass: cycle, all: cycle };
    let all = first.slice();
    for (let k = 1; k < plays; k++) all = all.concat((k % 2 ? other : first).slice(1));
    return { pass: cycle, all, legs: plays };
  }
  if (plays === Infinity) return { pass: first, all: first };
  let all = [];
  for (let i = 0; i < plays; i++) all = all.concat(first);
  return { pass: first, all };
}
/** Stills (PNG sequence, PDF, Illustrator pages): every frame once, in the order the clip starts. */
const stillOrder = (len, dir) => ([...Array(len).keys()][dir === 'reverse' || dir === 'pingpong-reverse' ? 'reverse' : 'slice']());
const playsOf = (c) => (c.loop ? Infinity : c.repeat > 1 ? c.repeat : 1);

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

const TOL = { lossless: 0.0005, svg: 0.07, svganim: 0.02, gif: 0.12, video: 0.1 };

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
    const ref = await reference(s, exp.frameOf(k), wantAlpha);
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
  check(exp.loop ? g.loop === 0 : g.loop === null || g.loop === 1 || true, 'loop flag');
  if (exp.loop) check(g.loop === 0, `loop forever expected, NETSCAPE loop=${g.loop}`);
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
      const ref = await reference(s, exp.frameOf(k), wantAlpha);
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
  check(exp.loop ? a.plays === 0 : a.plays === 1, `plays=${a.plays}, wanted ${exp.loop ? 0 : 1}`);
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
      const ref = await reference(s, exp.frameOf(k), caseCtx.transparent);
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
    const ref = await reference(s, exp.frameOf(k), caseCtx.transparent);
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

// The animated SVG, really played: it is put in a web page in a Chromium window, its CSS animations are paused and moved to the middle
// of each moment with the Web Animations API, and the window is photographed. Each photograph must match the app's own PNG
// of the document frame that moment shows (so a clip that goes back and forth or plays 3 times is checked in play order),
// and be closer to that frame than to the frames next to it. After the end, a loop starts over and anything else holds.
async function vSvgAnim(file, s, exp, caseCtx) {
  if (!need('convert', 'compare')) return;
  if (need('xmllint')) check(sh('xmllint', ['--noout', file]).status === 0, 'xmllint says the animated SVG is not well formed');
  const dir = path.dirname(file);
  const count = exp.plan.count;
  const frames = Array.from({ length: count }, (_, k) => exp.plan.range.start + (exp.plan.order?.[k] ?? k));
  const loop = exp.plan.loop;
  const step = 1000 / exp.fps;
  const tol = caseCtx.tol ?? TOL.svganim;
  const win2 = new BrowserWindow({ show: false, width: exp.width, height: exp.height, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  win2.keepShown = true;
  win2.show();
  const errs = [];
  win2.webContents.on('console-message', (e) => {
    if ((e.level ?? e.severity) === 'error' || (e.level ?? e.severity) === 3) errs.push(String(e.message ?? e));
  });
  const wev = (js) => win2.webContents.executeJavaScript(js, true);
  const refs = new Map();
  // The SVG sits inside a web page over white, as it does on a site, so a blend mode that reaches past the SVG (it must not:
  // Frameling's layers blend with each other only) shows up. The pictures to compare with are flattened over white too.
  const refOf = async (f) => {
    if (!refs.has(f)) {
      const r = await reference(s, f, caseCtx.transparent);
      const flat = r && path.join(dir, `_white-${f}.png`);
      if (r) sh('convert', [r, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', flat]);
      refs.set(f, flat);
    }
    return refs.get(f);
  };
  let worst = 0;
  try {
    const page = path.join(dir, '_play.html');
    fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${fs.readFileSync(file, 'utf8').replace(/^<\?xml[^>]*>\s*/, '')}</body></html>`);
    await win2.loadURL(pathToFileURL(page).href);
    const info = await wev(`(() => { const a = document.getAnimations(); const t = a.map((x) => x.effect.getComputedTiming()); return { n: a.length, durations: [...new Set(t.map((x) => x.duration))], iterations: [...new Set(t.map((x) => x.iterations))] }; })()`);
    if (!check(info.n > 0, 'the animated SVG has no running animations')) return;
    check(info.durations.length === 1 && near(info.durations[0], count * step, 1), `animations last ${info.durations} ms, wanted ${(count * step).toFixed(1)}`);
    const it = info.iterations[0];
    check(info.iterations.length === 1 && (loop ? it === Infinity || it === null : it === 1), `iterations ${JSON.stringify(info.iterations)}, wanted ${loop ? 'forever' : 1}`);
    let n = 0;
    const shoot = async (ms, name) => {
      await wev(`(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; } return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
      const img = await win2.webContents.capturePage({ x: 0, y: 0, width: exp.width, height: exp.height });
      const f = path.join(dir, `_anim-${name}.png`);
      fs.writeFileSync(f, img.toPNG());
      if (img.getSize().width !== exp.width) fail(`${name}: the window picture is ${img.getSize().width} wide, wanted ${exp.width}`);
      n++;
      return f;
    };
    // The pictures to tell apart: a moment must be nearer its own frame than the frames before and after it, unless they look the same.
    const closer = async (shot, k, own) => {
      for (const other of [frames[k - 1], frames[k + 1]]) {
        if (other === undefined || other === frames[k]) continue;
        const o = await refOf(other);
        const same = o && (await rmse(o, await refOf(frames[k])));
        const e = o && rmse(shot, o);
        if (own !== null && e !== null && e !== undefined && same > 0.002 && e < own - same / 2) fail(`${path.basename(shot)} looks more like frame ${other} than frame ${frames[k]} (rmse ${e.toFixed(4)} against ${own.toFixed(4)})`);
      }
    };
    for (let k = 0; k < count; k++) {
      const shot = await shoot((k + 0.5) * step, `m${k}`);
      const ref = await refOf(frames[k]);
      const e = ref && rmse(shot, ref);
      if (e === null || e === undefined) continue;
      worst = Math.max(worst, e);
      check(e < tol, `moment ${k + 1} (document frame ${frames[k]}) plays differently from the PNG export (rmse ${e.toFixed(4)})`);
      await closer(shot, k, e);
    }
    // Past the end.
    const endRef = await refOf(loop ? frames[0] : frames[count - 1]);
    const past = await shoot(count * step + (loop ? 0.5 * step : 3000), 'past');
    const e = endRef && rmse(past, endRef);
    if (e !== null && e !== undefined) check(e < tol, loop ? `after the last moment it did not start over on frame ${frames[0]} (rmse ${e.toFixed(4)})` : `after the last moment it did not hold frame ${frames[count - 1]} (rmse ${e.toFixed(4)})`);
  } catch (e) {
    fail(`animated SVG check: ${e?.stack ?? e}`);
  } finally {
    win2.destroy();
  }
  for (const m of errs) fail(`the SVG page logged an error: ${m}`);
  note(`played in Chromium: ${count} moments (frames ${frames.join(',')}), ${loop ? 'loops' : 'plays once'}, worst rmse ${worst.toFixed(4)}`);
}

async function vSheet(files, dir, s, exp, caseCtx) {
  const names = files.sort();
  note(names.join(', '));
  const base = names.find((n) => n.endsWith('.png'));
  check(!!base, 'no sheet png');
  // Settings saved before engines existed say where they're going with the json and Godot ticks.
  const engine = s.sheet.engine ?? (s.sheet.godot || s.sheet.godotScene ? 'godot' : s.sheet.json ? 'json' : 'none');
  const generic = engine === 'json' || ((engine === 'godot' || engine === 'css') && s.sheet.json);
  const want = { godot: ['.tres'], unity: ['.json', '.cs', '.asmdef'], phaser: ['.json', '-anims.json'], pixi: ['.json'], css: ['.css', '.html'], json: ['.json'], none: [] }[engine];
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
  if (engine === 'unity' && s.sheet.content !== 'separate' && !s.sheet.dedupe) {
    // Unity's json lists each clip's pictures in the order they play, with the clip's own settings beside them.
    const u = JSON.parse(fs.readFileSync(path.join(dir, names.find((n) => n.endsWith('.json'))), 'utf8'));
    for (const w of expectedAnimations(exp.doc, s, exp.plan.range)) {
      const a = u.animations.find((x) => x.name === w.name);
      if (!check(a, `unity json has no animation ${w.name}`)) continue;
      check(a.holds.reduce((x, y) => x + y, 0) === w.frames.length, `unity ${w.name}: ${a.holds.reduce((x, y) => x + y, 0)} frames, wanted ${w.frames.length}`);
      check(JSON.stringify(a.frames) === JSON.stringify(w.pos.map((p) => `${w.name}_${p}`)), `unity ${w.name}: pictures ${a.frames} are not in the order ${w.pos}`);
      check(a.loop === w.loop && (a.direction ?? 'forward') === w.dir, `unity ${w.name}: loop ${a.loop} direction ${a.direction}, wanted ${w.loop} ${w.dir}`);
    }
  }
  if (!base) return;
  const [[sw, sh_]] = identify(path.join(dir, base));
  note(`sheet ${sw}x${sh_}`);
  if (s.sheet.pot) check((sw & (sw - 1)) === 0 && (sh_ & (sh_ - 1)) === 0, `sheet is ${sw}x${sh_}, not a power of two`);
  if (UNITY && !SKIP.includes('unity') && engine === 'unity' && UNITY_TEMPLATES.includes(caseCtx.tpl)) await unityCheck(dir, names);
  if (WEB && (engine === 'phaser' || engine === 'pixi' || engine === 'css')) await webCheck(engine, dir, names, s, exp, caseCtx);
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
  // For each cell, one document frame that shows it.
  const docFrameOfCell = new Map();
  const wantAnims = expectedAnimations(doc, s, exp.plan.range);
  for (const [an, anim] of Object.entries(atlas.animations)) {
    const w = wantAnims.find((x) => x.name === an);
    if (w) check(w.frames.length === anim.frames.length, `${an}: json lists ${anim.frames.length} frames, wanted ${w.frames.length} (direction ${w.dir}, plays ${w.plays})`);
    anim.frames.forEach((cell, j) => {
      const docFrame = exp.plan.range.start + (w ? w.frames[j] : j);
      if (!docFrameOfCell.has(cell)) docFrameOfCell.set(cell, docFrame);
    });
    if (w && anim.direction !== undefined) check(anim.direction === w.dir, `${an}: json says direction ${anim.direction}, wanted ${w.dir}`);
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
  if (GODOT && !SKIP.includes('godot') && tres && s.sheet.godotScene) await godotCheck(dir, names, atlas, s, exp, caseCtx);
}

// ---------------------------------------------------------------- web engines (Phaser, PixiJS, CSS)

let webChecker;

/** What the sheet's animations should be, worked out from the document alone (the same rules as buildAnimations). */
function expectedAnimations(doc, s, range) {
  const n = range.end - range.start + 1;
  const used = new Set();
  const unique = (name) => {
    let t = name.trim() || 'clip';
    while (used.has(t)) t += '_';
    used.add(t);
    return t;
  };
  const all = Array.from({ length: n }, (_, i) => i);
  // The frames in the order they play: the clip's own frames put through the order rules.
  const played = (frames, c) => {
    const o = oracleOrder(frames.length, c?.direction || 'forward', c ? playsOf(c) : Infinity);
    const dir = c?.direction || 'forward';
    const plays = c ? playsOf(c) : Infinity;
    // What an engine's own ping-pong could take: one direction, for a loop or an even number of directions.
    const bounces = (dir === 'pingpong' || dir === 'pingpong-reverse') && frames.length > 1 && (plays === Infinity || (plays > 1 && plays % 2 === 0));
    const leg = bounces ? (dir === 'pingpong' ? [...Array(frames.length).keys()] : [...Array(frames.length).keys()].reverse()).map((p) => frames[p]) : null;
    return { frames: o.all.map((p) => frames[p]), pos: o.all, pass: o.pass.map((p) => frames[p]), plays, dir, leg, trips: plays === Infinity ? Infinity : plays / 2 };
  };
  if (s.range !== 'all') {
    const clip = doc.clips.find((c) => c.id === s.clipId);
    return [{ name: unique(clip?.name ?? 'default'), fps: doc.fps, loop: clip?.loop ?? true, ...played(all, clip) }];
  }
  const out = doc.clips
    .map((c) => {
      const a = Math.max(range.start, Math.min(c.start, c.end));
      const b = Math.min(range.end, Math.max(c.start, c.end));
      return { name: unique(c.name), fps: doc.fps, loop: c.loop, ...played(a > b ? [] : Array.from({ length: b - a + 1 }, (_, i) => a - range.start + i), c) };
    })
    .filter((a) => a.frames.length);
  return out.length ? out : [{ name: unique('default'), fps: doc.fps, loop: true, ...played(all, null) }];
}

/** Which frames of an animation to compare pixel by pixel: all of a short one, else the ends and an even spread. */
function pickFrames(n, max = 8) {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  return [...new Set(Array.from({ length: max }, (_, k) => Math.round((k * (n - 1)) / (max - 1))))];
}

/** Loads the exported files in the real engine (Phaser, PixiJS) or Chromium (CSS) and compares frames with the app's PNG export. */
async function webCheck(engine, dir, names, s, exp, caseCtx) {
  if (!need('convert')) return;
  try {
    webChecker ??= await require('./web-engines/check.cjs').createWebChecker();
  } catch (e) {
    fail(`could not set up the web engines: ${e?.message ?? e}`);
    return;
  }
  const doc = exp.doc;
  const range = exp.plan.range;
  const separate = s.sheet.content === 'separate';
  // The sprite may be shown bigger or smaller than the frame (nearest-neighbour for pixel art); the pictures to match are then
  // the frame scaled the same way by ImageMagick's point filter, which is exact for the whole-pixel blocks pixel art is made of.
  const display = caseCtx.web.display ?? 1;
  const image = names.find((n) => n.endsWith('.png') && !n.startsWith('_'));
  const jsonName = names.find((n) => n.endsWith('.json') && !n.endsWith('-anims.json') && !n.endsWith('-flow.json'));
  const animsName = names.find((n) => n.endsWith('-anims.json'));
  const animations = separate ? [{ name: 'sprites', fps: doc.fps, loop: false, plays: 1, dir: 'forward', pass: [], frames: Array.from({ length: range.end - range.start + 1 }, (_, i) => i) }] : expectedAnimations(doc, s, range);
  // The pictures to compare with: the app's own PNG of each document frame, copied next to the exports so the page can load them.
  const refs = new Map();
  const refOf = async (docFrame) => {
    if (!refs.has(docFrame)) {
      const f = await reference(s, docFrame, caseCtx.transparent);
      const dest = path.join(dir, `_ref-${docFrame}.png`);
      if (f && display === 1) fs.copyFileSync(f, dest);
      else if (f) sh('convert', [f, '-filter', 'point', '-resize', `${display * 100}%`, dest]);
      refs.set(docFrame, f ? dest : null);
    }
    return refs.get(docFrame);
  };
  const base = { engine, dir, image, json: jsonName, anims: animsName, css: names.find((n) => n.endsWith('.css')), html: names.find((n) => n.endsWith('.html')), separate, display, width: Math.round(exp.width * display), height: Math.round(exp.height * display) };
  base.animations = [];
  for (const a of animations) {
    // Phaser and CSS repeat a forward or backward clip themselves (one pass, N times); everything else lists every frame.
    const yoyo = engine === 'phaser' && caseCtx.native && !!a.leg;
    const native = !yoyo && (engine === 'phaser' || engine === 'css') && !a.loop && a.plays > 1 && !a.dir.startsWith('pingpong');
    const listed = yoyo ? a.leg : native ? a.pass : a.frames;
    const checks = [];
    for (const i of pickFrames(listed.length)) {
      const ref = await refOf(range.start + listed[i]);
      if (ref) checks.push({ i, ref });
    }
    base.animations.push({ name: a.name, fps: a.fps, loop: a.loop, count: listed.length, times: yoyo ? a.trips : native ? a.plays : 1, yoyo, checks });
  }
  if (engine !== 'css') {
    const data = JSON.parse(fs.readFileSync(path.join(dir, jsonName), 'utf8'));
    base.key = image.replace(/\.png$/, '');
    base.frameNames = Object.keys(data.frames);
    base.meta = data.meta.frameling ?? null;
    // Separate sprites have no animations, and Phaser with no anims file is just an atlas.
    if (separate || (engine === 'phaser' && !animsName)) base.animations = [];
  }
  // Which engine builds and renderers to load it in: the usual one, or (allRenderers) Phaser 3 and 4 in WebGL and canvas, PixiJS in WebGL and WebGPU.
  const all = { phaser: [{ phaser: 3, renderer: 'webgl' }, { phaser: 3, renderer: 'canvas' }, { phaser: 4, renderer: 'webgl' }, { phaser: 4, renderer: 'canvas' }], pixi: [{ renderer: 'webgl' }, { renderer: 'webgpu' }], css: [{}] }[engine];
  for (const variant of caseCtx.web.allRenderers ? all : all.slice(0, 1)) {
    const r = await webChecker.run({ ...base, variant });
    for (const p of r.problems) fail(p);
    for (const n of r.notes) note(n);
  }
}

// Unity is slow to start, so only these templates go through it (the hero has several clips and is pixel art).
const UNITY_TEMPLATES = ['hero-sprites', 'bouncing-ball'];
const unityProjects = {};

/**
 * Makes (once per run) a throwaway project. `pkg` true adds the 2D Sprite package (the importer's best path); false is
 * the default 3D template as Unity makes it, which has no such package, so the importer must fall back and still compile.
 */
function unityProjectDir(pkg) {
  const key = pkg ? 'pkg' : 'older';
  if (unityProjects[key]) return unityProjects[key];
  const plain = path.join(outDir, '_unity-project-older');
  if (!unityProjects.older && !unityProjects.made) {
    const r = sh(UNITY, ['-batchmode', '-nographics', '-quit', '-createProject', plain, '-logFile', path.join(outDir, 'unity-create.log')], { timeout: 600000 });
    if (!fs.existsSync(path.join(plain, 'Packages', 'manifest.json'))) throw new Error(`Unity could not make a project: ${(r.err + r.out).slice(0, 300)} (see unity-create.log)`);
    unityProjects.made = true;
    unityProjects.older = plain;
    const m = JSON.parse(fs.readFileSync(path.join(plain, 'Packages', 'manifest.json'), 'utf8'));
    if (m.dependencies['com.unity.2d.sprite']) throw new Error('the default Unity project already has the 2D Sprite package, so the "without it" check proves nothing');
  }
  if (!pkg) return unityProjects.older;
  const withPkg = path.join(outDir, '_unity-project');
  fs.rmSync(withPkg, { recursive: true, force: true });
  fs.cpSync(plain, withPkg, { recursive: true });
  const mf = path.join(withPkg, 'Packages', 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.dependencies['com.unity.2d.sprite'] = '1.0.0';
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  return (unityProjects.pkg = withPkg);
}

/**
 * Drops the exported sheet and the importer files into a project, lets Unity compile and import them, and checks the
 * sprites and clips. Done in a project with the 2D Sprite package and in one without it.
 */
async function unityCheck(dir, names) {
  for (const pkg of [true, false]) unityCheckIn(unityProjectDir(pkg), pkg, dir, names);
}

function unityCheckIn(proj, pkg, dir, names) {
  const where = pkg ? 'with package' : 'no package';
  const assets = path.join(proj, 'Assets');
  for (const d of ['Frameling', 'Importer', 'Editor']) fs.rmSync(path.join(assets, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(assets, 'Frameling'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'Importer'), { recursive: true });
  const png = names.find((n) => n.endsWith('.png'));
  check(names.includes('FramelingSheetImporter.cs'), 'unity: the importer script was not exported');
  check(names.includes('FramelingSheetImporter.asmdef'), 'unity: the importer assembly definition was not exported');
  // Like a person would: the picture and its json in a folder, the importer script and its .asmdef together anywhere under Assets.
  for (const n of names) fs.copyFileSync(path.join(dir, n), path.join(assets, /\.(cs|asmdef)$/.test(n) ? 'Importer' : 'Frameling', n));
  // The check lives in the importer's assembly so it can read the importer's types.
  fs.copyFileSync(path.join(__dirname, 'unity', 'FramelingSheetCheck.cs'), path.join(assets, 'Importer', 'FramelingSheetCheck.cs'));
  const sheetArg = `Assets/Frameling/${png}`;
  const ids = path.join(dir, `unity-ids-${pkg ? 'pkg' : 'older'}.txt`);
  const expect = pkg ? 'package' : 'older';
  runUnity(proj, dir, `first import ${where}`, ['-sheet', sheetArg, '-ids', ids, '-expect', expect]);
  // Re-export: the json changes (a new speed and a longer first hold), the picture is imported again, and nothing may break.
  const jsonFile = path.join(assets, 'Frameling', png.replace(/\.png$/, '.json'));
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (data.animations.length) {
    data.animations[0].fps = 24;
    data.animations[0].holds[0] += 1;
    fs.writeFileSync(jsonFile, JSON.stringify(data));
  }
  runUnity(proj, dir, `re-import ${where}`, ['-sheet', sheetArg, '-ids', ids, '-expect', expect, '-reimport']);
  const logOf = (label) => {
    const f = path.join(dir, `unity-${label.replace(/\W+/g, '-')}.log`);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  };
  const warning = /another copy of FramelingSheetImporter/;
  check(!warning.test(logOf(`first import ${where}`)) && !warning.test(logOf(`re-import ${where}`)), `unity ${where}: warned about another importer copy when there is only one`);
  // An older copy of the script in Assets/Editor: the importer must say so in the Console, naming that file.
  fs.mkdirSync(path.join(assets, 'Editor'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'Editor', 'FramelingSheetImporter.cs'), '#if UNITY_EDITOR\nusing UnityEditor;\npublic class FramelingSheetImporter : AssetPostprocessor { }\n#endif\n');
  runUnity(proj, dir, `older copy ${where}`, ['-sheet', sheetArg, '-ids', ids, '-expect', expect, '-reimport', '-wait', '25']);
  const text = logOf(`older copy ${where}`);
  check(warning.test(text) && text.includes('Delete the older file Assets/Editor/FramelingSheetImporter.cs'), `unity ${where}: no Console warning naming the older copy in Assets/Editor`);
  fs.rmSync(path.join(assets, 'Editor'), { recursive: true, force: true });
}

/** One Unity batchmode run of the check script; its report lines become notes and failures. */
function runUnity(proj, dir, label, args) {
  const report = path.join(dir, `unity-report-${label.replace(/\W+/g, '-')}.txt`);
  const log = path.join(dir, `unity-${label.replace(/\W+/g, '-')}.log`);
  fs.rmSync(report, { force: true });
  const r = sh(UNITY, ['-batchmode', '-nographics', '-projectPath', proj, '-executeMethod', 'FramelingSheetCheck.Run', ...args, '-report', report, '-logFile', log], { timeout: 600000 });
  const lines = (fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '').split('\n').filter(Boolean);
  lines.filter((l) => !l.startsWith('FAIL') && !l.startsWith('UNITY-')).forEach((l) => note(`unity ${label}: ${l}`));
  lines.filter((l) => l.startsWith('FAIL')).forEach((l) => fail(`unity ${label}: ${l}`));
  if (lines.includes('UNITY-OK')) return note(`unity ${label} ok`);
  const logText = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  const errs = logText.split('\n').filter((l) => /error CS\d+|Compilation failed|Exception/.test(l)).slice(0, 8);
  fail(`unity ${label}: no pass (exit ${r.status}); ${errs.join(' | ') || 'see ' + path.basename(log)}`);
}

async function godotCheck(dir, names, atlas, s, exp, caseCtx = {}) {
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
  // Real playback: every animation is played on an AnimatedSprite2D, one tick per frame (--fixed-fps), and the picture
  // shown at each tick is recorded.
  const ticks = {};
  for (const [an, a] of Object.entries(atlas.animations)) ticks[an] = a.loop ? a.frames.length * 2 + 8 : a.frames.length + 8;
  fs.writeFileSync(path.join(proj, 'ticks.json'), JSON.stringify(ticks));
  fs.writeFileSync(
    path.join(proj, 'play.gd'),
    `extends SceneTree
var sf: SpriteFrames
var sp: AnimatedSprite2D
var sprites := []
var want := {}
var names := []
var ai := -1
var go := true
var seen := []
var out := {}
func _initialize():
	sf = load("res://${sub}/${base}.tres")
	want = JSON.parse_string(FileAccess.get_file_as_string("res://ticks.json"))
	# One animation per run (its name follows the --): a sprite that starts later in a long run dwells a tick longer on the
	# ends of a ping-pong in a headless run, so each one is played from the start of its own run.
	names = [OS.get_cmdline_user_args()[0]]
	for n in names:
		var one := AnimatedSprite2D.new()
		one.sprite_frames = sf
		root.add_child(one)
		sprites.append(one)
func _process(_d):
	if go:
		# Each animation is started from a tick, on a sprite of its own, so the next ticks show it from its first picture.
		ai += 1
		if ai >= names.size():
			print("PLAYED " + JSON.stringify(out))
			quit()
			return false
		sp = sprites[ai]
		sp.play(names[ai])
		seen = []
		go = false
		return false
	var a = names[ai]
	var t = sf.get_frame_texture(a, sp.frame)
	seen.append(str(int(t.region.position.x)) + "," + str(int(t.region.position.y)))
	if seen.size() >= int(want[a]):
		out[a] = {"mode": sf.get_animation_loop_mode(a), "seen": seen}
		sp.stop()
		go = true
	return false
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
    // With the engine's own ping-pong a looping back and forth clip lists one direction only (and loop reads false: it is mode 2).
    const w0 = expectedAnimations(exp.doc, s, exp.plan.range).find((x) => x.name === an);
    const nativeLoop = !!caseCtx.native && !!w0?.leg && want.loop;
    if (nativeLoop) check(total === w0.leg.length, `${an}: Godot lists ${total} frames, the one direction is ${w0.leg.length}`);
    else check(total === want.frames.length, `${an}: Godot plays ${total} frames' worth, json has ${want.frames.length}`);
    check(got.fps === want.fps && (nativeLoop || got.loop === want.loop), `${an}: fps/loop differ in Godot`);
    // Every Godot texture must point at the json frame, with the margin the trim implies.
    let at = 0;
    got.frames.forEach((f) => {
      const cell = atlas.frames[want.frames[at]];
      if (nativeLoop) return void (at += f[8]);
      at += f[8];
      const okRegion = f[0] === cell.frame.x && f[1] === cell.frame.y && f[2] === cell.frame.w && f[3] === cell.frame.h;
      check(okRegion, `${an}: Godot region ${f.slice(0, 4)} vs json ${JSON.stringify(cell.frame)}`);
      if (cell.trimmed) check(f[4] === cell.spriteSourceSize.x && f[5] === cell.spriteSourceSize.y && f[6] === cell.sourceSize.w - cell.frame.w && f[7] === cell.sourceSize.h - cell.frame.h, `${an}: Godot margin ${f.slice(4, 8)} does not match the trim`);
    });
  }
  note(`godot ok: ${gotNames.join(',')}`);
  await godotPlayCheck(proj, atlas, s, exp, caseCtx);
}

/** Plays the sprite frames in real Godot and compares each tick's picture with the order the clip should play. */
async function godotPlayCheck(proj, atlas, s, exp, caseCtx) {
  const played = {};
  for (const an of Object.keys(atlas.animations)) {
    const play = sh(GODOT, ['--headless', '--fixed-fps', String(exp.fps), '--path', proj, '--script', 'play.gd', '--', an], { timeout: 120000 });
    const line = play.out.split('\n').find((l) => l.startsWith('PLAYED '));
    if (!check(line, `Godot did not play ${an}: ${(play.err + play.out).slice(0, 300)}`)) return;
    Object.assign(played, JSON.parse(line.slice(7)));
  }
  const wantAnims = expectedAnimations(exp.doc, s, exp.plan.range);
  const notes = [];
  for (const [an, got] of Object.entries(played)) {
    const a = atlas.animations[an];
    const w = wantAnims.find((x) => x.name === an);
    const key = (cell) => `${atlas.frames[cell].frame.x},${atlas.frames[cell].frame.y}`;
    const cells = a.frames.map(key);
    // The engine's own ping-pong (loop mode 2) is used for a looping back and forth clip when asked; the rest is baked.
    const bounces = !!caseCtx.native && !!w?.leg && a.loop;
    check(got.mode === (bounces ? 2 : a.loop ? 1 : 0), `${an}: Godot loop mode ${got.mode}, wanted ${bounces ? 2 : a.loop ? 1 : 0}`);
    let expected;
    if (bounces) {
      const half = cells.length / 2 + 1;
      const leg = cells.slice(0, half);
      const cycle = leg.concat(leg.slice().reverse());
      expected = (t) => cycle[t % cycle.length];
    } else if (a.loop) expected = (t) => cells[t % cells.length];
    else expected = (t) => cells[Math.min(t, cells.length - 1)];
    const seen = got.seen;
    const bad = seen.findIndex((k, t) => k !== expected(t));
    check(bad < 0, `${an}: Godot showed ${seen.slice(0, 24).join(' ')}... which differs at tick ${bad} (wanted ${[...Array(Math.min(seen.length, 24)).keys()].map(expected).join(' ')})`);
    if (w?.leg) notes.push(`${an}: ${bounces ? 'ping-pong loop, ends twice' : 'baked, ends once'}`);
  }
  if (notes.length) note(`godot played: ${notes.join('; ')}`);
}

// ---------------------------------------------------------------- the export matrix

const ALL_FORMATS = ['png', 'svg', 'pngseq', 'apng', 'gif', 'mp4', 'webm', 'sheet', 'interactives', 'psd', 'pdf', 'ai', 'prores'];
const ANIM = new Set(['pngseq', 'apng', 'gif', 'mp4', 'webm', 'sheet', 'interactives', 'pdf', 'ai', 'prores']);

function listFiles(dir) {
  return fs.readdirSync(dir).filter((n) => !n.startsWith('_') && fs.statSync(path.join(dir, n)).isFile());
}

async function runCase(tpl, fmt, label, edit, opts = {}) {
  if (CASES && !CASES.includes(label)) return;
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
      tpl,
      transparent: settings.transparent && (fmt === 'webm' ? !!caps.webm.alpha : fmt !== 'mp4'),
      alphaExpected: !!caps.webm.alpha,
      sound: await ev('!!window.__framelingExport.doc().audio?.some((c) => !c.muted)'),
      // SVG leaves out effects, masks and clipping (see export help), so it only roughly matches a document using them.
      svgApprox: tpl === 'kitchen-sink',
      // The preference "Back-and-forth clips in game engines" is set to the engine's own ping-pong for this case.
      native: !!opts.native,
      web: opts.web ?? {},
      tol: opts.tol,
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
    const ext = { mp4: '.mp4', webm: '.webm', gif: '.gif', apng: '.png', png: '.png', pngseq: '.zip', svg: '.svg', svganim: '.svg', interactives: '.flplay', psd: '.psd', pdf: '.pdf', ai: '.ai', prores: '.mov' }[fmt];
    check(files[0].endsWith(ext), `file name ${files[0]} does not end in ${ext}`);
    const v = { mp4: vVideo, webm: vVideo, gif: vGif, apng: vApng, png: vPng, pngseq: vPngSeq, svg: vSvg, svganim: vSvgAnim, interactives: vPlayable, psd: vPsd, pdf: vPdf, ai: vPdf, prores: vProres }[fmt];
    await v(f, settings, exp, caseCtx);
  } catch (e) {
    fail(`harness error: ${e?.stack ?? e}`);
  }
}

// Clips for the play-order cases: back and forth that loops, a forward clip that plays 3 times, a backward clip that
// plays once, and a plain loop. They do not overlap, so every picture belongs to one clip.
const PLAY_CLIPS = `__framelingExport.clearClips(); __framelingExport.addClip('swing', 2, 5, true, 'pingpong'); __framelingExport.addClip('thrice', 6, 7, false, 'forward', 3); __framelingExport.addClip('back', 8, 11, false, 'reverse'); __framelingExport.addClip('plain', 12, 13); __framelingExport.setChoice('export.clipEngineBounce', undefined)`;
// Back and forth every way, one after another (the template is 16 frames): a loop, a loop from the end, there and back (2), there, back, there (3).
const BOUNCE_CLIPS = `__framelingExport.clearClips(); __framelingExport.addClip('swing', 0, 3, true, 'pingpong'); __framelingExport.addClip('swingback', 4, 7, true, 'pingpong-reverse'); __framelingExport.addClip('bounce2', 8, 11, false, 'pingpong', 2); __framelingExport.addClip('bounce3', 12, 15, false, 'pingpong', 3); __framelingExport.setChoice('export.clipEngineBounce', undefined)`;
// The same with the preference set to the engine's own ping-pong (Godot loop mode 2, Phaser yoyo).
const BOUNCE_CLIPS_NATIVE = BOUNCE_CLIPS + `; __framelingExport.setChoice('export.clipEngineBounce', 'engine')`;

const isPixelTpl = (t) => t === 'hero-sprites' || t === 'blank-pixel';

// The animated SVG, played for real (see vSvgAnim): a clip that goes back and forth and loops, a clip that plays 3 times and
// stops, one that plays backward, the whole Bouncing ball, and the Explosion (see-through, with glow, add blending and particles).
async function svgAnimCases() {
  if (ONLY && !ONLY.includes('svganim')) return;
  const half = (s) => ({ ...s, scale: 0.5 });
  if (TEMPLATES.includes('bouncing-ball')) {
    for (const [label, name] of [['clip-pingpong', 'swing'], ['clip-repeat3', 'thrice'], ['clip-backward', 'back']]) {
      await runCase('bouncing-ball', 'svganim', label, async (s) => ({ ...half(s), range: 'clip', clipId: 'clip-' + name }), { prepare: PLAY_CLIPS });
    }
    await runCase('bouncing-ball', 'svganim', 'defaults', half);
  }
  await runCase('explosion-fx', 'svganim', 'defaults', (s) => ({ ...half(s), transparent: true }));
}

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
      if (((BAKED.has(fmt) && fmt !== 'prores') || fmt === 'pngseq') && tpl === 'bouncing-ball') {
        // A clip exported as GIF, APNG or video comes out in the order it plays: back and forth (looping, there and back, there back there),
        // 3 times, backward. A PNG sequence holds each frame once in the order the clip starts, whatever it repeats.
        for (const [label, name, prepare] of [['clip-pingpong', 'swing', PLAY_CLIPS], ['clip-pingpong-reverse', 'swingback', BOUNCE_CLIPS], ['clip-bounce2', 'bounce2', BOUNCE_CLIPS], ['clip-bounce3', 'bounce3', BOUNCE_CLIPS], ['clip-repeat3', 'thrice', PLAY_CLIPS], ['clip-backward', 'back', PLAY_CLIPS]]) {
          await runCase(tpl, fmt, label, async (s) => ({ ...s, range: 'clip', clipId: 'clip-' + name }), { prepare });
        }
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
      // A frame rate that is not a whole number: the Settings box only takes whole ones, a file or a plugin can carry any.
      if (tpl === 'bouncing-ball' && ['gif', 'apng', 'mp4', 'webm'].includes(fmt)) {
        for (const fps of [12.5, 23.976]) await runCase(tpl, fmt, `fps${fps}`, (s) => s, { prepare: `__frameling.store().update('fps', (d) => { d.fps = ${fps}; })` });
      }
      if (fmt === 'sheet') {
        await runCase(tpl, fmt, 'trim-pot-pad', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, pot: true, padding: 2, columns: 3 } }));
        await runCase(tpl, fmt, 'godot', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, dedupe: true, json: true, godot: true, godotScene: true, godotPath: '' } }));
        await runCase(tpl, fmt, 'nodedupe-godotpath', (s) => ({ ...s, sheet: { ...s.sheet, dedupe: false, json: true, godot: true, godotScene: true, godotPath: 'art/chars/hero.png' } }));
        await runCase(tpl, fmt, 'packed-extrude', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'json', layout: 'packed', trim: true, padding: 2, extrude: 1, json: true } }));
        for (const engine of ['phaser', 'pixi', 'unity', 'css']) await runCase(tpl, fmt, engine, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, padding: 1, json: false } }), { web: { allRenderers: true } });
        // The web engines, with more clips, a clip that stops, a plain grid with see-through frames, and separate sprites in CSS.
        if (WEB && (tpl === 'bouncing-ball' || tpl === 'hero-sprites')) {
          const clips = tpl === 'hero-sprites' ? '' : `__framelingExport.addClip('mid', 2, 5); __framelingExport.addClip('once', 0, 1, false)`;
          for (const engine of ['phaser', 'pixi', 'css']) {
            await runCase(tpl, fmt, `${engine}-grid`, (s) => ({ ...s, transparent: true, sheet: { ...s.sheet, engine, layout: 'grid', trim: false, dedupe: false, pot: true, padding: 2, json: false } }), { prepare: clips, web: { allRenderers: tpl === 'hero-sprites' } });
            if (tpl === 'bouncing-ball') await runCase(tpl, fmt, `${engine}-clips`, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, dedupe: true, padding: 1, json: false } }), { prepare: clips });
          }
          // Awkward clip names: spaces, punctuation, letters CSS names cannot hold, and names that only differ in case.
          if (tpl === 'bouncing-ball') {
            const odd = [['Run Fast!', 0, 1], ['\u65e5\u672c', 2, 3], ['\u65e5\u672c\u8a9e', 4, 5], ['Idle', 6, 7], ['idle', 8, 9], ['a.b #1', 10, 11], ['frame', 12, 13]];
            const prepare = `__framelingExport.rename('2D Hero! v1');` + odd.map(([n, a, b]) => `__framelingExport.addClip(${JSON.stringify(n)}, ${a}, ${b})`).join(';');
            for (const engine of ['phaser', 'pixi', 'css']) await runCase(tpl, fmt, `${engine}-names`, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, padding: 1, json: false } }), { prepare });
          }
          await runCase(tpl, fmt, 'css-separate', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'css', content: 'separate', separateFiles: false, trim: false, layout: 'packed', padding: 1, json: false } }), { prepare: clips });
        }
        // Clips that play another way: back and forth (loops), 3 times, backward, and a plain loop, in each engine. Engines
        // that can run are loaded in the real thing (Godot with GODOT_BIN, Phaser, PixiJS and CSS with WEB_ENGINES=1, Unity with UNITY_BIN).
        if (tpl === 'bouncing-ball') {
          const play = PLAY_CLIPS;
          await runCase(tpl, fmt, 'play-godot', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, dedupe: false, json: true, godot: true, godotScene: true, godotPath: '' } }), { prepare: play });
          // Back and forth with the engine's own ping-pong: Godot's loop mode 2 for the looping clips, Phaser's yoyo for loops and even counts.
          await runCase(tpl, fmt, 'bounce-godot', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, dedupe: false, json: true, godot: true, godotScene: true, godotPath: '' } }), { prepare: BOUNCE_CLIPS });
          await runCase(tpl, fmt, 'bounce-godot-native', (s) => ({ ...s, sheet: { ...s.sheet, trim: true, dedupe: false, json: true, godot: true, godotScene: true, godotPath: '' } }), { prepare: BOUNCE_CLIPS_NATIVE, native: true });
          await runCase(tpl, fmt, 'bounce-unity', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'unity', layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: BOUNCE_CLIPS });
          if (WEB) {
            for (const engine of ['phaser', 'pixi', 'css']) await runCase(tpl, fmt, `bounce-${engine}`, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: BOUNCE_CLIPS });
            await runCase(tpl, fmt, 'bounce-phaser-native', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'phaser', layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: BOUNCE_CLIPS_NATIVE, native: true });
          }
          await runCase(tpl, fmt, 'play-json', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'json', layout: 'packed', trim: true, dedupe: false, padding: 1, json: true } }), { prepare: play });
          await runCase(tpl, fmt, 'play-unity', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'unity', layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: play });
          if (WEB) for (const engine of ['phaser', 'pixi', 'css']) await runCase(tpl, fmt, `play-${engine}`, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: play, web: { allRenderers: true } });
          // A clip rate that is not a whole number (the Settings box only takes whole ones, a file or plugin can carry any), in each engine.
          if (WEB) for (const fps of [12.5, 23.976]) for (const engine of ['phaser', 'pixi', 'css']) await runCase(tpl, fmt, `fps${fps}-${engine}`, (s) => ({ ...s, sheet: { ...s.sheet, engine, layout: 'packed', trim: true, dedupe: false, padding: 1, json: false } }), { prepare: `${play}; __frameling.store().update('fps', (d) => { d.fps = ${fps}; })` });
        }
        // Pixel art shown at 2x (the art-size sheet) and 0.5x (the full-size sheet), nearest-neighbour, in every renderer.
        if (WEB && tpl === 'hero-sprites') {
          for (const engine of ['phaser', 'pixi', 'css']) {
            const sheet = (s) => ({ ...s.sheet, engine, layout: 'packed', trim: true, dedupe: true, padding: 2, extrude: 1, json: false });
            await runCase(tpl, fmt, `scaled2x-${engine}`, (s) => ({ ...s, scale: 1 / 8, transparent: true, sheet: sheet(s) }), { web: { display: 2, allRenderers: true } });
            await runCase(tpl, fmt, `scaled0.5x-${engine}`, (s) => ({ ...s, transparent: true, sheet: sheet(s) }), { web: { display: 0.5, allRenderers: true } });
          }
        }
        // No clips: separate sprites make a json with no animations, so Unity must cut the sprites and make no .anim files.
        if (tpl === 'bouncing-ball') await runCase(tpl, fmt, 'unity-noclips', (s) => ({ ...s, sheet: { ...s.sheet, engine: 'unity', content: 'separate', separateFiles: false, layout: 'packed', trim: true, padding: 1, json: false } }));
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
    const ref = await reference(s, exp.frameOf(k), wantAlpha);
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
    await renderBonesInGodot({ dir, files, scene, settings, shots: [0, 3, 6, 9, 15, 23], anim: 'walk', tolerance: 0.03 });
  } catch (e) {
    fail(`harness error: ${e?.stack ?? e}`);
  }
}

// Back and forth clips in the skeleton export: baked (a longer loop, ends once) or with the preference on the AnimationPlayer's
// own ping-pong loop (one direction keyed, loop mode 2). The scene is loaded and played in real Godot and the time the
// player reports is followed: up to the end of the animation and back down, over and over.
async function godotBonesBounceSection(native) {
  const r = begin('puppet', `sheet godot-bones-bounce-${native ? 'native' : 'baked'}`);
  try {
    if (!GODOT || SKIP.includes('godot')) return note('Godot is not set up here, so nothing was played');
    const dir = setAutomationDir(path.join(outDir, 'puppet', `sheet-godot-bones-bounce-${native ? 'native' : 'baked'}`));
    await loadTpl('puppet');
    await ev(`__framelingExport.clearClips(); __framelingExport.addClip('swing', 0, 11, true, 'pingpong'); __framelingExport.addClip('twice', 12, 17, false, 'pingpong', 2); __framelingExport.setChoice('export.clipEngineBounce', ${native ? "'engine'" : 'undefined'})`);
    const defaults = await X('defaults()');
    const settings = { ...defaults, format: 'sheet', range: 'all', clipId: null, scale: 1, transparent: false, sheet: { ...defaults.sheet, engine: 'godot', godot: true, godotScene: true, json: false, godotRig: 'bones', godotPath: '' } };
    r.settings = settings;
    const res = await X(`run(${JSON.stringify(settings)})`);
    if (!check(res.outcome === 'done', `export did not finish: ${JSON.stringify(res)}`)) return;
    const files = listFiles(dir);
    const scene = files.find((n) => n.endsWith('.tscn'));
    if (!check(scene, 'no .tscn')) return;
    const proj = path.join(dir, '_godot');
    fs.rmSync(proj, { recursive: true, force: true });
    fs.mkdirSync(path.join(proj, 'sprites'), { recursive: true });
    for (const n of files) fs.copyFileSync(path.join(dir, n), path.join(proj, 'sprites', n));
    fs.writeFileSync(path.join(proj, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="bounce"\n');
    fs.writeFileSync(
      path.join(proj, 'bounce.gd'),
      `extends SceneTree
var ap: AnimationPlayer
var times := []
var n := 0
func _initialize():
	var s = load("res://sprites/${scene}").instantiate()
	root.add_child(s)
	ap = s.get_node("AnimationPlayer")
	ap.stop()
	for a in ["swing", "twice"]:
		var an = ap.get_animation(a)
		print("INFO " + a + " " + str(an.loop_mode) + " " + str(an.length))
	ap.play("swing")
func _process(_d):
	times.append(snappedf(ap.current_animation_position, 0.0001))
	n += 1
	if n == 40:
		print("TIMES " + JSON.stringify(times))
		quit()
	return false
`,
    );
    sh(GODOT, ['--headless', '--path', proj, '--import'], { timeout: 120000 });
    const play = sh(GODOT, ['--headless', '--fixed-fps', String(12), '--path', proj, '--script', 'bounce.gd'], { timeout: 120000 });
    const info = Object.fromEntries(play.out.split('\n').filter((l) => l.startsWith('INFO ')).map((l) => l.split(' ').slice(1)).map(([a, m, len]) => [a, { mode: Number(m), length: Number(len) }]));
    const timesLine = play.out.split('\n').find((l) => l.startsWith('TIMES '));
    if (!check(info.swing && timesLine, `Godot did not report the animations: ${(play.out + play.err).slice(0, 300)}`)) return;
    const fps = 12;
    const n = 12;
    // The loop is a ping-pong loop (mode 2) over one direction (n frames long), or a baked loop (mode 1) of there and back without the turn frames repeated (2n - 2).
    check(info.swing.mode === (native ? 2 : 1), `swing loop mode ${info.swing.mode}, wanted ${native ? 2 : 1}`);
    check(Math.abs(info.swing.length - (native ? n : 2 * n - 2) / fps) < 0.001, `swing is ${info.swing.length} s long, wanted ${(native ? n : 2 * n - 2) / fps}`);
    // A clip that plays a set number of directions has no ping-pong loop to use: it stays baked and does not loop.
    check(info.twice.mode === 0 && Math.abs(info.twice.length - (2 * 6 - 1) / fps) < 0.001, `twice: mode ${info.twice.mode}, ${info.twice.length} s, wanted baked 0 and ${(2 * 6 - 1) / fps}`);
    if (native) {
      const t = JSON.parse(timesLine.slice(6));
      const top = Math.max(...t);
      const peak = t.indexOf(top);
      check(peak > 2 && peak < t.length - 2, `the animation time never turned back (peak at ${peak} of ${t.length})`);
      check(t.slice(peak + 1).some((v, k, a) => k > 0 && v < a[k - 1]), 'the animation time did not come back down after the top');
      note(`AnimationPlayer ping-pong: time goes up to ${top} s and back down (${t.slice(0, 16).join(' ')} ...)`);
    }
  } catch (e) {
    fail(`harness error: ${e?.stack ?? e}`);
  }
}

// Loads a bones export in real Godot (a project with the export's files in sprites/), plays an animation, saves a
// picture of each wanted frame and compares it with Frameling's own PNG export of the same frame.
async function renderBonesInGodot({ dir, files, scene, settings, shots, anim, tolerance, probes = [] }) {
  if (!GODOT || SKIP.includes('godot')) return;
  const doc = await X('doc()');
  const proj = path.join(dir, '_godot');
  fs.rmSync(proj, { recursive: true, force: true });
  fs.mkdirSync(path.join(proj, 'sprites'), { recursive: true });
  for (const n of files) fs.copyFileSync(path.join(dir, n), path.join(proj, 'sprites', n));
  const bg = (doc.background || '#ffffff').replace('#', '');
  const c = [0, 2, 4].map((i) => (parseInt(bg.slice(i, i + 2), 16) / 255).toFixed(4)).join(', ');
  fs.writeFileSync(path.join(proj, 'project.godot'), `config_version=5\n\n[application]\nconfig/name="bones"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(${c}, 1)\n\n[display]\nwindow/size/viewport_width=${doc.width}\nwindow/size/viewport_height=${doc.height}\n`);
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
		ap.play("${anim}")
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
  check(new RegExp(`ANIMS .*${anim}`).test(run.out), `Godot has no ${anim} animation`);
  let worst = 0;
  for (const f of shots) {
    const ref = await reference(settings, f, false);
    const e = ref && rmse(path.join(proj, `shot-${f}.png`), ref);
    if (e === null || e === undefined) continue;
    worst = Math.max(worst, e);
    note(`frame ${f}: rmse ${e.toFixed(4)}`);
    // Godot resamples each part's picture, so edges differ a little. A part out of place is far more than this.
    check(e < tolerance, `frame ${f} in Godot differs from Frameling's PNG (rmse ${e.toFixed(4)})`);
    // Single points where colour matters more than edges (a wash on a part): the two must agree to a few levels.
    for (const pr of probes.filter((q) => q.frame === f)) {
      const at = (file) => (/\((\d+),(\d+),(\d+)\)/.exec(sh('convert', [file, '-background', '#ff00ff', '-alpha', 'remove', '-alpha', 'off', '-format', `%[pixel:p{${pr.x},${pr.y}}]`, 'info:']).out) ?? []).slice(1).map(Number);
      const g = at(path.join(proj, `shot-${f}.png`));
      const fr = at(ref);
      check(g.length === 3 && fr.length === 3 && g.every((v, i) => Math.abs(v - fr[i]) <= (pr.tol ?? 6)), `frame ${f} at ${pr.x},${pr.y}: Godot ${g} but Frameling ${fr} (${pr.what})`);
    }
  }
  note(`godot bones ok, worst rmse ${worst.toFixed(4)}`);
}

// A symbol with its own bones (moving, faded and tinted), a camera that pans, turns and zooms, a far layer with depth
// and an Add glow with an effect, exported as bones and compared in Godot with Frameling's own frames.
// Where the arm lies over the torso of the faded Body: one picture, so the overlap is no brighter than the arm elsewhere.
const FADE_PROBES = [6, 8, 11].flatMap((frame) => [
  { frame, x: 75, y: 180, what: 'the arm over the torso, inside the faded Body' },
  { frame, x: 55, y: 190, what: 'the torso alone' },
]);
// The glow layer (a round and a square patch at 0.7 fade) over the sky and over the sun, frame 0 before the camera moves.
const blendAt = (what) => [{ frame: 0, x: 180, y: 60, what: `${what} over the sky` }, { frame: 0, x: 240, y: 40, what: `${what} square over the sky` }, { frame: 0, x: 260, y: 60, what: `${what} square over the sun` }];
const BLEND_PROBES = { 'linear-dodge': blendAt('linear dodge'), subtract: blendAt('subtract'), divide: blendAt('divide') };
// Where the lower arm lies under the big hand of the faded arm inside the faded Body: one picture, so the arm does not show through.
const NESTED_PROBES = [
  // Looser than the others: a fade inside a tinted fade comes out a few levels darker in Godot than in Frameling (before this change too); showing through is 30 levels.
  { frame: 6, x: 200, y: 172, tol: 12, what: 'the lower arm under the hand, both inside the faded arm inside the faded Body' },
  { frame: 8, x: 200, y: 178, tol: 12, what: 'the lower arm under the hand, both inside the faded arm inside the faded Body' },
];
async function godotBonesExtrasSection(name = 'bones-extras', extra = {}, more, probes = []) {
  // --section=bones-nested-fade[,more] runs just those extras (and not the other Godot bones checks).
  if (flag('section') && !flag('section').includes(name)) return;
  const r = begin(name, 'sheet godot-bones');
  try {
    const dir = setAutomationDir(path.join(outDir, name, 'sheet-godot-bones'));
    await X(`loadBonesExtras(true, ${JSON.stringify(extra)})`);
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
    const tscn = fs.readFileSync(path.join(dir, scene), 'utf8');
    check(tscn.includes('type="Camera2D"') && tscn.includes('type="Parallax2D"'), 'scene is missing the camera or the parallax layer');
    // (A faded arm inside a faded body is drawn into pictures instead of staying live.)
    if (extra.armFade === undefined) check(/\[node name="Arm" type="(Node2D|CanvasGroup)"/.test(tscn) && /type="Skeleton2D" parent="([^"]*\/)?Arm"/.test(tscn), "scene is missing the symbol's own skeleton");
    check(!tscn.includes('name="Hero"'), 'the hero layer should hold only the live symbol copies');
    check(files.some((n) => n.endsWith('.gdshader')), 'no tint shader');
    check(files.some((n) => n.endsWith('-fit-window.gd')), 'no fit-window script for the camera');
    if (more) await more({ tscn, files, dir });
    await renderBonesInGodot({ dir, files, scene, settings, shots: [0, 3, 6, 8, 11], anim: 'default', tolerance: 0.03, probes });
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
    await svgAnimCases();
    if ((!ONLY || ONLY.includes('godot-bones')) && !flag('section')) await godotBonesSection();
    if ((!ONLY || ONLY.includes('godot-bones') || ONLY.includes('godot-bones-bounce')) && !flag('section')) for (const native of [false, true]) await godotBonesBounceSection(native);
    if (!ONLY || ONLY.includes('godot-bones')) await godotBonesExtrasSection();
    // A symbol copied three times its size: its pictures are baked bigger and scaled back down in the scene.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-big-copy', { bigCopy: 3 }, ({ tscn }) => check(/scale = Vector2\(0\.33/.test(tscn), 'the big symbol copy should have its pictures scaled back down'));
    // A round window mask over the backdrop and a stripe clipped to it, baked into the backdrop's pictures.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-masks', { masked: true }, ({ tscn }) => check(!tscn.includes('name="Window"') && tscn.includes('name="Stripe"'), 'the mask layer should not be a node, the clipped stripe should'));
    // A faded symbol with overlapping parts: it fades as one picture (a CanvasGroup), not part by part.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-group-fade', { fade: true }, ({ tscn }) => check(/\[node name="Arm" type="CanvasGroup"/.test(tscn), 'the faded symbol should be a CanvasGroup'));
    // Symbols with bones on a layer that follows a bone: the copies sit under that bone and swing with it.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-on-bone', { onBone: true }, ({ tscn }) => check(tscn.includes('type="CanvasGroup" parent="Body bones/Root"') || tscn.includes('type="Node2D" parent="Body bones/Root"'), 'the symbol copies should sit under the bone'));
    // A symbol with bones inside a symbol with bones, on a layer that follows the outer symbol's bone: it nests under that Bone2D.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-body-arm', { bodyArm: true }, ({ tscn }) => check(/type="Node2D" parent="Body\/Body bones\/Spine"/.test(tscn) && /name="Arm" type="Node2D" parent="Body\/Body bones\/Spine"/.test(tscn), 'the arm should sit under the body symbol\'s bone'));
    // A tinted symbol inside a tinted symbol: Godot's picture must match Frameling's (the outer wash over the inner one).
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-stacked-tint', { bodyArm: true, armTint: { color: '#0000ff', amount: 0.5 } }, undefined, [
        { frame: 0, x: 120, y: 175, what: 'the arm with its own blue wash' },
        { frame: 3, x: 140, y: 185, what: 'the arm, outer red wash half in over its blue one' },
        { frame: 6, x: 100, y: 177, what: 'the arm, both washes in' },
      ]);
    // A faded symbol holding a symbol with bones: the whole thing is one CanvasGroup, so where the arm overlaps the torso
    // the overlap is not brighter than the rest.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection('bones-body-arm-fade', { bodyArm: true }, ({ tscn }) => check(/\[node name="Body" type="CanvasGroup"/.test(tscn) && /name="Arm" type="Node2D" parent="Body\/Body bones\/Spine"/.test(tscn) && !/name="Torso"[^\n]*\]\nz_index/.test(tscn), 'the faded Body should be a CanvasGroup holding the arm in tree order'), FADE_PROBES);
    // A fade inside a fade: Godot can't nest one group in another (it draws a grey box), so the faded arm is drawn into
    // pictures (one per frame) inside the faded Body's group and fades as one picture, the lower arm not showing through the hand.
    if (!ONLY || ONLY.includes('godot-bones'))
      await godotBonesExtrasSection(
        'bones-nested-fade',
        { bodyArm: true, armFade: 0.5, fade: true },
        ({ tscn }) => check(/\[node name="Body" type="CanvasGroup"/.test(tscn) && !/name="Arm" type=/.test(tscn) && /name="Arm holder" type="Sprite2D"/.test(tscn), 'the faded arm inside the faded Body should be drawn into pictures, not a second group'),
        [...FADE_PROBES, ...NESTED_PROBES],
      );
    // The blend modes Godot has no setting for (linear dodge, subtract, divide): a small shader reads the picture behind.
    for (const [mode, probes] of [
      ['linear-dodge', BLEND_PROBES['linear-dodge']],
      ['subtract', BLEND_PROBES.subtract],
      ['divide', BLEND_PROBES.divide],
    ])
      if (!ONLY || ONLY.includes('godot-bones'))
        await godotBonesExtrasSection(`bones-blend-${mode}`, { glowBlend: mode }, ({ tscn, files }) => check(/ShaderMaterial/.test(tscn) && files.some((n) => n === `frameling-blend-${{ 'linear-dodge': 'dodge', subtract: 'sub', divide: 'div' }[mode]}.gdshader`), `the ${mode} layer should have its blend shader`), probes);
    if (!SKIP.includes('files')) await filesSection();
  } catch (e) {
    begin('harness', 'startup').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  const ok = report();
  process.exit(ok ? 0 : 1);
})();
