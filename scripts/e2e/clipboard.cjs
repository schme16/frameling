// End-to-end check of copy and paste with the rest of the computer, in the real app (real main process, real clipboard):
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/clipboard.cjs [outDir] [--stills <dir>]
//
// A picture is put on the system clipboard the way another app would, then Ctrl+V is pressed in the window, and the
// drawing is read back. The other way round, Ctrl+C is pressed and the system clipboard is read. Covers a picture onto a
// vector layer and onto a pixel layer, one bigger than the page (shrunk, then Change to cut the edges), a locked palette,
// what Copy puts out (size, see-through, SVG text), Paste after Copy (Frameling's own copy, not the picture), and shapes
// to pixels and pixels to a picture, with what each says. With --stills it saves a cropped picture of each, in both themes.
//
// Exits non-zero when anything fails. Uses a throwaway profile inside outDir.
const { app, BrowserWindow, clipboard, ClipboardItem, nativeImage } = require('electron');
// Software drawing with no GPU process (what a harness with no flags got under xvfb, so its pictures stay as they were), with
// the colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('clipboard.cjs'));
const stillsAt = (() => {
  const i = argv.indexOf('--stills');
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return path.resolve(v);
})();
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-clip-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
if (stillsAt) fs.mkdirSync(stillsAt, { recursive: true });

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
  await gpu.confirmOrExit(win);
  win.setSize(1400, 900);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__frameling)')) return;
    } catch {
      // still loading
    }
    await sleep(100);
  }
  throw new Error('The page never became ready');
}

// ---------------------------------------------------------------- the system clipboard, from this side

/** A picture like a screenshot of a small window, drawn in the page (so it has real colours, text and an edge), as PNG bytes. */
const makeScreenshot = (w, h) =>
  ev(`(async () => {
    const c = new OffscreenCanvas(${w}, ${h}), g = c.getContext('2d');
    const k = ${w} / 320;
    const grad = g.createLinearGradient(0, 0, ${w}, ${h}); grad.addColorStop(0, '#2d6cdf'); grad.addColorStop(1, '#e85d9c');
    g.fillStyle = grad; g.fillRect(0, 0, ${w}, ${h});
    g.fillStyle = '#f4f1ea'; g.fillRect(16 * k, 40 * k, 288 * k, ${h} - 56 * k);
    g.fillStyle = '#2a2530'; g.fillRect(0, 0, ${w}, 28 * k);
    g.fillStyle = '#ff6f91'; g.beginPath(); g.arc(14 * k, 14 * k, 5 * k, 0, 7); g.fill();
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(30 * k, 14 * k, 5 * k, 0, 7); g.fill();
    g.fillStyle = '#4fd1a5'; g.beginPath(); g.arc(46 * k, 14 * k, 5 * k, 0, 7); g.fill();
    g.fillStyle = '#2a2530'; g.font = (18 * k) + 'px sans-serif'; g.fillText('A screenshot', 28 * k, 80 * k);
    g.fillStyle = '#6a52d4'; g.fillRect(28 * k, 100 * k, 120 * k, 12 * k);
    g.fillStyle = '#e07790'; g.fillRect(28 * k, 124 * k, 200 * k, 12 * k);
    const b = await c.convertToBlob({ type: 'image/png' });
    const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);

/** What another app does when you copy a picture: puts a PNG on the system clipboard. */
async function copyElsewhere(b64) {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }) })]);
}

/** What is on the system clipboard now: size, whether the corner is see-through, whether the middle is not. */
async function systemPicture() {
  if (!(await clipboard.has('image/png'))) return null;
  const items = await clipboard.read();
  const blob = await items[0].getType('image/png');
  const img = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
  const { width, height } = img.getSize();
  const bmp = img.toBitmap();
  const alphaAt = (x, y) => bmp[(y * width + x) * 4 + 3];
  return { width, height, cornerAlpha: alphaAt(0, 0), middleAlpha: alphaAt(width >> 1, height >> 1) };
}

// ---------------------------------------------------------------- the page

const key = async (k, mods = ['control']) => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: mods });
  win.webContents.sendInputEvent({ type: 'char', keyCode: k, modifiers: mods });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: mods });
  await sleep(700);
};

// An 800 x 500 page with a pixel layer (8 per art pixel, 100 x 63 art pixels, a small red block) over a vector layer (an
// ellipse and a box). The vector layer is active.
const SETUP = `(async () => {
  const E = window.__framelingExport, S = window.__frameling.store();
  await E.load('blank-vector');
  const KAPPA = 0.5522847498307936;
  const ell = (id, x, y, w, h, fill) => { const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry; return { id, type: 'path', paths: [{ closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } }, { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } }, { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } } ] }], fill, stroke: { color: '#1d1b26', width: 6, join: 'round', cap: 'round' }, opacity: 1 }; };
  const box = (id, x, y, w, h, fill) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: { color: '#1d1b26', width: 6, join: 'round', cap: 'round' }, opacity: 1 });
  S.update('setup', (d) => {
    d.name = 'Clipboard'; d.width = 800; d.height = 500; d.background = '#fff9ee'; d.length = 6; d.fps = 12; d.clips = []; d.markers = [];
    const px = new Uint8ClampedArray(100 * 63 * 4);
    for (let y = 40; y < 46; y++) for (let x = 60; x < 70; x++) px.set([200, 40, 60, 255], (y * 100 + x) * 4);
    d.drawings = { dV: { id: 'dV', kind: 'vector', shapes: [ell('e1', 90, 70, 280, 190, '#ff6f91'), box('b1', 250, 190, 230, 130, '#6a52d4')] }, dP: { id: 'dP', kind: 'pixel', width: 100, height: 63, pixels: px } };
    d.layers = [
      { id: 'LV', name: 'Shapes', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'cV', start: 0, length: 6, drawingId: 'dV' }] },
      { id: 'LP', name: 'Pixels', kind: 'pixel', pixelSize: 8, visible: true, locked: false, opacity: 1, cels: [{ id: 'cP', start: 0, length: 6, drawingId: 'dP' }] },
    ];
  });
  S.setUi({ activeLayerId: 'LV', frame: 0, selection: [], tool: 'select', zoom: 0.8, panX: 40, panY: 30 });
  window.__clip = {
    vec: () => { const { doc } = S.get(); const l = doc.layers.find((x) => x.id === 'LV'); return doc.drawings[l.cels[0].drawingId]; },
    pix: () => { const { doc } = S.get(); const l = doc.layers.find((x) => x.id === 'LP'); return doc.drawings[l.cels[0].drawingId]; },
    instances: () => window.__clip.vec().shapes.filter((s) => s.type === 'instance'),
    symbolOf: (inst) => S.get().doc.symbols[inst.symbolId],
    text: () => [...document.querySelectorAll('.ui-toast-text')].map((e) => e.textContent).join(' | '),
    painted: () => { const d = window.__clip.pix(); let n = 0; for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i]) n++; return n; },
  };
  return true;
})()`;

const reset = async () => {
  await ev(SETUP);
  await ev(`window.__frameling.toast && 0; document.querySelectorAll('.ui-toast-x').forEach((b) => b.click()); true`);
  await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('frameling.prefs.v1') || '{}'), firstDrawn: true })); true`);
  await sleep(300);
};
const toastText = () => ev('window.__clip.text()');

async function still(name, crop) {
  if (!stillsAt) return;
  for (const theme of ['dark', 'light']) {
    await ev(`window.__frameling.prefs.set({ theme: ${JSON.stringify(theme)}, look: 'cosy', darkTheme: 'midnight-sketchbook', lightTheme: 'paper-and-honey' }); true`);
    await sleep(500);
    const img = await win.webContents.capturePage({ x: crop[0], y: crop[1], width: crop[2], height: crop[3] });
    fs.writeFileSync(path.join(stillsAt, `clipboard-${name}-${theme}.png`), img.toPNG());
  }
  await ev(`window.__frameling.prefs.set({ theme: 'dark' }); true`);
  await sleep(300);
}

// ---------------------------------------------------------------- sections

async function pictureIn() {
  await reset();
  begin('a screenshot on the clipboard pastes onto a vector layer as a picture of pixels, in the middle, at its own size');
  await copyElsewhere(await makeScreenshot(320, 200));
  await key('v');
  const inst = await ev(`window.__clip.instances().map((i) => ({ x: i.transform.x, y: i.transform.y }))`);
  check(inst.length === 1, `${inst.length} pictures on the vector layer`);
  const sym = await ev(`(() => { const i = window.__clip.instances()[0]; if (!i) return null; const s = window.__clip.symbolOf(i); const d = window.__frameling.store().get().doc.drawings[s.layers[0].cels[0].drawingId]; return { kind: s.layers[0].kind, w: d.width, h: d.height, x: d.x, y: d.y, ps: s.layers[0].pixelSize }; })()`);
  check(sym && sym.kind === 'pixel' && sym.w === 320 && sym.h === 200 && sym.ps === 1, `picture ${JSON.stringify(sym)}`);
  check(sym && sym.x === 240 && sym.y === 150, `centred at (${sym?.x}, ${sym?.y}), wanted (240, 150)`);
  const t = await toastText();
  check(/Pasted a 320 x 200 picture at its own size/.test(t), `message: ${t}`);
  check(await ev(`window.__frameling.store().get().ui.selection.length === 1 && window.__frameling.store().get().ui.tool === 'select'`), 'the picture is not selected with the Select tool');
  note(`message: ${t}`);
  await still('picture-on-vector', [112, 46, 888, 830]);
  // Undo takes the whole thing away in one step.
  await ev(`window.__frameling.run('edit.undo')`);
  check(await ev(`window.__clip.instances().length === 0 && !window.__frameling.store().get().doc.symbols`), 'undo left the picture or its symbol behind');
}

async function pictureOntoPixels() {
  await reset();
  begin('a screenshot pastes onto a pixel layer as lifted pixels, one picture pixel to one art pixel, in the middle');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LP' })`);
  await copyElsewhere(await makeScreenshot(40, 25));
  await key('v');
  const t = await toastText();
  check(/Pasted a 40 x 25 picture at its own size/.test(t), `message: ${t}`);
  check(await ev(`window.__frameling.store().get().ui.tool === 'pixel-select'`), 'the pixel Select tool was not picked, so the picture can not be dragged');
  await ev(`window.__frameling.run('select.none')`);
  await sleep(300);
  const n = await ev(`window.__clip.painted()`);
  check(n >= 40 * 25, `${n} pixels on the layer after it landed (wanted at least 1000)`);
  const at = await ev(`(() => { const d = window.__clip.pix(); const w = 100; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < d.width * d.height; i++) if (d.pixels[i * 4 + 3]) { const x = (d.x || 0) + (i % d.width), y = (d.y || 0) + ((i / d.width) | 0); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; })()`);
  check(at.x0 <= 30 && at.x1 >= 69, `spans ${JSON.stringify(at)}`);
  note(`message: ${t}`);
}

async function pictureOntoPixelsLifted() {
  await reset();
  begin('the picture is still lifted (drag it into place) and shows on screen');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LP' })`);
  await copyElsewhere(await makeScreenshot(40, 25));
  await key('v');
  await ev(`for (let i = 0; i < 2; i++) window.__frameling.run('select.nudgeLeftMore'); true`);
  await sleep(500);
  await still('picture-on-pixels', [112, 46, 888, 830]);
}

async function bigPicture() {
  await reset();
  begin('a picture bigger than the page is shrunk to fit, says so, and Change keeps its size and cuts the edges');
  await ev(`localStorage.removeItem('frameling.choices.v1'); true`);
  await copyElsewhere(await makeScreenshot(1600, 1000));
  await key('v');
  const t = await toastText();
  check(/shrunk to 800 x 500/.test(t), `message: ${t}`);
  const first = await ev(`(() => { const i = window.__clip.instances()[0]; const s = i && window.__clip.symbolOf(i); const d = s && window.__frameling.store().get().doc.drawings[s.layers[0].cels[0].drawingId]; return d && { w: d.width, h: d.height }; })()`);
  check(first && first.w === 800 && first.h === 500, `shrunk picture ${JSON.stringify(first)}`);
  const CHANGE = '[data-testid="toast.change-clipboard.bigPicture"]';
  const hasChange = await ev(`!!document.querySelector('${CHANGE}')`);
  check(hasChange, 'the message has no Change button');
  note(`message: ${t}`);
  await still('big-picture-shrunk', [112, 46, 888, 830]);
  await ev(`document.querySelector('${CHANGE}')?.click(); true`);
  await sleep(900);
  check(await ev(`!!document.querySelector('[data-testid="choice.clipboard.bigPicture.crop"]')`), 'Change did not put the question');
  await ev(`document.querySelector('[data-testid="choice.clipboard.bigPicture.crop"]')?.click(); true`);
  await sleep(300);
  await ev(`document.querySelector('[data-testid="choice.clipboard.bigPicture.ok"]')?.click(); true`);
  await sleep(1000);
  const t2 = await toastText();
  check(/at full size, so its edges are cut off/.test(t2), `after Change: ${t2}`);
  check((await ev(`window.__clip.instances().length`)) === 1, 'Change left two pictures, not one');
  note(`after Change: ${t2}`);
  // The first message has done its job; the one about the new answer is the one to see.
  await ev(`document.querySelector('.ui-toast-x')?.click(); true`);
  await sleep(500);
  await still('big-picture-cropped', [112, 46, 888, 830]);
}

async function lockedPalette() {
  await reset();
  begin('a picture on a locked palette is matched to the palette and says so');
  await ev(`(() => { const S = window.__frameling.store(); S.update('lock', (d) => { d.layers.find((l) => l.id === 'LP').paletteLock = true; d.palette = { id: 'test', name: 'Four', colors: ['#1d1b26', '#ff6f91', '#6a52d4', '#fff9ee'] }; }); S.setUi({ activeLayerId: 'LP' }); return true; })()`);
  await copyElsewhere(await makeScreenshot(40, 25));
  await key('v');
  await ev(`window.__frameling.run('select.none')`);
  await sleep(300);
  const t = await toastText();
  check(/palette is locked/.test(t), `message: ${t}`);
  const off = await ev(`(() => { const ok = new Set(['#1d1b26', '#ff6f91', '#6a52d4', '#fff9ee']); const d = window.__clip.pix(); const bad = new Set(); for (let i = 0; i < d.pixels.length; i += 4) { if (!d.pixels[i + 3]) continue; const h = '#' + [0, 1, 2].map((k) => d.pixels[i + k].toString(16).padStart(2, '0')).join(''); if (!ok.has(h) && !(d.pixels[i] === 200 && d.pixels[i + 1] === 40 && d.pixels[i + 2] === 60)) bad.add(h); } return [...bad].slice(0, 5); })()`);
  check(off.length === 0, `colours outside the palette: ${JSON.stringify(off)}`);
  note(`message: ${t}`);
  await still('locked-palette', [112, 46, 888, 830]);
}

async function copyOut() {
  await reset();
  begin('Copy puts a picture on the system clipboard, see-through where nothing is drawn, twice the page size');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LV', selection: ['e1', 'b1'] })`);
  await key('c');
  const p = await systemPicture();
  // The two shapes cover x 87 to 480 and y 67 to 323 (their outlines reach 3 past the edge).
  check(!!p, 'nothing on the system clipboard after Copy');
  if (p) {
    check(Math.abs(p.width - 2 * 396) <= 8 && Math.abs(p.height - 2 * 259) <= 8, `size ${p.width} x ${p.height}, wanted about 792 x 518`);
    check(p.cornerAlpha === 0, `the corner is not see-through (alpha ${p.cornerAlpha})`);
    check(p.middleAlpha === 255, `the middle is not solid (alpha ${p.middleAlpha})`);
    note(`on the clipboard: ${p.width} x ${p.height}, corner alpha ${p.cornerAlpha}, middle alpha ${p.middleAlpha}`);
  }
  begin('Paste after Copy pastes Frameling\'s own shapes, not the picture of them');
  const before = await ev(`window.__clip.vec().shapes.length`);
  await key('v');
  check((await ev(`window.__clip.vec().shapes.length`)) === before + 2, 'the two shapes were not pasted as shapes');
  check((await ev(`window.__clip.instances().length`)) === 0, 'a picture was pasted instead of the shapes');
  begin('a picture copied in another app after that wins');
  await copyElsewhere(await makeScreenshot(160, 100));
  await key('v');
  check((await ev(`window.__clip.instances().length`)) === 1, 'the picture from the other app was not pasted');
}

async function svgOut() {
  await reset();
  begin('Copy as SVG puts SVG text on the clipboard');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LV', selection: ['e1', 'b1'] })`);
  await ev(`window.__frameling.run('edit.copySvg')`);
  await sleep(500);
  const text = await clipboard.readText();
  check(text.startsWith('<svg') && text.includes('<path') && text.includes('viewBox'), `text starts ${JSON.stringify(text.slice(0, 80))}`);
  const t = await toastText();
  check(/Copied as SVG text/.test(t), `message: ${t}`);
  note(`message: ${t}`);
}

async function shapesToPixels() {
  await reset();
  begin('shapes pasted on a pixel layer become pixels and say what was converted');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LV', selection: ['e1', 'b1'] })`);
  await key('c');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LP' })`);
  await key('v');
  const t = await toastText();
  check(/Pasted 2 shapes as pixels: lines are no longer smooth curves/.test(t), `message: ${t}`);
  check(/8 x 8 of the page/.test(t), `message: ${t}`);
  check(await ev(`window.__frameling.store().get().ui.tool === 'pixel-select'`), 'not lifted with the pixel Select tool');
  note(`message: ${t}`);
  await ev(`for (let i = 0; i < 4; i++) window.__frameling.run('select.nudgeRightMore'); true`);
  await sleep(600);
  await still('shapes-to-pixels', [112, 46, 888, 830]);
  await ev(`window.__frameling.run('select.none')`);
  await sleep(300);
  const n = await ev(`window.__clip.painted()`);
  check(n > 500, `${n} pixels after the shapes landed`);
}

async function pixelsToPicture() {
  await reset();
  begin('pixels pasted on a vector layer become a picture and say so');
  await ev(`(() => { window.__frameling.store().setUi({ activeLayerId: 'LP' }); return true; })()`);
  await ev(`window.__frameling.run('select.all'); true`);
  await key('c');
  await ev(`window.__frameling.store().setUi({ activeLayerId: 'LV', selection: [] })`);
  await key('v');
  const t = await toastText();
  check(/Pasted the pixels as a picture \(10 x 6 pixels\)/.test(t), `message: ${t}`);
  const inst = await ev(`window.__clip.instances().length`);
  check(inst === 1, `${inst} pictures`);
  note(`message: ${t}`);
  // Moved aside, so the pixels it was copied from still show beside the picture.
  await ev(`for (let i = 0; i < 12; i++) window.__frameling.run('select.nudgeRightMore'); true`);
  await sleep(500);
  await still('pixels-to-picture', [112, 46, 888, 830]);
}

async function wrongLayer() {
  await reset();
  begin('a locked layer is refused in plain words and nothing changes');
  await ev(`window.__frameling.store().update('lock', (d) => void (d.layers.find((l) => l.id === 'LV').locked = true)); true`);
  await copyElsewhere(await makeScreenshot(80, 50));
  await key('v');
  const t = await toastText();
  check(/locked/.test(t), `message: ${t}`);
  check((await ev(`window.__clip.instances().length`)) === 0, 'a picture landed on a locked layer');
}

(async () => {
  try {
    await startApp();
    await ev(`localStorage.setItem('frameling.choices.v1', JSON.stringify({ 'workspace.follow': 'never', 'clipboard.bigPicture': 'shrink' })); true`);
    // Quill's own remarks would sit over the messages the stills are about.
    await ev(`window.__frameling.quill.setShown(false); true`);
    await pictureIn();
    await pictureOntoPixels();
    await pictureOntoPixelsLifted();
    await lockedPalette();
    await copyOut();
    await svgOut();
    await shapesToPixels();
    await pixelsToPicture();
    await wrongLayer();
    await ev(`localStorage.removeItem('frameling.choices.v1'); true`);
    await bigPicture();
  } catch (e) {
    begin('the run');
    check(false, String(e && e.stack ? e.stack : e));
  }
  let bad = 0;
  for (const r of results) {
    console.log(`${r.failures.length ? 'FAIL' : 'ok  '} ${r.name}`);
    for (const n of r.notes) console.log(`       ${n}`);
    for (const f of r.failures) {
      console.log(`       ! ${f}`);
      bad++;
    }
  }
  if (pageErrors.length) {
    console.log(`page errors:\n  ${[...new Set(pageErrors)].slice(0, 6).join('\n  ')}`);
    bad++;
  }
  console.log(bad ? `\n${bad} problem(s)` : '\nall good');
  app.exit(bad ? 1 : 0);
})();
