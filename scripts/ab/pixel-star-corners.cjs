// Draws the A/B pictures for thick pixel star and polygon corners into brand/ab/pixel-star-corners/ (run under xvfb):
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/pixel-star-corners.cjs
const { app, BrowserWindow } = require('electron');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.join(root, 'brand', 'ab', 'pixel-star-corners');
const VARIANTS = [
  ['round', 'A  round brush (before)'],
  ['square', 'B  square brush'],
  ['steady', 'C  steady, round corners'],
  ['corner', 'D  corner-aware (new default)'],
];
const SIZES = [2, 3, 4];
const SHAPES = ['star', 'polygon'];
const SCALE = 6;
const CELL = 34;

// Software drawing with no GPU process at all (an offscreen window paints nothing otherwise), colour pinned to sRGB (scripts/lib/gpu.cjs).
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'psc-')), 'cells.cjs');
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'pixelStarCorners.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'error' });
  const { cellsFor } = require(bundle);
  const data = {};
  for (const shape of SHAPES) for (const size of SIZES) for (const [v] of VARIANTS) data[`${shape}-${size}-${v}`] = cellsFor(shape, size, v);
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1100, height: 1500, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body style="margin:0"></body>');
  for (const theme of ['light', 'dark']) {
    const dark = theme === 'dark';
    const page = `(${draw.toString()})(${JSON.stringify({ data, VARIANTS, SIZES, SHAPES, SCALE, CELL, dark })})`;
    const size = await win.webContents.executeJavaScript(page);
    win.setContentSize(size.w, size.h);
    await new Promise((r) => setTimeout(r, 200));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: size.w, height: size.h });
    fs.writeFileSync(path.join(out, `ab-${theme}.png`), img.toPNG());
    if (!dark) {
      // One close-up of the star at thickness 2 for each way, larger.
      const big = `(${closeup.toString()})(${JSON.stringify({ data, VARIANTS, dark })})`;
      const s2 = await win.webContents.executeJavaScript(big);
      win.setContentSize(s2.w, s2.h);
      await new Promise((r) => setTimeout(r, 200));
      const img2 = await win.webContents.capturePage({ x: 0, y: 0, width: s2.w, height: s2.h });
      fs.writeFileSync(path.join(out, 'star-2px-closeup.png'), img2.toPNG());
    }
  }
  app.quit();
});

// Runs in the page.
function draw({ data, VARIANTS, SIZES, SHAPES, SCALE, CELL, dark }) {
  const bg = dark ? '#1d1b26' : '#f6f3ee';
  const ink = dark ? '#e9e6f2' : '#1d1b26';
  const FILL = '#ffd166';
  const STROKE = '#e0457b';
  const pad = 20;
  const labelW = 120;
  const head = 44;
  const cw = CELL * SCALE;
  const rows = [];
  for (const shape of SHAPES) for (const size of SIZES) rows.push([shape, size]);
  const w = labelW + VARIANTS.length * (cw + pad) + pad;
  const h = head + rows.length * (cw + pad) + pad;
  document.body.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink;
  g.font = '600 15px sans-serif';
  VARIANTS.forEach(([, label], i) => g.fillText(label, labelW + i * (cw + pad) + 4, 28));
  rows.forEach(([shape, size], r) => {
    const y0 = head + r * (cw + pad);
    g.fillStyle = ink;
    g.font = '15px sans-serif';
    g.fillText(`${shape}`, 14, y0 + cw / 2 - 6);
    g.fillText(`${size} px`, 14, y0 + cw / 2 + 14);
    VARIANTS.forEach(([v], i) => {
      const x0 = labelW + i * (cw + pad);
      g.fillStyle = dark ? '#262436' : '#ffffff';
      g.fillRect(x0, y0, cw, cw);
      const d = data[`${shape}-${size}-${v}`];
      g.fillStyle = FILL;
      for (const [x, y] of d.fill) g.fillRect(x0 + x * SCALE, y0 + y * SCALE, SCALE, SCALE);
      g.fillStyle = STROKE;
      for (const [x, y] of d.edge) g.fillRect(x0 + x * SCALE, y0 + y * SCALE, SCALE, SCALE);
    });
  });
  return { w, h };
}

function closeup({ data, VARIANTS, dark }) {
  const S = 14;
  const N = 34;
  const pad = 16;
  const head = 36;
  const w = VARIANTS.length * (N * S + pad) + pad;
  const h = head + N * S + pad;
  document.body.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#1d1b26' : '#f6f3ee';
  g.fillRect(0, 0, w, h);
  VARIANTS.forEach(([v, label], i) => {
    const x0 = pad + i * (N * S + pad);
    g.fillStyle = dark ? '#e9e6f2' : '#1d1b26';
    g.font = '600 15px sans-serif';
    g.fillText(label, x0, 24);
    g.fillStyle = dark ? '#262436' : '#ffffff';
    g.fillRect(x0, head, N * S, N * S);
    const d = data[`star-2-${v}`];
    g.fillStyle = '#ffd166';
    for (const [x, y] of d.fill) g.fillRect(x0 + x * S, head + y * S, S, S);
    g.fillStyle = '#e0457b';
    for (const [x, y] of d.edge) g.fillRect(x0 + x * S, head + y * S, S, S);
  });
  return { w, h };
}
