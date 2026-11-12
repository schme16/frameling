// Pen and tablet checks in the real app: Chromium's own pen pointer events (made with the DevTools protocol, which sets
// pointerType "pen", pressure, tilt and twist for real), through the real canvas and tools. No tablet needed.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pen.cjs [outDir]
//
// Checks: pressure changes the line's width and opacity (in the stored points and on screen), tilt and twist arrive,
// the hover ring, the eraser end (and back to the tool), the two barrel buttons, the stabilizer, palm rejection, and
// two finger pan and zoom. Exits non-zero when anything fails.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('pen.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-pen-')));
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
const ev = (js) => win.webContents.executeJavaScript(js, true).catch((e) => { throw new Error(String(e.message) + ' in: ' + js.slice(0, 160).replace(/\s+/g, ' ')); });

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
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
      if (await ev('!!window.__frameling')) {
        // No welcome sheet, and no Quill offer of the pen check to get in the way.
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

// ---------------------------------------------------------------- pen input, made by Chromium

const dbg = () => win.webContents.debugger;
const pen = (type, x, y, o = {}) =>
  dbg().sendCommand('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: o.buttons || type !== 'mouseMoved' ? 'left' : 'none',
    buttons: o.buttons ?? (type === 'mouseReleased' ? 0 : 1),
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'pen',
    force: o.force ?? 0,
    tiltX: o.tiltX ?? 0,
    tiltY: o.tiltY ?? 0,
    twist: o.twist ?? 0,
  });

/** Where a document point is in the window. */
const win_ = (x, y) => ev(`(() => { const { ui } = __frameling.store().get(); const b = document.querySelector('.cv-root').getBoundingClientRect(); return [Math.round(b.left + ui.panX + ${x} * ui.zoom), Math.round(b.top + ui.panY + ${y} * ui.zoom)]; })()`);

/** A pen stroke along a line from (x0, y) to (x1, y), samples `n`, with a force and tilt for each sample (functions of 0 to 1). */
async function penStroke(x0, x1, y, n, { force, tiltX = () => 0, tiltY = () => 0, twist = () => 0, wobble = () => 0 }) {
  const [sx, sy] = await win_(x0, y);
  const [ex] = await win_(x1, y);
  await pen('mouseMoved', sx, sy, { buttons: 0 });
  await sleep(30);
  await pen('mousePressed', sx, sy, { force: force(0), tiltX: tiltX(0), tiltY: tiltY(0), twist: twist(0) });
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    await pen('mouseMoved', Math.round(sx + (ex - sx) * t), Math.round(sy + wobble(i)), { buttons: 1, force: force(t), tiltX: tiltX(t), tiltY: tiltY(t), twist: twist(t) });
    await sleep(6);
  }
  await pen('mouseReleased', ex, Math.round(sy + wobble(n)), { force: 0 });
  await sleep(150);
}

const strokes = () => ev(`(() => { const { doc, ui } = __frameling.store().get(); const l = doc.layers.find((x) => x.id === ui.activeLayerId) || doc.layers[doc.layers.length - 1]; return l.cels.flatMap((c) => doc.drawings[c.drawingId].shapes || []).filter((s) => s.type === 'stroke').map((s) => ({ opacity: s.opacity, thinning: s.brush.thinning, p: s.points.map((q) => q.p), y: s.points.map((q) => q.y), color: s.color })); })()`);
const shapeCount = () => ev(`(() => { const { doc, ui } = __frameling.store().get(); const l = doc.layers.find((x) => x.id === ui.activeLayerId) || doc.layers[doc.layers.length - 1]; return l.cels.reduce((n, c) => n + (doc.drawings[c.drawingId].shapes || []).length, 0); })()`);

/** The screen's rows of ink (dark pixels) in the pixel column at window x, from a capture of the window. */
async function inkAt(img, x, yFrom, yTo) {
  const { width } = img.getSize();
  const bm = img.toBitmap();
  let n = 0;
  for (let y = yFrom; y < yTo; y++) {
    const i = (y * width + x) * 4;
    const lum = (bm[i] + bm[i + 1] + bm[i + 2]) / 3;
    if (lum < 110) n++;
  }
  return n;
}
/** The darkest pixel's brightness in a column, for telling a faint line from a solid one. */
async function darkest(img, x, yFrom, yTo) {
  const { width } = img.getSize();
  const bm = img.toBitmap();
  let min = 255;
  for (let y = yFrom; y < yTo; y++) {
    const i = (y * width + x) * 4;
    min = Math.min(min, (bm[i] + bm[i + 1] + bm[i + 2]) / 3);
  }
  return min;
}

const fresh = async () => {
  await ev(`(() => { const F = __frameling; F.pen.reset(); F.template('blank-vector'); F.store().setUi({ tool: 'brush', color: '#000000', zoom: 1, panX: 40, panY: 40, brush: { size: 30, thinning: 0.7, smoothing: 0.3, streamline: 0.3, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } }); return true; })()`);
  await sleep(300);
};

// ---------------------------------------------------------------- scenarios

async function pressure() {
  begin('pressure changes the line width, in the stored points and on screen');
  await fresh();
  await penStroke(60, 360, 140, 40, { force: (t) => 0.05 + 0.95 * t });
  const [s] = await strokes();
  if (!check(!!s, 'no stroke was drawn')) return;
  check(Math.min(...s.p) < 0.25 && Math.max(...s.p) > 0.85, `pressure range ${Math.min(...s.p).toFixed(2)} to ${Math.max(...s.p).toFixed(2)}`);
  note(`pressure ${Math.min(...s.p).toFixed(2)} to ${Math.max(...s.p).toFixed(2)} over ${s.p.length} points`);
  const img = await win.webContents.capturePage();
  const [lx, ly] = await win_(90, 140);
  const [hx] = await win_(340, 140);
  const light = await inkAt(img, lx, ly - 60, ly + 60);
  const hard = await inkAt(img, hx, ly - 60, ly + 60);
  note(`ink at the light end ${light}px, at the hard end ${hard}px`);
  check(hard > light * 2 && light >= 1, `the hard end (${hard}px) should be much wider than the light end (${light}px)`);
}

async function opacity() {
  begin('light pressure makes a fainter line when strength follows pressure');
  await fresh();
  await ev(`__frameling.pen.setTool('brush', { opacity: true })`);
  await penStroke(60, 360, 100, 20, { force: () => 0.12 });
  await penStroke(60, 360, 200, 20, { force: () => 1 });
  const ss = await strokes();
  check(ss.length === 2, `expected 2 strokes, got ${ss.length}`);
  if (ss.length < 2) return;
  note(`opacity ${ss[0].opacity.toFixed(2)} (light) and ${ss[1].opacity.toFixed(2)} (hard)`);
  check(ss[0].opacity < 0.4 && ss[1].opacity > 0.9, 'the light line is faint and the hard line solid');
  const img = await win.webContents.capturePage();
  const [x, y1] = await win_(210, 100);
  const [, y2] = await win_(210, 200);
  const a = await darkest(img, x, y1 - 20, y1 + 20);
  const b = await darkest(img, x, y2 - 20, y2 + 20);
  note(`darkest pixel ${Math.round(a)} (light) and ${Math.round(b)} (hard)`);
  check(a > b + 80, 'the light line is paler on screen');
}

async function tiltAndTwist() {
  begin('tilt and twist arrive, and leaning makes the line wider');
  await fresh();
  await ev(`window.__seen = []; const r = document.querySelector('.cv-root'); r.addEventListener('pointermove', (e) => { if (e.pointerType === 'pen' && e.buttons) window.__seen.push({ tx: e.tiltX, ty: e.tiltY, tw: e.twist, pr: e.pressure, co: typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents().length : -1, pe: typeof e.getPredictedEvents === 'function' }); }, true)`);
  await ev(`__frameling.pen.setTool('brush', { tilt: true }); __frameling.store().setUi({ brush: { ...__frameling.store().get().ui.brush, thinning: 0 } })`);
  await penStroke(60, 200, 100, 20, { force: () => 0.5, tiltX: () => 0, tiltY: () => 0 });
  await penStroke(60, 200, 200, 20, { force: () => 0.5, tiltX: () => 65, tiltY: () => -20, twist: (t) => Math.round(t * 180) });
  const seen = await ev('window.__seen');
  const last = seen[seen.length - 1];
  check(seen.some((s) => s.tx === 65 && s.ty === -20), 'the browser reported the tilt');
  check(Math.max(...seen.map((s) => s.tw)) >= 150, `the browser reported twist up to ${Math.max(...seen.map((s) => s.tw))}`);
  check(last && last.co >= 1 && last.pe, 'coalesced and predicted events are available on pen moves');
  const ss = await strokes();
  check(ss.length === 2, `expected 2 strokes, got ${ss.length}`);
  if (ss.length === 2) {
    note(`first point's width value: upright ${ss[0].p[0]}, leaning ${ss[1].p[0].toFixed(2)}`);
    check(ss[1].p[0] > ss[0].p[0] + 0.1, 'leaning raised the width value');
    check(ss[1].thinning > 0.3 && ss[0].thinning > 0.3, 'tilt wakes up the thinning');
  }
}

async function hoverRing() {
  begin('a hovering pen shows the brush ring');
  await fresh();
  const [x, y] = await win_(200, 150);
  await pen('mouseMoved', x - 20, y, { buttons: 0 });
  await pen('mouseMoved', x, y, { buttons: 0 });
  await sleep(300);
  const ink = await ev(`(() => { const c = document.querySelector('canvas.cv-overlay'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
  check(ink > 50, `the overlay has ${ink} pixels drawn (the ring)`);
  note(`${ink} ring pixels on the overlay`);
}

async function eraserEnd() {
  begin('the eraser end erases while it is down, then the brush comes back');
  await fresh();
  await penStroke(60, 360, 150, 20, { force: () => 0.6 });
  check((await shapeCount()) === 1, 'a line to erase');
  // Chromium's protocol can't press the eraser button, so this is a pen event made in the page with the eraser bits set.
  const mid = await win_(210, 150);
  const during = await ev(`(async () => {
    const r = document.querySelector('.cv-root');
    const fire = (type, x, y, buttons) => r.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5, button: type === 'pointerdown' ? 5 : -1, buttons }));
    fire('pointermove', ${mid[0]} - 30, ${mid[1]}, 0);
    fire('pointerdown', ${mid[0]} - 30, ${mid[1]}, 32);
    const tool = __frameling.store().get().ui.tool;
    for (let i = 0; i <= 12; i++) fire('pointermove', ${mid[0]} - 30 + i * 5, ${mid[1]}, 32);
    fire('pointerup', ${mid[0]} + 30, ${mid[1]}, 0);
    return tool;
  })()`);
  await sleep(200);
  check(during === 'eraser', `the tool while the eraser end was down was ${during}`);
  check((await ev('__frameling.store().get().ui.tool')) === 'brush', 'the brush came back');
  check((await shapeCount()) === 0, 'the line was erased');
  // And with the eraser end switched off in Pen and tablet, the same press draws with the brush.
  await ev(`__frameling.pen.setDevice({ eraserEnd: false })`);
  await ev(`(() => { const r = document.querySelector('.cv-root'); const fire = (type, x, y, buttons) => r.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 42, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, button: type === 'pointerdown' ? 5 : -1, buttons })); fire('pointerdown', ${mid[0]} - 30, ${mid[1]}, 32); for (let i = 1; i <= 12; i++) fire('pointermove', ${mid[0]} - 30 + i * 5, ${mid[1]}, 32); fire('pointerup', ${mid[0]} + 30, ${mid[1]}, 0); })()`);
  await sleep(200);
  check((await shapeCount()) === 1, 'with the eraser end off, the press drew with the brush');
}

async function barrelButtons() {
  begin('barrel button 1 picks a colour and barrel button 2 moves the page');
  await fresh();
  await ev(`__frameling.store().setUi({ color: '#e0203a' })`);
  await penStroke(60, 360, 150, 20, { force: () => 0.6 });
  await ev(`__frameling.store().setUi({ color: '#000000' })`);
  const [x, y] = await win_(210, 150);
  const fire = (type, dx, dy, buttons, button) => ev(`document.querySelector('.cv-root').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, pointerId: 43, pointerType: 'pen', isPrimary: true, clientX: ${x} + ${dx}, clientY: ${y} + ${dy}, pressure: 0.5, button: ${button}, buttons: ${buttons} }))`);
  // Tip and the button nearest it, held together.
  await fire('pointerdown', 0, 0, 3, 0);
  await fire('pointerup', 0, 0, 0, 0);
  await sleep(200);
  const col = await ev('__frameling.store().get().ui.color');
  check(col.toLowerCase() === '#e0203a', `the picked colour was ${col}`);
  check((await shapeCount()) === 1, 'picking did not draw');
  // The other button pans.
  const before = await ev('(() => { const u = __frameling.store().get().ui; return [u.panX, u.panY]; })()');
  await fire('pointerdown', 0, 0, 5, 0);
  for (let i = 1; i <= 8; i++) await fire('pointermove', i * 10, i * 5, 5, -1);
  await fire('pointerup', 80, 40, 0, 0);
  await sleep(150);
  const after = await ev('(() => { const u = __frameling.store().get().ui; return [u.panX, u.panY]; })()');
  note(`pan ${before} to ${after}`);
  check(Math.abs(after[0] - before[0] - 80) < 2 && Math.abs(after[1] - before[1] - 40) < 2, 'the page moved with the pen');
  check((await shapeCount()) === 1, 'panning did not draw');
}

async function stabilizer() {
  begin('the stabilizer smooths a shaky line');
  await fresh();
  const wobble = (i) => (i % 2 ? 14 : -14);
  await penStroke(60, 360, 100, 40, { force: () => 0.6, wobble });
  await ev(`__frameling.pen.setTool('brush', { stabilizer: 90, stabMode: 'string' })`);
  await penStroke(60, 360, 220, 40, { force: () => 0.6, wobble });
  await ev(`__frameling.pen.setTool('brush', { stabilizer: 90, stabMode: 'average' })`);
  await penStroke(60, 360, 340, 40, { force: () => 0.6, wobble });
  const ss = await strokes();
  check(ss.length === 3, `expected 3 strokes, got ${ss.length}`);
  if (ss.length < 3) return;
  // The last few points are the brush catching up with where the pen lifted, so they are left out.
  const spread = (s, base) => Math.max(...s.y.slice(2, -8).map((v) => Math.abs(v - base)));
  const a = spread(ss[0], 100), b = spread(ss[1], 220), c = spread(ss[2], 340);
  note(`widest wobble: off ${a.toFixed(1)}, pull string ${b.toFixed(1)}, average ${c.toFixed(1)} px`);
  check(b < a * 0.5, 'pull string cut the wobble to under half');
  check(c < a * 0.7, 'average cut the wobble');
}

async function touch() {
  begin('palm rejection, one finger, and two finger pan and zoom');
  await fresh();
  const [x, y] = await win_(200, 150);
  const touchEv = (type, id, dx, dy) => ev(`document.querySelector('.cv-root').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, pointerId: ${id}, pointerType: 'touch', isPrimary: ${id === 51}, clientX: ${x} + ${dx}, clientY: ${y} + ${dy}, pressure: 0.5, button: ${type === 'pointermove' ? -1 : 0}, buttons: ${type === 'pointerup' ? 0 : 1} }))`);
  // A pen is near: a hand on the screen does nothing.
  await pen('mouseMoved', x + 100, y + 60, { buttons: 0 });
  await sleep(50);
  await touchEv('pointerdown', 51, 0, 0);
  for (let i = 1; i <= 8; i++) await touchEv('pointermove', 51, i * 12, 0);
  await touchEv('pointerup', 51, 96, 0);
  await sleep(150);
  check((await shapeCount()) === 0, 'a palm drew while the pen was near');
  // The pen goes away: a finger draws.
  await ev(`document.querySelector('.cv-root').dispatchEvent(new PointerEvent('pointerleave', { pointerId: 7, pointerType: 'pen' }))`);
  await sleep(700);
  await touchEv('pointerdown', 52, 0, 0);
  for (let i = 1; i <= 8; i++) await touchEv('pointermove', 52, i * 12, 0);
  await touchEv('pointerup', 52, 96, 0);
  await sleep(150);
  check((await shapeCount()) === 1, 'a finger should draw when no pen is near');
  // Two fingers: the first one's stroke is taken back, and spreading zooms.
  const z0 = await ev('__frameling.store().get().ui.zoom');
  await touchEv('pointerdown', 53, -30, 0);
  await touchEv('pointermove', 53, -34, 0);
  await touchEv('pointerdown', 54, 30, 0);
  for (let i = 1; i <= 10; i++) {
    await touchEv('pointermove', 53, -30 - i * 8, 0);
    await touchEv('pointermove', 54, 30 + i * 8, 0);
  }
  await touchEv('pointerup', 53, -110, 0);
  await touchEv('pointerup', 54, 110, 0);
  await sleep(150);
  const z1 = await ev('__frameling.store().get().ui.zoom');
  note(`zoom ${z0.toFixed(2)} to ${z1.toFixed(2)}`);
  check(z1 > z0 * 2, 'spreading two fingers zoomed in');
  check((await shapeCount()) === 1, 'the two finger gesture did not draw');
}

(async () => {
  const guard = setTimeout(() => process.exit(2), 8 * 60 * 1000);
  try {
    await startApp();
    dbg().attach('1.3');
    for (const s of [pressure, opacity, tiltAndTwist, hoverRing, eraserEnd, barrelButtons, stabilizer, touch]) {
      try {
        await s();
      } catch (e) {
        (current ?? begin('harness')).failures.push(String(e?.stack ?? e));
      }
    }
  } catch (e) {
    begin('harness').failures.push(String(e?.stack ?? e));
  }
  clearTimeout(guard);
  const bad = results.filter((r) => r.failures.length);
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const n of r.notes) console.log(`       . ${n}`);
    for (const f of r.failures) console.log(`       - ${f}`);
  }
  if (pageErrors.length) console.log(`console errors: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
  console.log(`${results.length - bad.length} of ${results.length} passed. Output: ${outDir}`);
  process.exit(bad.length ? 1 : 0);
})();
