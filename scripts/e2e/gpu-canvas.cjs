// Does the canvas draw when the GPU is on? Starts the REAL app (dist/main) once per way of asking for the card, opens a
// starter drawing in it, takes a picture of the WINDOW (the composited result, through the debugging port) and judges the
// canvas area: empty, or not the same as the software drawing of the same file, fails. A flag that blanks the canvas can
// not ship past this, and that matters more than any one flag: a blank canvas makes the app look like it lost your work.
//
//   npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/e2e/gpu-canvas.cjs [--only name,name] [--explore] [--shots dir]
//
// Every run says which adapter it really got (the page's own WebGL renderer, read from the window that drew) and, when a
// card was asked for, whether the app's graphics process was on the NVIDIA card WHILE it ran (nvidia-smi, taken during, not
// after). A run that asked for a card and got software fails: a number or a picture with no named adapter is not a result.
//
// Under xvfb OpenGL has no card of its own, so the "card" runs set FRAMELING_CARD=discrete (which is what the app does by
// itself on a computer with two cards) and Vulkan draws on the card without needing the screen. What xvfb cannot show is the
// last step on a real screen (presenting the card's pixels to a real X server): see docs/colour-and-gpu.md.
//
// --explore adds the Vulkan combinations. They report but never fail the run, because they are not shipped.
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { judgeCanvas } = require('../lib/canvas-judge.cjs');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const explore = argv.includes('--explore');
const only = (argv[argv.indexOf('--only') + 1] || '').split(',').filter((x) => x && argv.includes('--only'));
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const requireCard = !argv.includes('--allow-software');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft basic/i;

// name: what it is called in the report. ship: must pass (it is what a person gets). card: must be on a real card.
const CONFIGS = [
  { name: 'software', env: { FRAMELING_GPU: 'off' }, ship: true, card: false },
  { name: 'as-shipped', env: { FRAMELING_CARD: 'discrete' }, ship: true, card: true },
  { name: 'full', env: { FRAMELING_CARD: 'discrete', FRAMELING_GPU: 'full' }, ship: true, card: true },
  // What the user's own Chrome runs all day on the real screen: Skia on Vulkan, ANGLE left on OpenGL (no DefaultANGLEVulkan).
  { name: 'skia-vulkan', env: { FRAMELING_CARD: 'discrete', FRAMELING_GPU: 'skia' }, ship: false, card: true },
  { name: 'skia-vulkan+chrome-args', env: { FRAMELING_CARD: 'discrete' }, args: ['--use-vulkan', '--enable-features=Vulkan'], ship: false, card: true },
  // Skia on Vulkan with the card not asked for: WebGL lands on llvmpipe, Skia is on the card all the same.
  { name: 'skia-vulkan-nocard', env: { FRAMELING_CARD: 'system', FRAMELING_GPU: 'skia' }, ship: false, card: false },
  { name: 'vulkan', env: { FRAMELING_GPU: 'vulkan' }, ship: false, card: true },
  { name: 'vulkan+use-vulkan', env: { FRAMELING_GPU: 'vulkan' }, args: ['--use-vulkan'], ship: false, card: true },
  { name: 'vulkan+angle-vulkan', env: { FRAMELING_GPU: 'vulkan' }, args: ['--use-angle=vulkan', '--use-vulkan'], ship: false, card: true },
  { name: 'vulkan+from-angle', env: { FRAMELING_GPU: 'vulkan' }, args: ['--enable-features=VulkanFromANGLE', '--use-vulkan'], ship: false, card: true },
  { name: 'vulkan+full', env: { FRAMELING_GPU: 'full' }, args: ['--enable-features=Vulkan,DefaultANGLEVulkan', '--use-vulkan'], ship: false, card: true },
];
const TEMPLATES = ['bouncing-ball', 'hero-sprites'];

const GRID = 24;
const PAGE_GRID = (rect) => `(async (rect, shotB64, G) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('picture did not decode')); img.src = 'data:image/png;base64,' + shotB64; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const cells = [];
  const cw = img.width / G, ch = img.height / G;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const d = g.getImageData(Math.floor(x * cw), Math.floor(y * ch), Math.max(1, Math.floor(cw)), Math.max(1, Math.floor(ch))).data;
    let r = 0, gg = 0, b = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    cells.push([r / n, gg / n, b / n]);
  }
  return cells;
})(${JSON.stringify(rect)}, %B64%, ${GRID})`;

function tree(port) {
  const out = new Set();
  try {
    const rows = execSync('ps -eo pid=,ppid=,comm=,args=', { encoding: 'utf8', maxBuffer: 1e7 })
      .trim().split('\n').map((l) => { const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l); return m && { pid: m[1], ppid: m[2], comm: m[3], args: m[4] }; }).filter(Boolean);
    const walk = (p) => { if (out.has(p)) return; out.add(p); rows.filter((r) => r.ppid === p).forEach((r) => walk(r.pid)); };
    rows.filter((r) => /electron|frameling/.test(r.comm) && r.args.includes('--remote-debugging-port=' + port)).forEach((r) => walk(r.pid));
  } catch { /* nothing running */ }
  return out;
}

function smi() {
  try {
    const t = execSync('nvidia-smi pmon -c 1 -s um 2>&1', { encoding: 'utf8' });
    return t.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/)[1]);
  } catch { return null; }
}

/** One start of the real app, one drawing: what the window showed and what it really ran on. */
async function run(cfg, template, { hide = false } = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-gpucanvas-'));
  const child = spawn(path.join(root, 'node_modules/electron/dist/electron'), [root, `--remote-debugging-port=${port}`, ...(cfg.args || [])], {
    detached: true, stdio: 'ignore', cwd: root,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, 'config'), ...cfg.env },
  });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) {
      await sleep(500);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    }
    if (!target) throw new Error('the app did not open');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) waiting.get(m.id)(m); };
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result.value; };
    await sleep(2500);
    await send('Page.enable');
    await send('Page.navigate', { url: 'file://' + root + '/dist/renderer/index.html?debug=1' });
    await sleep(3500);
    await ev(`window.__frameling.template(${JSON.stringify(template)})`);
    await sleep(2500);
    if (hide) { await ev("(() => { const s = document.createElement('style'); s.textContent = 'canvas { visibility: hidden !important }'; document.head.appendChild(s); })()"); await sleep(500); }
    const rect = await ev(`(() => { let best = null, area = 0; for (const c of document.querySelectorAll('canvas')) { const r = c.getBoundingClientRect(); if (r.width * r.height > area && r.width > 100) { area = r.width * r.height; best = r; } } return best && { x: best.x, y: best.y, width: best.width, height: best.height }; })()`);
    if (!rect) throw new Error('no canvas on the page');
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
    const cells = await ev(PAGE_GRID(rect).replace('%B64%', JSON.stringify(shot.result.data)));
    const report = await ev('window.frameling.gpu.report()');
    const onCard = smi();
    const ours = tree(port);
    if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); fs.writeFileSync(path.join(shotsDir, `${cfg.name}-${template}.png`), Buffer.from(shot.result.data, 'base64')); }
    ws.close();
    return { cells, renderer: report.liveRenderer || '(no WebGL)', asked: report.asked, flags: report.flags, features: report.features, skia: report.skia, impl: report.glImplementation, cardPids: onCard ? [...ours].filter((p) => onCard.includes(p)) : null, smiThere: !!onCard };
  } finally {
    for (const p of tree(port)) { try { process.kill(Number(p), 'SIGKILL'); } catch { /* gone */ } }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
}

async function main() {
  if (!fs.existsSync(path.join(root, 'dist/main/main.cjs'))) throw new Error('No build. Run npm run build first.');
  const configs = CONFIGS.filter((c) => (only.length ? only.includes(c.name) : c.ship || explore));
  const refs = {};
  let failed = 0;
  // The software drawing of each file is the reference every other run is compared with.
  const order = [CONFIGS[0], ...configs.filter((c) => c.name !== 'software')];
  for (const cfg of order) {
    for (const t of TEMPLATES) {
      let line;
      let problems = [];
      try {
        const r = await run(cfg, t);
        if (cfg.name === 'software') refs[t] = r.cells;
        const soft = SOFT.test(r.renderer);
        problems = judgeCanvas(r.cells, cfg.name === 'software' ? null : refs[t]);
        if (cfg.card && requireCard) {
          if (soft) problems.push(`asked for the card and the page is drawing on ${r.renderer}`);
          else if (r.smiThere && !r.cardPids.length) problems.push('the page names a card but none of the app\'s processes is on the NVIDIA card in nvidia-smi');
        }
        const proof = !cfg.card ? '' : r.cardPids === null ? ' (nvidia-smi not available)' : ` on the card in nvidia-smi: pid ${r.cardPids.join(',') || 'none'}`;
        line = `${cfg.name.padEnd(20)} ${t.padEnd(14)} adapter: ${r.renderer}${proof} [vulkan feature ${r.features.vulkan}, skia ${r.skia}]`;
      } catch (e) {
        problems.push(String(e.message || e));
        line = `${cfg.name.padEnd(20)} ${t.padEnd(14)} (did not run)`;
      }
      const bad = problems.length > 0;
      if (bad && cfg.ship) failed++;
      console.log(`${bad ? (cfg.ship ? 'FAIL' : 'blank/odd') : 'ok  '} ${line}${bad ? '\n       ' + problems.join('\n       ') : ''}`);
    }
  }
  // The control: the same drawing with its canvas hidden. The check has to call that empty, or it cannot tell blank from drawn.
  try {
    const c = await run({ ...CONFIGS[0], name: 'control' }, TEMPLATES[0], { hide: true });
    const caught = judgeCanvas(c.cells, refs[TEMPLATES[0]]).length > 0;
    console.log(`${caught ? 'ok  ' : 'FAIL'} control: a hidden canvas ${caught ? 'is caught as empty' : 'was NOT caught, so this check cannot be trusted'}`);
    if (!caught) failed++;
  } catch (e) { console.log(`FAIL control did not run: ${e.message || e}`); failed++; }
  console.log(failed ? `\n${failed} shipped run(s) failed.` : '\nEvery shipped way of drawing puts the drawing in the window.');
  process.exit(failed ? 1 : 0);
}

module.exports = { CONFIGS, TEMPLATES };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
