// Dashes, arrow heads and changing widths: the screen beside what comes out of each export, drawn by something that is
// not Frameling (SVG by rsvg-convert, PDF by pdftoppm, Lottie by lottie-web, PNG as exported), in both themes.
//
//   npm run build
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/shape-tools-files.cjs <outDir>
//
// Needs rsvg-convert, pdftoppm and ImageMagick (convert, montage) on the PATH.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mockMain, makeWindow, sleep } = require('../docs/steps.cjs');
const { T, view, INK, rect, ell, line, pathOf, label, stroke, put } = require('../docs/help/_shapes.cjs');

const root = path.join(__dirname, '../..');
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('.cjs') && !a.startsWith('-')) ?? path.join(root, 'brand/ab/shape-tools'));
const THEME = { dark: 'midnight-sketchbook', light: 'paper-and-honey' };
const BLUE = '#4a7cf0';
const RED = '#e0685e';

const SHAPES = [
  line(110, 90, 560, 90, stroke(INK, 8, { cap: 'butt', dash: [3, 2] })),
  line(110, 170, 560, 170, stroke(INK, 8, { cap: 'round', dash: [0.01, 2] })),
  line(110, 250, 560, 250, stroke(INK, 8, { cap: 'round', dash: [4, 2, 0.01, 2] })),
  line(110, 330, 560, 330, stroke(BLUE, 8, { arrowEnd: 'triangle', arrowSize: 4 })),
  line(110, 410, 560, 410, stroke(RED, 8, { arrowStart: 'dot', arrowEnd: 'open', arrowSize: 3.5 })),
  pathOf([{ x: 110, y: 520 }, { x: 560, y: 520, c1: { x: 250, y: 440 }, c2: { x: 420, y: 600 } }], stroke(INK, 26, { widths: [{ at: 0, w: 0.15 }, { at: 0.5, w: 1.3 }, { at: 1, w: 0.15 }] })),
  pathOf([{ x: 110, y: 640 }, { x: 560, y: 640 }], stroke('#2a9d8f', 22, { cap: 'round', widths: [{ at: 0, w: 1 }, { at: 1, w: 0.05 }] })),
  ell(700, 90, 230, 230, null, stroke(INK, 8, { cap: 'round', dash: [0.01, 2.4] })),
  rect(700, 400, 360, 220, '#f7c95a', stroke(INK, 8, { cap: 'butt', join: 'miter', dash: [3, 2] })),
];

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
// A Lottie file needs more than one frame to be played from (a one frame file shows nothing in lottie-web), so it is the whole drawing.
const b64 = (win, format) => win.webContents.executeJavaScript(`__framelingExport.fileBase64(${JSON.stringify(format)}, 0, ${JSON.stringify(format === 'lottie' ? 'all' : 'frame')})`);

async function lottieStill(Win, text, png, w, h) {
  // lottie-web draws nothing at all when the file has the white stage colour as a solid layer (the page behind is white anyway), so it is left out here.
  const data = JSON.parse(text);
  data.layers = data.layers.filter((l) => l.ty !== 1);
  const json = JSON.stringify(data);
  const dir = path.dirname(png);
  const page = path.join(dir, 'lottie.html');
  const lib = path.join(root, 'node_modules/lottie-web/build/player/lottie.min.js');
  fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}#c{width:${w}px;height:${h}px}</style></head><body><div id="c"></div><script src="file://${lib}"></script><script>const a = lottie.loadAnimation({ container: document.getElementById('c'), renderer: 'svg', loop: false, autoplay: false, animationData: ${json} }); a.goToAndStop(0, true); window.ready = true;</script></body></html>`);
  const win = new Win({ show: false, paintWhenInitiallyHidden: true, width: w, height: h, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (ev) => console.log('lottie page:', String(ev.message ?? ev).slice(0, 200)));
  await win.loadFile(page);
  await sleep(900);
  console.log('lottie svg size', await win.webContents.executeJavaScript(`(() => { const s = document.querySelector('svg'); return s ? [s.getAttribute('width'), s.getAttribute('height'), s.innerHTML.length, document.documentElement.scrollWidth, document.documentElement.scrollHeight].join(' ') : 'no svg'; })()`));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(png, img.toPNG());
  win.destroy();
}

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  fs.mkdirSync(outDir, { recursive: true });
  mockMain(ipcMain);
  const win = makeWindow(BrowserWindow, 1280, 800);
  await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shape-files-'));
  for (const mode of ['dark', 'light']) {
    const prefs = { theme: mode, look: 'cosy', darkTheme: THEME.dark, lightTheme: THEME.light, showWelcome: false };
    await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ 'workspace.follow': 'never' }))}); true;`);
    await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
    await sleep(2000);
    for (const step of [T('blank-vector'), view(0.6), put('Lines', SHAPES, [])]) await win.webContents.executeJavaScript(step.eval);
    await win.webContents.executeJavaScript(`__frameling.store().setUi({ selection: [] })`);
    await sleep(900);
    const work = path.join(tmp, mode);
    fs.mkdirSync(work, { recursive: true });
    console.log('doc ready');
    // The screen, cropped to the canvas.
    fs.writeFileSync(path.join(work, 'screen.png'), (await win.webContents.capturePage({ x: 113, y: 47, width: 764, height: 432 })).toPNG());
    // Each export, through the real exporter.
    const files = { svg: 'drawing.svg', pdf: 'drawing.pdf', lottie: 'drawing.json', png: 'drawing.png' };
    for (const [format, name] of Object.entries(files)) {
      console.log('exporting', format);
      // lottie-web shows nothing for a file of one frame, so the drawing is held for two before it is exported as Lottie.
      if (format === 'lottie') await win.webContents.executeJavaScript(`__frameling.store().update('two frames', (d) => { d.length = 2; for (const l of d.layers) for (const c of l.cels) c.length = 2; })`);
      const data = await b64(win, format);
      if (!data) throw new Error(`${format} made no file`);
      fs.writeFileSync(path.join(work, name), Buffer.from(data, 'base64'));
    }
    // Drawn by something else.
    sh('rsvg-convert', ['-w', '764', path.join(work, 'drawing.svg'), '-o', path.join(work, 'svg.png')]);
    sh('pdftoppm', ['-png', '-singlefile', '-scale-to-x', '764', '-scale-to-y', '-1', path.join(work, 'drawing.pdf'), path.join(work, 'pdf')]);
    await lottieStill(BrowserWindow, fs.readFileSync(path.join(work, 'drawing.json'), 'utf8'), path.join(work, 'lottie-full.png'), 1280, 720);
    sh('convert', [path.join(work, 'lottie-full.png'), '-resize', '764x', path.join(work, 'lottie.png')]);
    sh('convert', [path.join(work, 'drawing.png'), '-background', 'white', '-flatten', '-resize', '764x', path.join(work, 'png.png')]);
    // A grid with a name over each picture.
    const tiles = [['On screen in Frameling', 'screen'], ['PNG export (also video, GIF, sheets)', 'png'], ['SVG export, drawn by rsvg-convert', 'svg'], ['PDF export, drawn by pdftoppm', 'pdf'], ['Lottie export, played by lottie-web', 'lottie']];
    const labelled = tiles.map(([name, f]) => {
      const out = path.join(work, `${f}-l.png`);
      sh('convert', [path.join(work, `${f}.png`), '-background', mode === 'dark' ? '#1b1a24' : '#f3efe6', '-fill', mode === 'dark' ? '#ffffff' : '#222222', '-gravity', 'north', '-splice', '0x34', '-pointsize', '20', '-annotate', '+0+6', name, out]);
      return out;
    });
    sh('montage', [...labelled, '-tile', '2x', '-geometry', '+8+8', '-background', mode === 'dark' ? '#0f0e15' : '#e4ded0', path.join(work, 'grid.png')]);
    sh('convert', [path.join(work, 'grid.png'), '-colors', '256', '-dither', 'None', '-strip', `PNG8:${path.join(outDir, `strokes-screen-and-files-${mode}.png`)}`]);
    // Keep the exported files themselves, so they can be opened and checked.
    for (const name of Object.values(files)) fs.copyFileSync(path.join(work, name), path.join(outDir, `exported-${mode}-${name}`));
    console.log(`ok strokes-screen-and-files-${mode}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  win.destroy();
  app.quit();
});
