// Colour proof: a picture drawn in known colours comes back as those colours through every way out of the app, with the
// values checked rather than eyeballed, and the same picture gives the same pixels on the real card and in software.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/colour.cjs [--out run.json] [--ref other.json]
//   GPU_MODE=card xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/colour.cjs --out card.json --ref software.json
//
// Eight flat colours (pure red, a blue, a grey, ...) are drawn into a document and read back from:
//   renderer     the single renderer that every export uses (renderFrameToCanvas)
//   canvas       the editor's own canvas, as the person sees it, read with getImageData
//   png          a real PNG export through the export dialog's code path, decoded again; its chunks are listed (an sRGB
//                picture should carry no wide-gamut profile)
//   screenshot   webContents.capturePage(), which is what scripts/shoot.cjs and every help picture is made of
//   screen       the X server's framebuffer (xwd), which is what actually reaches the monitor
// All five must equal the colour that was drawn, exactly (flat fills, sampled well inside the swatch: any difference is
// a colour conversion, not antialiasing).
//
// --simulate-p3 leaves the sRGB pin off and tells the engine the screen is Display P3 (a wide-gamut monitor), to show
// what the pin prevents: renderer, canvas and png stay the same, the screenshot picks up a rounding error or two, and the
// screen changes by a lot. That run is expected to differ on `screen`, and fails if it does not.
//
// A second, busier picture (curves, strokes, soft shapes, blend modes including the WebGL ones, blur and shadow) is
// rendered too, and its pixels are written to --out. With --ref (another run's --out) the two are compared: card against
// software must agree to within 1 level away from edges, and within the edge limits below on them (see FLAT_MAX).
//
// Exits non-zero when anything fails.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const gpu = require('../lib/gpu.cjs');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { installIpcStubs } = require('../ipc-stubs.cjs');

const args = process.argv.slice(2).filter((a) => !a.endsWith('colour.cjs'));
const opt = (k) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : null;
};
const SIMULATE_P3 = args.includes('--simulate-p3');
const outFile = opt('out');
const refFile = opt('ref');
// The agreed difference between the card and software on the busy pictures, in levels of 255. Away from an edge (flat
// colour, blend modes, blur and shadow all included) the two must agree to within 1. On an edge the two rasterisers
// anti-alias differently (the card's multisampling against SwiftShader's), so a thin dark stroke can differ a lot on its
// edge pixels: no edge pixel may differ by more than EDGE_MAX, and at most EDGE_SHARE of them by more than EDGE_BIG.
const FLAT_MAX = Number(process.env.COLOUR_FLAT_MAX || 1);
const EDGE_MAX = Number(process.env.COLOUR_EDGE_MAX || 64);
const EDGE_BIG = Number(process.env.COLOUR_EDGE_BIG || 8);
const EDGE_SHARE = Number(process.env.COLOUR_EDGE_SHARE || 0.08);

// COLOUR_CPU=1: no GPU process at all (what the capture scripts use), to prove that path gives the same colours too.
gpu.use('software', { noGpu: process.env.COLOUR_CPU === '1' });
if (SIMULATE_P3) app.commandLine.appendSwitch('force-color-profile', 'display-p3-d65');

const W = 80;
const H = 16;
let n = 0;
const rect = (id, x, y, w, h, fill, opacity = 1) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity });
function layer(name, shapes, extra = {}, length = 4) {
  const id = `l${n++}`;
  return { layer: { id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: `c${id}`, start: 0, length, drawingId: `d${id}` }], ...extra }, drawing: { id: `d${id}`, kind: 'vector', shapes } };
}
function doc(w, h, parts, background = '#ffffff') {
  const drawings = {};
  for (const p of parts) drawings[p.drawing.id] = p.drawing;
  return { format: 'frameling', version: 1, lineage: true, id: 'd', name: 'colour', width: w, height: h, fps: 12, length: 4, background, layers: parts.map((p) => p.layer), drawings, clips: [], markers: [], swatches: [] };
}

// The known colours: the ones that show a conversion most (a saturated primary moves furthest on a wide-gamut screen).
const COLOURS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [18, 120, 200],
  [58, 95, 140],
  [128, 128, 128],
  [250, 200, 20],
  [200, 50, 100],
];
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const known = () => doc(W, H, [layer('swatches', COLOURS.map((c, i) => rect('s' + i, i * 10, 0, 10, H, hex(c))))]);
const POINTS = COLOURS.map((c, i) => [i * 10 + 5, 8]);

// A deterministic busy picture (the same on every run: a seeded generator).
function busy() {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const col = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
  const soft = (count) => Array.from({ length: count }, (_, i) => rect('b' + n++ + '_' + i, rnd() * 90, rnd() * 60, 14 + rnd() * 60, 10 + rnd() * 50, col(), 0.3 + rnd() * 0.7));
  const curve = () => ({
    id: 'c' + n++,
    type: 'path',
    paths: [{ closed: true, points: [{ x: 20, y: 10 }, { x: 100, y: 30, c1: { x: 70, y: 0 }, c2: { x: 100, y: 10 } }, { x: 40, y: 70, c1: { x: 100, y: 60 }, c2: { x: 70, y: 80 } }] }],
    fill: '#5ab8ff99',
    stroke: { color: '#1d1b26', width: 5, join: 'round', cap: 'round' },
    opacity: 0.9,
  });
  const parts = [layer('base', soft(10)), layer('mul', soft(5), { blend: 'multiply', opacity: 0.8 }), layer('scr', soft(5), { blend: 'screen' }), layer('curve', [curve()]), layer('dodge', soft(4), { blend: 'linear-dodge', opacity: 0.6 }), layer('sub', soft(4), { blend: 'subtract' }), layer('div', soft(4), { blend: 'divide', opacity: 0.7 })];
  parts.push(layer('blur', [rect('bl', 20, 20, 30, 25, '#c83030')], { effects: [{ id: 'b', kind: 'blur', values: { radius: 3 } }] }));
  parts.push(layer('shadow', [rect('sh', 70, 40, 30, 25, '#2060c0')], { effects: [{ id: 's', kind: 'shadow', values: { color: '#000000', opacity: 0.8, x: 5, y: 5, softness: 4 } }] }));
  return parts;
}
const busyDoc = (parts) => doc(120, 90, parts, '#f4efe6');

/** The chunk names of a PNG, in order, and the sRGB / profile ones among them. */
function pngChunks(buf) {
  const names = [];
  let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    names.push(buf.toString('latin1', o + 4, o + 8));
    o += 12 + len;
  }
  return names;
}

/** The X server's framebuffer as { w, h, rgb } (what reaches the monitor), or null when there is no X screen to read. */
function screenGrab() {
  if (!process.env.DISPLAY) return null;
  try {
    const xwd = cp.execFileSync('xwd', ['-root', '-silent'], { maxBuffer: 1 << 28 });
    const ppm = cp.execFileSync('convert', ['xwd:-', '-depth', '8', 'ppm:-'], { input: xwd, maxBuffer: 1 << 28 });
    const m = /^P6\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s+255\s/.exec(ppm.toString('latin1', 0, 120));
    return { w: +m[1], h: +m[2], rgb: ppm.subarray(m[0].length) };
  } catch (e) {
    console.log('note: could not read the screen (' + String(e.message).split('\n')[0] + ')');
    return null;
  }
}

/** Pixels next to an edge (a neighbour more than 2 levels away, grown by one pixel): where rasterisers may differ in anti-aliasing. */
function edgeMask(buf, w, h) {
  const e = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let dy = -1; dy <= 1 && !e[y * w + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (Math.max(Math.abs(buf[i] - buf[j]), Math.abs(buf[i + 1] - buf[j + 1]), Math.abs(buf[i + 2] - buf[j + 2])) > 2) {
            e[y * w + x] = 1;
            break;
          }
        }
      }
    }
  }
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (e[y * w + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < w && yy < h) grown[yy * w + xx] = 1;
  }
  return grown;
}

let failed = 0;
const fail = (msg) => {
  failed++;
  console.log('FAIL ' + msg);
};
const bail = (e) => {
  console.log('FAILED', e);
  app.exit(1);
};
process.on('unhandledRejection', bail);
process.on('uncaughtException', bail);

app.whenReady().then(async () => {
  let info = null;
  if (SIMULATE_P3) console.log('[gpu] --simulate-p3: the screen is told to be Display P3 and sRGB is NOT pinned (a deliberate fault, to show what the pin prevents)');
  else info = await gpu.confirmOrExit();
  const written = new Map();
  installIpcStubs(ipcMain, {
    'files:pickExportFile': () => '/colour-proof/known.png',
    'files:write': (_e, p, bytes) => {
      written.set(p, Buffer.from(bytes));
      return { ok: true };
    },
  });
  const win = new BrowserWindow({
    show: true,
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(__dirname, '../../dist/preload/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  const ev = (js) => win.webContents.executeJavaScript(js);
  await win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { query: { debug: '1' } });
  await ev('new Promise((res) => { const t = () => (window.__framelingEffects && window.__framelingExport && window.__frameling ? res(true) : setTimeout(t, 50)); t(); })');
  // Out of the way: no welcome sheet, no tips.
  await ev(`localStorage.setItem('frameling.prefs.v1', JSON.stringify({ showWelcome: false, showTips: false, onboarded: true })); true`);

  const d = known();
  const expect = COLOURS.map((c) => [...c, 255]);
  const rows = []; // [where, [per colour pixel]]

  // renderer: the one renderer, at 1:1
  const flat = await ev(`window.__framelingEffects.pixels(${JSON.stringify(d)}, 0)`);
  rows.push(['renderer', POINTS.map(([x, y]) => flat.slice((y * W + x) * 4, (y * W + x) * 4 + 4))]);

  // canvas: the editor's canvas, where each swatch's middle sits in window coordinates too (for the screenshot and screen)
  await ev(`window.__frameling.store().load(${JSON.stringify(d)}, null); window.__frameling.store().setUi({ frame: 0 }); true`);
  await ev('new Promise((r) => { let k = 0; const t = () => (++k > 8 ? setTimeout(r, 400) : requestAnimationFrame(t)); t(); })');
  const probe = await ev(`(() => {
    const canvas = document.querySelector('canvas.cv-layer:not(.cv-overlay):not(.ab-underlay)');
    const stage = document.querySelector('.cv-stage').getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const k = canvas.width / box.width;
    const g = canvas.getContext('2d');
    return ${JSON.stringify(POINTS)}.map(([x, y]) => {
      const left = stage.left + ((x + 0.5) * stage.width) / ${W};
      const top = stage.top + ((y + 0.5) * stage.height) / ${H};
      return { client: [Math.round(left), Math.round(top)], px: Array.from(g.getImageData(Math.floor((left - box.left) * k), Math.floor((top - box.top) * k), 1, 1).data) };
    });
  })()`);
  rows.push(['canvas', probe.map((p) => p.px)]);

  // png: the export dialog's own code path, then decoded again
  const settings = { ...(await ev('window.__framelingExport.defaults()')), format: 'png', range: 'frame', scale: 1, transparent: false };
  const res = await ev(`window.__framelingExport.run(${JSON.stringify(settings)})`);
  const png = [...written.values()][0];
  if (!png || res.error) fail('PNG export did not write a file: ' + (res.error || JSON.stringify(res.outcome)));
  else {
    const bm = nativeImage.createFromBuffer(png).toBitmap();
    const size = nativeImage.createFromBuffer(png).getSize();
    const bgra = (x, y) => {
      const i = (y * size.width + x) * 4;
      return [bm[i + 2], bm[i + 1], bm[i], bm[i + 3]];
    };
    rows.push(['png', POINTS.map(([x, y]) => bgra(x, y))]);
    const chunks = pngChunks(png);
    console.log(`png: ${size.width}x${size.height}, chunks ${chunks.join(' ')}`);
    const tagged = chunks.filter((c) => ['iCCP', 'cHRM', 'gAMA', 'sRGB', 'cICP'].includes(c));
    if (tagged.some((c) => c === 'iCCP' || c === 'cICP')) fail(`the PNG carries a colour profile (${tagged.join(', ')}); an sRGB picture should not be tagged as anything wider`);
  }

  // screenshot, at the same spots
  const shot = await win.webContents.capturePage();
  const sbm = shot.toBitmap();
  const ss = shot.getSize();
  const scale = ss.width / win.getContentBounds().width;
  rows.push([
    'screenshot',
    probe.map((p) => {
      const x = Math.round(p.client[0] * scale);
      const y = Math.round(p.client[1] * scale);
      const i = (y * ss.width + x) * 4;
      return [sbm[i + 2], sbm[i + 1], sbm[i], sbm[i + 3]];
    }),
  ]);

  // screen: the framebuffer
  const grab = screenGrab();
  let screenRow = null;
  if (grab) {
    const cb = win.getContentBounds();
    screenRow = probe.map((p) => {
      const x = cb.x + p.client[0];
      const y = cb.y + p.client[1];
      const i = (y * grab.w + x) * 3;
      return [grab.rgb[i], grab.rgb[i + 1], grab.rgb[i + 2], 255];
    });
    rows.push(['screen', screenRow]);
  } else console.log('note: no X screen to read, so the framebuffer row is skipped');

  // the table
  console.log('\ndrawn      ' + expect.map((e) => e.slice(0, 3).join(',').padEnd(12)).join(''));
  const worst = {};
  for (const [where, vals] of rows) {
    console.log(where.padEnd(11) + vals.map((v) => v.slice(0, 3).join(',').padEnd(12)).join(''));
    worst[where] = Math.max(...vals.flatMap((v, i) => v.map((c, j) => Math.abs(c - expect[i][j]))));
  }
  console.log('\nlargest difference from what was drawn, in levels of 255: ' + rows.map(([w]) => `${w} ${worst[w]}`).join(', '));

  if (SIMULATE_P3) {
    for (const w of ['renderer', 'canvas', 'png']) if (worst[w] !== 0) fail(`${w} moved under a P3 screen (${worst[w]}), it should not`);
    // A screenshot is read back through the screen's colour space, so it can pick up a rounding error or two.
    if (worst.screenshot > 3) fail(`the screenshot moved by ${worst.screenshot} under a P3 screen, more than rounding`);
    else console.log(`note screenshot moved by ${worst.screenshot} level(s) under a P3 screen (rounding in the read back)`);
    if (!screenRow) fail('--simulate-p3 needs an X screen to read');
    else if (worst.screen === 0) fail('the screen row did not change under a simulated P3 screen: the pin is not what was being tested');
    else console.log(`ok   the screen moved by up to ${worst.screen} levels with sRGB unpinned; the renderer, canvas and PNG did not move`);
  } else {
    for (const [w] of rows) if (worst[w] !== 0) fail(`${w} is not the colour that was drawn (off by up to ${worst[w]})`);
    if (!failed) console.log(`ok   every way out gives back exactly what was drawn (${rows.map(([w]) => w).join(', ')})`);
  }

  // A second screen at a different scale: the window keeps its size but the pixel ratio changes (no resize event comes
  // with that), so the canvas has to be told, and the colours must not move when it redraws at the new size.
  if (!SIMULATE_P3) {
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    const before = await ev(`(() => { const c = document.querySelector('canvas.cv-layer:not(.cv-overlay):not(.ab-underlay)'); return { dpr: devicePixelRatio, w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height }; })()`);
    for (const dsf of [2, 1.5, 1]) {
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: win.getContentBounds().width, height: win.getContentBounds().height, deviceScaleFactor: dsf, mobile: false });
      // Someone moving the pen or mouse over the canvas is what draws the next frame in real use.
      const cb = win.getContentBounds();
      for (let i = 0; i < 6; i++) {
        win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(cb.width / 2) + i * 5, y: Math.round(cb.height / 2) });
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => setTimeout(r, 300));
      const at = await ev(`(() => {
        const canvas = document.querySelector('canvas.cv-layer:not(.cv-overlay):not(.ab-underlay)');
        const stage = document.querySelector('.cv-stage').getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        const g = canvas.getContext('2d');
        const k = canvas.width / box.width;
        return { dpr: devicePixelRatio, w: canvas.width, h: canvas.height, cssW: box.width, cssH: box.height, px: ${JSON.stringify(POINTS)}.map(([x, y]) => Array.from(g.getImageData(Math.floor((stage.left - box.left + ((x + 0.5) * stage.width) / ${W}) * k), Math.floor((stage.top - box.top + ((y + 0.5) * stage.height) / ${H}) * k), 1, 1).data)) };
      })()`);
      const wantW = Math.round(at.cssW * dsf);
      const wantH = Math.round(at.cssH * dsf);
      if (Math.abs(at.w - wantW) > 1 || Math.abs(at.h - wantH) > 1) fail(`at a pixel ratio of ${dsf} the canvas holds ${at.w}x${at.h} pixels for ${at.cssW}x${at.cssH} on screen, expected about ${wantW}x${wantH} (it did not follow the screen's scale)`);
      const off = Math.max(...at.px.flatMap((v, i) => v.map((c, j) => Math.abs(c - expect[i][j]))));
      if (off !== 0) fail(`at a pixel ratio of ${dsf} the colours moved by up to ${off}`);
      else console.log(`ok   pixel ratio ${dsf}: the canvas follows (${at.w}x${at.h} pixels, ${Math.round(at.cssW)}x${Math.round(at.cssH)} on screen) and the colours are the same`);
    }
    await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');
    dbg.detach();
    void before;
  }

  // The busy picture, for the card against software comparison: the whole thing, and each layer on its own (over the
  // same backdrop, as a layer on top of the first one, so a blend mode has something to work on), so a difference can be
  // pinned on the feature that makes it.
  const all = busy();
  const pictures = { all: busyDoc(all) };
  for (const p of all.slice(1)) pictures[p.layer.name] = busyDoc([all[0], p]);
  const got = {};
  for (const [name, pic] of Object.entries(pictures)) got[name] = Buffer.from(await ev(`window.__framelingEffects.pixels(${JSON.stringify(pic)}, 0)`)).toString('base64');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ mode: info && info.mode, renderer: info && info.renderer, pictures: got }));
  if (refFile) {
    const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));
    console.log(`\nbusy pictures, ${info ? info.mode : '?'} against ${ref.mode} (${ref.renderer}):`);
    let worstFlat = 0;
    let worstEdge = 0;
    const before = failed;
    for (const [name, b64] of Object.entries(got)) {
      const a = Buffer.from(b64, 'base64');
      const r = Buffer.from(ref.pictures[name], 'base64');
      const w = 120;
      const h = 90;
      const edge = new Uint8Array(w * h);
      const ea = edgeMask(a, w, h);
      const er = edgeMask(r, w, h);
      for (let i = 0; i < w * h; i++) edge[i] = ea[i] | er[i];
      let flatMax = 0;
      let edgeMax = 0;
      let edgeBig = 0;
      let edgeCount = 0;
      for (let i = 0; i < w * h; i++) {
        let m = 0;
        for (let j = 0; j < 4; j++) m = Math.max(m, Math.abs(a[i * 4 + j] - r[i * 4 + j]));
        if (edge[i]) {
          edgeCount++;
          if (m > edgeMax) edgeMax = m;
          if (m > EDGE_BIG) edgeBig++;
        } else if (m > flatMax) flatMax = m;
      }
      console.log(`  ${name.padEnd(8)} flat pixels (${w * h - edgeCount}) differ by at most ${flatMax}; edge pixels (${edgeCount}) by at most ${edgeMax}, ${edgeBig} of them by more than ${EDGE_BIG}`);
      if (flatMax > FLAT_MAX) fail(`${name}: away from edges the picture differs by ${flatMax}, over the limit of ${FLAT_MAX}`);
      if (edgeMax > EDGE_MAX) fail(`${name}: an edge pixel differs by ${edgeMax}, over the limit of ${EDGE_MAX}`);
      if (edgeCount && edgeBig / edgeCount > EDGE_SHARE) fail(`${name}: ${edgeBig} of ${edgeCount} edge pixels differ by more than ${EDGE_BIG}, over the limit of ${(EDGE_SHARE * 100).toFixed(0)}%`);
      worstFlat = Math.max(worstFlat, flatMax);
      worstEdge = Math.max(worstEdge, edgeMax);
    }
    if (failed === before) console.log(`ok   the card and software agree: within ${worstFlat} level(s) away from edges, within ${worstEdge} on edges (anti-aliasing)`);
  }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  app.exit(failed ? 1 : 0);
});
