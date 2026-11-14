// How every Electron harness picks its drawing engine, in one place, so a number or a pixel always says where it came from.
//
//   const gpu = require('../lib/gpu.cjs');
//   gpu.use('software');            // before app.whenReady(): pixel comparisons that must be reproducible
//   gpu.use('card');                // a run that claims to measure speed
//   ...
//   await gpu.confirm();            // after ready: reads what the engine really got, prints one line, throws on a mismatch
//
// Two modes, and nothing in between:
//   software  SwiftShader, the software driver that ships inside Electron. The same everywhere, so the same pixels
//             on any machine, with or without a card. Fails if a real card turns up instead.
//   card      the real card, with the same flags the Linux AppImage launcher uses (build/linux/launcher.sh, and
//             test/platform/gpu-flags.test.ts keeps the two in step). Fails if the engine quietly fell back to software.
//             That silent fall back is the trap: a "speed" run on llvmpipe or SwiftShader looks fine and means nothing.
//
// GPU_MODE=card or GPU_MODE=software in the environment overrides what a harness asked for (used to compare the two).
//
// Both modes pin the colour profile to sRGB (the same switch the app sets, src/main/gpuFlags.ts), so what a harness
// draws is what it writes out. xvfb has no card of its own to present on, but Vulkan draws without a screen, so under
// xvfb the "card" mode still draws on the real card and only the presenting is virtual.
//
// Options: { noGpu: true } (software only) has no GPU process at all, which a window drawn with webPreferences.offscreen
// needs: with SwiftShader on, such a window paints nothing. WebGL does not exist there. { webgpu: true } adds WebGPU. Electron then has it on the software Vulkan driver (Mesa lavapipe), and
// SwiftShader's ANGLE switch makes the GPU process drop the device, so a software run with webgpu leaves ANGLE alone
// and is only told apart from the card by its renderer name. The text it reports says so.

const { app, BrowserWindow } = require('electron');

const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft basic/i;

// Kept in the same order as GPU_ARGS in build/linux/launcher.sh.
const CARD_SWITCHES = [['ignore-gpu-blocklist'], ['enable-features', 'Vulkan,DefaultANGLEVulkan'], ['enable-zero-copy'], ['canvas-oop-rasterization']];
const SOFTWARE_SWITCHES = [['ignore-gpu-blocklist'], ['enable-unsafe-swiftshader'], ['use-angle', 'swiftshader']];
// The colour profile pin; src/main/gpuFlags.ts sets the same switch for the app.
const COLOUR_SWITCH = ['force-color-profile', 'srgb'];

let chosen = null;

/** The switches a mode sets, as [name, value?] pairs (exported so a test can compare them with the launcher). */
function switchesFor(mode, opts = {}) {
  if (mode === 'software' && opts.noGpu) return [COLOUR_SWITCH];
  const base = mode === 'card' ? [...CARD_SWITCHES] : opts.webgpu ? [['ignore-gpu-blocklist']] : [...SOFTWARE_SWITCHES];
  if (opts.webgpu) base.push(['enable-unsafe-webgpu']);
  return [...base, COLOUR_SWITCH];
}

/** Sets the switches. Call once, before the app is ready. Returns the mode that will be used. */
function use(mode, opts = {}) {
  if (app.isReady()) throw new Error('gpu.use() has to run before app.whenReady(): the engine reads its switches at start.');
  const env = process.env.GPU_MODE;
  if (env && env !== 'card' && env !== 'software') throw new Error(`GPU_MODE must be "card" or "software", not "${env}".`);
  const m = env || mode;
  if (m !== 'card' && m !== 'software') throw new Error(`gpu.use() takes "card" or "software", not "${mode}".`);
  if (m === 'software' && opts.noGpu) app.disableHardwareAcceleration();
  for (const [k, v] of switchesFor(m, opts)) v === undefined ? app.commandLine.appendSwitch(k) : app.commandLine.appendSwitch(k, v);
  chosen = { mode: m, requested: mode, opts };
  return m;
}

const PROBE_JS = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, 2, 2);
  return {
    renderer: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null,
    webgl2: !!gl,
    wideGamut: matchMedia('(color-gamut: p3)').matches,
    red: Array.from(g.getImageData(0, 0, 1, 1).data),
  };
})()`;

/**
 * What WebGL and the page say about the engine. With a window (a harness that runs the real app has one, and the app
 * quits when its last window closes, so a throwaway one is no use there) it asks that window's page; without, it opens
 * a hidden one for the purpose.
 */
async function probe(existing) {
  if (existing) {
    if (existing.webContents.isLoading()) await new Promise((r) => existing.webContents.once('did-finish-load', r));
    return existing.webContents.executeJavaScript(PROBE_JS);
  }
  // Closing the only window would make Electron quit before the harness has opened its own, unless something is listening.
  const hold = () => {};
  app.on('window-all-closed', hold);
  const win = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { sandbox: true, backgroundThrottling: false } });
  try {
    await win.loadURL('data:text/html,<meta charset=utf-8>');
    return await win.webContents.executeJavaScript(PROBE_JS);
  } finally {
    win.destroy();
    await new Promise((r) => setTimeout(r, 100));
    app.removeListener('window-all-closed', hold);
  }
}

/**
 * What is wrong, if anything, with what the engine gave for the mode that was asked for. `page` is the probe's answer
 * ({ renderer, webgl2, wideGamut, red }) and `f` is app.getGPUFeatureStatus(). An empty list means it is as asked.
 */
function judge(mode, page, f, opts = {}) {
  const renderer = page.renderer || '(no WebGL)';
  const soft = SOFT.test(renderer);
  const problems = [];
  if (page.wideGamut) problems.push('the colour profile is not pinned to sRGB (the page sees a wide-gamut screen)');
  if (page.red.join() !== '255,0,0,255') problems.push(`a 2D canvas drawn rgb(255,0,0) reads back ${page.red.join(',')}`);
  if (mode === 'card') {
    if (!page.webgl2) problems.push('asked for the card but WebGL 2 is not available at all');
    if (soft) problems.push(`asked for the card and got software (${renderer})`);
    if (f.gpu_compositing !== 'enabled') problems.push(`asked for the card but the window is composited in software (gpu_compositing: ${f.gpu_compositing})`);
    if (f['2d_canvas'] !== 'enabled') problems.push(`asked for the card but 2D canvas is not on it (2d_canvas: ${f['2d_canvas']})`);
  } else if (opts.noGpu) {
    if (f.gpu_compositing === 'enabled') problems.push(`asked for no GPU at all and the GPU is on (gpu_compositing: ${f.gpu_compositing})`);
    if (page.renderer && !soft) problems.push(`asked for no GPU at all and got a real card (${page.renderer})`);
  } else if (!soft) {
    problems.push(`asked for software and got a real card (${renderer}), so the pixels would not be the same everywhere`);
  }
  return problems;
}

/**
 * Reads what the engine really got and checks it against what was asked for. Prints one line (the same text is in the
 * returned `text`, for a harness to keep in its results) and throws when the answer is not the mode, or the colour is
 * not pinned. Call after app.whenReady(), with the harness's window if it already has one (see probe).
 */
async function confirm(win) {
  if (!chosen) throw new Error('gpu.confirm() before gpu.use(): nothing says which mode this run is meant to be in.');
  const page = await probe(win);
  const f = app.getGPUFeatureStatus();
  const renderer = page.renderer || '(no WebGL)';
  const soft = SOFT.test(renderer);
  const info = {
    mode: chosen.mode,
    requested: chosen.requested,
    renderer,
    software: soft,
    compositing: f.gpu_compositing,
    canvas2d: f['2d_canvas'],
    rasterization: f.rasterization,
    vulkan: f.vulkan,
    webgl2: page.webgl2,
    colourProfile: page.wideGamut ? 'wide-gamut (NOT pinned)' : 'sRGB (pinned)',
    platform: process.platform,
    session: process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'none'),
    electron: process.versions.electron,
  };
  const problems = judge(chosen.mode, page, f, chosen.opts);
  const note = chosen.mode === 'software' && chosen.opts.webgpu ? ' (WebGPU, so the ANGLE switch is left alone)' : chosen.opts.noGpu ? ' (no GPU process at all)' : '';
  info.text = `[gpu] ${chosen.mode}${note}: ${renderer} | compositing ${f.gpu_compositing}, canvas ${f['2d_canvas']}, raster ${f.rasterization}, vulkan ${f.vulkan} | ${info.colourProfile} | ${info.session}`;
  console.log(info.text);
  if (problems.length) {
    const msg = `[gpu] FAILED: ${problems.join('; ')}.`;
    console.log(msg);
    const e = new Error(msg);
    e.gpu = info;
    throw e;
  }
  return info;
}

/** The same as confirm(), but a mismatch ends the process with a failure rather than throwing (for a harness with no catch). */
async function confirmOrExit(win) {
  try {
    return await confirm(win);
  } catch (e) {
    app.exit(1);
    throw e;
  }
}

/** The mode in force, or null before use(). */
const current = () => (chosen ? chosen.mode : null);

module.exports = { use, judge, confirm, confirmOrExit, current, switchesFor, probe, SOFT, CARD_SWITCHES, SOFTWARE_SWITCHES, COLOUR_SWITCH };
