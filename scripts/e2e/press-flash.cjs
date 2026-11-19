// The first frame of a pen press: the line as it shows the moment the pen touches, before it moves, should look like the
// start of the line it becomes, not a solid full strength blob. Every brush on the vector side, pressed lightly.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/press-flash.cjs [outDir]
//
// For each brush: press at a spot with light pressure, capture before any move, then move a little and lift, and capture
// the finished line. Compares the ink in a box around the spot. Exits non-zero when a press shows much more ink than
// the finished line has there. Leafy vine always trips it (its leaves sit at the start), so read the list, not the exit.
//
// Settings, all optional:
//   SIDE=pixel                 the pixel brushes on a pixel layer (default vector)
//   ONLY=chalk                 brushes whose name holds this
//   COLOUR='#86a9d3'           the colour (default black)
//   FORCE=0.35 PRESS_FORCE=0   the pen's pressure on the moves, and on the press itself
//   STILL=1                    the pen sits still a few samples while pressure climbs, as a Huion under X11 does
//   PEN_TOOL='{"stabilizer":12,"stabSet":true,"stabMode":"string"}'   the Brush's Pen and tablet settings
//   REPLAY=report.json         fires the press from a saved pen check report (its trace) as page events instead
//   SAVE_ALL=1                 keeps the pressed and finished pictures for every brush
//   GPU_MODE=card              draws on the graphics card (needs __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia)
const { app, BrowserWindow } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('press-flash.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-flash-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const frames = (n = 2) => ev(`new Promise((r) => { let k = ${n}; const f = () => (--k ? requestAnimationFrame(f) : r(true)); requestAnimationFrame(f); })`);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.webContents.setBackgroundThrottling(false));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!window.__frameling')) {
        await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false, onboarded: true })); localStorage.setItem('frameling.penCheck.v1', JSON.stringify({ done: true }))`);
        await win.loadURL(process.env.FRAMELING_DEV_URL);
        await sleep(2500);
        return;
      }
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

const dbg = () => win.webContents.debugger;
const pen = (type, x, y, force) =>
  dbg().sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !force ? 'none' : 'left', buttons: type === 'mouseReleased' || (type === 'mouseMoved' && !force) ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen', force });
const win_ = (x, y) => ev(`(() => { const { ui } = __frameling.store().get(); const b = document.querySelector('.cv-root').getBoundingClientRect(); return [Math.round(b.left + ui.panX + ${x} * ui.zoom), Math.round(b.top + ui.panY + ${y} * ui.zoom)]; })()`);

/** Ink in a box: the sum of how far each pixel is from the paper, over 255, so a solid black pixel counts 1. */
async function inkIn(cx, cy, r) {
  const img = await win.webContents.capturePage({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r });
  const bm = img.toBitmap();
  const { width, height } = img.getSize();
  let ink = 0;
  for (let i = 0; i < width * height; i++) ink += (255 * 3 - bm[i * 4] - bm[i * 4 + 1] - bm[i * 4 + 2]) / (255 * 3);
  return { ink, img };
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 10 * 60 * 1000);
  const force = Number(process.env.FORCE ?? 0.2);
  // Under X11 the press itself carries no pressure, and the reading comes with the first move (a Huion Kamvas: 0, then 0.04).
  const pressForce = Number(process.env.PRESS_FORCE ?? force);
  const rows = [];
  try {
    await startApp();
    dbg().attach('1.3');
    const side = process.env.SIDE === 'pixel' ? 'pixel' : 'vector';
    const brushes = await ev(`__brushes.list('${side}')`);
    for (const b of brushes) {
      if (process.env.ONLY && !b.name.toLowerCase().includes(process.env.ONLY.toLowerCase())) continue;
      await ev(`(() => { const F = __frameling; F.pen.reset(); F.template('blank-${side}'); F.store().setUi({ tool: 'brush', color: ${JSON.stringify(process.env.COLOUR ?? '#000000')}, zoom: 1, panX: 40, panY: 40 }); const ok = __brushes.use(${JSON.stringify(b.id)}); if (${JSON.stringify(process.env.PEN_TOOL ?? '')}) F.pen.setTool('brush', JSON.parse(${JSON.stringify(process.env.PEN_TOOL ?? '{}')})); return ok; })()`);
      await sleep(250);
      const [x, y] = await win_(200, 200);
      await pen('mouseMoved', x, y, 0);
      await sleep(40);
      if (process.env.REPLAY) {
        // A press from a saved pen check report, fired as page events: the samples from the press on, moved to this spot.
        const t = JSON.parse(fs.readFileSync(process.env.REPLAY, 'utf8')).trace.samples;
        const at = t.findIndex((s) => s[1] === 'pointerdown');
        const run = t.slice(at, at + 40);
        const [, , x0, y0] = run[0];
        let worst = null;
        for (const [, type, sx, sy, pressure, tiltX, tiltY, twist, button, buttons] of run) {
          await ev(`(() => { const r = document.querySelector('.cv-root'); r.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: ${x + sx - x0}, clientY: ${y + sy - y0}, pressure: ${pressure}, tiltX: ${tiltX}, tiltY: ${tiltY}, twist: ${twist}, button: ${button}, buttons: ${buttons} })); })()`);
          await frames(1);
          const k = await inkIn(x, y, 30);
          if (!worst || k.ink > worst.ink) worst = k;
          if (type === 'pointerup') break;
        }
        const last = run[run.length - 1];
        await ev(`document.querySelector('.cv-root').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: ${x + last[2] - x0}, clientY: ${y + last[3] - y0}, pressure: 0, button: 0, buttons: 0 }))`);
        await sleep(250);
        await frames(2);
        const done = await inkIn(x, y, 30);
        rows.push({ name: b.name, pressed: Math.round(worst.ink), done: Math.round(done.ink), ratio: +(worst.ink / Math.max(1, done.ink)).toFixed(2) });
        const slug = b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        fs.writeFileSync(path.join(outDir, `${slug}-pressed.png`), worst.img.toPNG());
        fs.writeFileSync(path.join(outDir, `${slug}-done.png`), done.img.toPNG());
        continue;
      }
      await pen('mousePressed', x, y, pressForce);
      await frames(2);
      let pressed = await inkIn(x, y, 30);
      // As a Huion under X11 sends it: the pen sits still for a few samples while the pressure climbs to the real reading.
      for (const f of [0.116, 0.231, 0.32].filter(() => process.env.STILL)) {
        await pen('mouseMoved', x, y, f);
        await frames(1);
        const k = await inkIn(x, y, 30);
        if (k.ink > pressed.ink) pressed = k;
      }
      for (let i = 1; i <= 12; i++) {
        await pen('mouseMoved', x + i * 8, y, force);
        await sleep(12);
      }
      await pen('mouseReleased', x + 96, y, 0);
      await sleep(250);
      await frames(2);
      const done = await inkIn(x, y, 30);
      const ratio = pressed.ink / Math.max(1, done.ink);
      rows.push({ name: b.name, pressed: Math.round(pressed.ink), done: Math.round(done.ink), ratio: +ratio.toFixed(2) });
      const slug = b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      if (ratio > 1.5 || process.env.SAVE_ALL) {
        fs.writeFileSync(path.join(outDir, `${slug}-pressed.png`), pressed.img.toPNG());
        fs.writeFileSync(path.join(outDir, `${slug}-done.png`), done.img.toPNG());
      }
    }
  } catch (e) {
    console.log('harness:', e?.stack ?? e);
  }
  clearTimeout(guard);
  rows.sort((a, b) => b.ratio - a.ratio);
  for (const r of rows) console.log(`${r.ratio > 1.5 ? 'FLASH' : 'ok   '} ${r.name.padEnd(28)} pressed ${String(r.pressed).padStart(5)}  finished ${String(r.done).padStart(5)}  x${r.ratio}`);
  fs.writeFileSync(path.join(outDir, 'press-flash.json'), JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => r.ratio > 1.5);
  console.log(`${rows.length - bad.length} of ${rows.length} brushes start the way they finish (press ${pressForce}, then ${force}). Output: ${outDir}`);
  app.exit(bad.length || !rows.length ? 1 : 0);
})();
