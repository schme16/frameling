// Starts the PACKAGED Linux app (the AppImage, or the unpacked folder the AppImage is made from) and asks the engine
// what it really drew with, from outside, over the debugging port. Nothing in the app is changed or probed for the test.
//
//   npm run dist:linux     (or: npx electron-builder --linux AppImage --publish never)
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e/appimage-gpu.cjs [path] [--require-card] [--keep-going]
//
// path: an .AppImage, or the launcher inside release/linux-unpacked. Default: the AppImage in release/, else the unpacked one.
//
// Four starts, each in its own throwaway config folder (so it never meets a Frameling you have open):
//   1. as shipped            the command line has --ignore-gpu-blocklist, and the engine's own verdicts for compositing,
//                            2D canvas, rasterization and WebGL are all "enabled", a 2D canvas and WebGL 2 draw, and the
//                            app does not claim a fall back.
//   2. FRAMELING_GPU=off     the flag is gone and every verdict is software. This is the control: it shows the check can
//                            tell the two apart, and that the switch to turn the card off works.
//   3. a broken card         a card that cannot be used (the engine is told to use a driver that does not exist). The
//                            app must still open, draw, say in its log that it fell back to software, and have the engine
//                            saying software, so a bad driver is never a window that will not open.
//   4. FRAMELING_GPU=full    the fuller set (zero copy, canvas on the card) is on the command line and still draws.
//
// What this can prove under xvfb: the switch reaches the engine through the real launcher, the engine's hardware path is on
// where it was off, and the fall backs work. What it cannot: xvfb has no card to present on, so its OpenGL is Mesa's
// llvmpipe, which is software. The report says which adapter each start really got, and says so when it is software.
// --require-card turns that into a failure, for a run on a real display (the gpu-real-runs card).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const requireCard = argv.includes('--require-card');
const keepGoing = argv.includes('--keep-going');
const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft basic/i;
const FALLBACK_LINE = /\[gpu\] hardware drawing was asked for but the engine is drawing in software/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findApp() {
  const given = argv.find((a) => !a.startsWith('--'));
  if (given) return path.resolve(given);
  const rel = path.join(root, 'release');
  const image = fs.existsSync(rel) ? fs.readdirSync(rel).find((f) => /\.AppImage$/.test(f)) : null;
  if (image) return path.join(rel, image);
  const unpacked = path.join(rel, 'linux-unpacked/frameling');
  if (fs.existsSync(unpacked)) return unpacked;
  throw new Error('No built app. Run npm run dist:linux first, or pass the path of an AppImage or release/linux-unpacked/frameling.');
}

/** A debugging-protocol connection to one websocket address. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('debugging port refused ' + url));
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id;
    waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, close: () => ws.close() };
}

const PAGE_JS = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const g = c.getContext('2d'); g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, 2, 2);
  let glRed = null;
  if (gl) { // draw one pixel with WebGL and read it back, so "there is a renderer" also means "it draws"
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, 1, 1); gl.clearColor(0, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); glRed = Array.from(px);
  }
  return {
    renderer: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null,
    webgl2: !!gl, canvas: Array.from(g.getImageData(0, 0, 1, 1).data), webglPixel: glRed,
    ready: document.readyState, hasApp: !!document.getElementById('root') && document.getElementById('root').children.length > 0,
  };
})()`;

/** Starts the app with the given environment and extra arguments, reads what the engine says, stops it. */
async function run(target, label, { env = {}, args = [], settle = 0 }) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-gpu-check-'));
  const isImage = /\.AppImage$/.test(target);
  const child = spawn(target, [`--remote-debugging-port=${port}`, ...args], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // A config folder of its own: no meeting a Frameling that is open, no touching the real gpu-off file.
      XDG_CONFIG_HOME: path.join(home, 'config'),
      HOME: home,
      // This is a throwaway window on a virtual screen: ask nothing about the sandbox, and no FUSE needed for an AppImage.
      FRAMELING_NO_SANDBOX: '1',
      ...(isImage ? { APPIMAGE_EXTRACT_AND_RUN: '1' } : {}),
      FRAMELING_GPU: '',
      ...env,
    },
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = null;
  child.on('exit', (code) => (exited = code));
  const out = { label, problems: [], log: '' };
  try {
    let page = null;
    for (let i = 0; i < 80 && !page && exited === null; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        page = list.find((t) => t.type === 'page' && !/^devtools:/.test(t.url));
      } catch {}
      if (!page) await sleep(500);
    }
    if (!page) throw new Error(`the app did not open a window${exited !== null ? ` (it exited with ${exited})` : ''}`);
    const tab = await connect(page.webSocketDebuggerUrl);
    let p = null;
    for (let i = 0; i < 40; i++) {
      const r = await tab.send('Runtime.evaluate', { expression: PAGE_JS, returnByValue: true });
      p = r.result && r.result.result && r.result.result.value;
      if (p && p.hasApp) break;
      await sleep(500);
    }
    tab.close();
    if (!p || !p.hasApp) throw new Error('the window opened but the app never drew its interface');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = await connect(version.webSocketDebuggerUrl);
    const info = (await browser.send('SystemInfo.getInfo')).result;
    browser.close();
    out.page = p;
    out.features = info.gpu.featureStatus;
    out.commandLine = info.commandLine || '';
    out.renderer = p.renderer || '(no WebGL)';
    out.software = SOFT.test(out.renderer);
    // The app says in its log, a few seconds after the window loads, if the card was asked for and software is drawing.
    for (let waited = 0; waited < settle && !FALLBACK_LINE.test(log); waited += 250) await sleep(250);
    out.saidFallback = FALLBACK_LINE.test(log);
  } catch (e) {
    out.problems.push(e.message);
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await sleep(300);
    out.log = log;
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  }
  return out;
}

const HARDWARE_JOBS = ['gpu_compositing', '2d_canvas', 'rasterization', 'webgl'];
const verdicts = (r) => HARDWARE_JOBS.map((j) => `${j} ${r.features[j]}`).join(', ');
const allOn = (r) => HARDWARE_JOBS.every((j) => String(r.features[j]).startsWith('enabled'));
const allSoftware = (r) => HARDWARE_JOBS.every((j) => !String(r.features[j]).startsWith('enabled'));

function expectDraws(r) {
  if (!r.page) return;
  if (r.page.canvas.join() !== '255,0,0,255') r.problems.push(`a 2D canvas drawn rgb(255,0,0) reads back ${r.page.canvas.join(',')}`);
}

async function main() {
  const target = findApp();
  console.log(`[appimage-gpu] ${target}`);
  console.log(`[appimage-gpu] screen: DISPLAY=${process.env.DISPLAY || '(none)'}, session ${process.env.XDG_SESSION_TYPE || 'unset'}`);
  if (!process.env.DISPLAY) throw new Error('No display. Run this inside xvfb-run -a -s "-screen 0 1600x1000x24" so it never opens on the desktop.');
  const results = [];

  const shipped = await run(target, 'as shipped', { settle: 5000 });
  if (!shipped.problems.length) {
    if (!/--ignore-gpu-blocklist/.test(shipped.commandLine)) shipped.problems.push('the engine\'s command line has no --ignore-gpu-blocklist, so nothing asked for the card');
    if (/--disable-gpu\b/.test(shipped.commandLine)) shipped.problems.push('the engine\'s command line has --disable-gpu');
    if (!allOn(shipped)) shipped.problems.push(`the hardware path is not on: ${verdicts(shipped)}`);
    if (!shipped.page.webgl2) shipped.problems.push('WebGL 2 is not available');
    if (shipped.page.webglPixel && shipped.page.webglPixel.join() !== '0,255,0,255') shipped.problems.push(`WebGL drew green and read back ${shipped.page.webglPixel.join(',')}`);
    if (requireCard && shipped.software) shipped.problems.push(`--require-card: the adapter is software (${shipped.renderer})`);
    if (shipped.saidFallback) shipped.problems.push('the app says it fell back to software, but the verdicts say the hardware path is on');
    expectDraws(shipped);
  }
  results.push(shipped);

  const off = await run(target, 'FRAMELING_GPU=off', { env: { FRAMELING_GPU: 'off' } });
  if (!off.problems.length) {
    if (/--ignore-gpu-blocklist/.test(off.commandLine)) off.problems.push('FRAMELING_GPU=off still has --ignore-gpu-blocklist on the command line');
    if (!allSoftware(off)) off.problems.push(`FRAMELING_GPU=off but the hardware path is on: ${verdicts(off)}`);
    expectDraws(off);
  }
  results.push(off);

  const broken = await run(target, 'a card that cannot be used', { args: ['--use-angle=no-such-driver', '--use-gl=no-such-driver'], settle: 9000 });
  if (!broken.problems.length) {
    if (allOn(broken) && !broken.software) broken.problems.push('a driver that does not exist still got the real card, so the case proves nothing');
    if (!broken.saidFallback) broken.problems.push('the app drew in software and did not say so in its log');
    expectDraws(broken);
  }
  results.push(broken);

  const full = await run(target, 'FRAMELING_GPU=full', { env: { FRAMELING_GPU: 'full' } });
  if (!full.problems.length) {
    for (const f of ['--ignore-gpu-blocklist', '--enable-zero-copy', '--canvas-oop-rasterization']) {
      if (!full.commandLine.includes(f)) full.problems.push(`FRAMELING_GPU=full: ${f} is not on the command line`);
    }
    if (/Vulkan/.test(full.commandLine)) full.problems.push('FRAMELING_GPU=full put Vulkan on the command line');
    if (!allOn(full)) full.problems.push(`the hardware path is not on: ${verdicts(full)}`);
    expectDraws(full);
  }
  results.push(full);

  let bad = 0;
  for (const r of results) {
    const state = r.problems.length ? 'FAIL' : 'ok';
    console.log(`[appimage-gpu] ${state.padEnd(4)} ${r.label}`);
    if (r.features) console.log(`               ${verdicts(r)}`);
    if (r.renderer) console.log(`               adapter: ${r.renderer}${r.software ? '  (software)' : ''}`);
    for (const p of r.problems) console.log(`               - ${p}`);
    if (r.problems.length) {
      bad++;
      if (r.log) console.log('               log tail: ' + r.log.trim().split('\n').slice(-6).join('\n                         '));
    }
  }
  if (shipped.software && !requireCard) {
    console.log('[appimage-gpu] note: the adapter above is software (xvfb has no card). This proves the switch reaches the engine and the hardware path is on; it does not prove a real card is drawing. Run with --require-card on a real display for that (gpu-real-runs).');
  }
  console.log(bad ? `[appimage-gpu] ${bad} of ${results.length} failed` : `[appimage-gpu] all ${results.length} passed`);
  process.exit(bad && !keepGoing ? 1 : 0);
}

main().catch((e) => {
  console.error('[appimage-gpu] ' + e.message);
  process.exit(1);
});
