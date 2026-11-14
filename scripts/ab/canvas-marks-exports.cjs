// Marks drawn over a picture, beside what the exports make of the same frame: the screen with the marks showing, the PNG
// the real exporter writes, and the SVG (drawn by rsvg-convert), in both themes. The two exports carry no marks.
//
//   npm run build
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/ab/canvas-marks-exports.cjs <outDir>
//
// Needs rsvg-convert and ImageMagick (convert, montage) on the PATH. The default outDir is brand/ab/canvas-notes.
const { app, BrowserWindow, ipcMain } = require('electron');
const gpu = require('../lib/gpu.cjs');
gpu.use('software', { noGpu: true });
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mockMain, makeWindow, sleep } = require('../docs/steps.cjs');
const { T, view, INK, ell, line, stroke, put } = require('../docs/help/_shapes.cjs');

const root = path.join(__dirname, '../..');
const outDir = path.resolve(process.argv.slice(2).find((a) => !a.endsWith('.cjs') && !a.startsWith('-')) ?? path.join(root, 'brand/ab/canvas-notes'));
const THEME = { dark: 'midnight-sketchbook', light: 'paper-and-honey' };

const FACE = [
  ell(380, 140, 520, 470, '#ffd9a8', stroke(INK, 8)),
  ell(470, 260, 120, 120, '#ffffff', stroke(INK, 6)), ell(515, 305, 40, 40, INK, null),
  ell(720, 330, 64, 64, '#ffffff', stroke(INK, 6)), ell(740, 350, 24, 24, INK, null),
  line(520, 520, 780, 470, stroke('#d3445f', 12)),
  line(640, 380, 625, 450, stroke(INK, 6)),
];
const MARKS = [
  { id: 'k1', kind: 'arrow', pts: [1010, 215, 818, 340], pin: 'frame', frame: 0 },
  { id: 'k2', kind: 'text', pts: [930, 140], text: 'Raise this eye', pin: 'frame', frame: 0, w: 4, color: '#ffd60a' },
  { id: 'k3', kind: 'circle', pts: [470, 425, 835, 575], pin: 'frame', frame: 0, color: '#3b82f6', w: 4 },
  { id: 'k4', kind: 'scribble', pts: [420, 215, 450, 160, 475, 225, 505, 150, 530, 220, 560, 155, 585, 215], pin: 'frame', frame: 0, color: '#2ec27e', w: 4 },
];

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
const b64 = (win, format) => win.webContents.executeJavaScript(`__framelingExport.fileBase64(${JSON.stringify(format)}, 0, 'frame')`);

app.whenReady().then(async () => {
  await gpu.confirmOrExit();
  fs.mkdirSync(outDir, { recursive: true });
  mockMain(ipcMain);
  const win = makeWindow(BrowserWindow, 1280, 800);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marks-ab-'));
  for (const mode of ['dark', 'light']) {
    const prefs = { theme: mode, look: 'cosy', darkTheme: THEME.dark, lightTheme: THEME.light, showWelcome: false, firstDrawn: true, showTips: false };
    await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
    await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('frameling.prefs.v1', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ 'workspace.follow': 'never', 'marks.pin': 'frame' }))}); true;`);
    await win.loadFile(path.join(root, 'dist/renderer/index.html'), { query: { debug: '1' } });
    await sleep(2000);
    for (const step of [T('blank-vector'), view(0.5), put('Lines', FACE, [])]) await win.webContents.executeJavaScript(step.eval);
    await win.webContents.executeJavaScript(`__frameling.store().setUi({ selection: [], tool: 'marks' }); __framelingNotes.addMarks(${JSON.stringify(MARKS)}); true`);
    await sleep(900);
    const work = path.join(tmp, mode);
    fs.mkdirSync(work, { recursive: true });
    const crop = { x: 140, y: 62, width: 720, height: 405 };
    fs.writeFileSync(path.join(work, 'screen.png'), (await win.webContents.capturePage(crop)).toPNG());
    // The same frame, marks hidden by the switch, to show it is the same picture underneath.
    await win.webContents.executeJavaScript(`__frameling.run('marks.toggleShow'); true`);
    await sleep(500);
    fs.writeFileSync(path.join(work, 'hidden.png'), (await win.webContents.capturePage(crop)).toPNG());
    await win.webContents.executeJavaScript(`__frameling.run('marks.toggleShow'); true`);
    // Each export, through the real exporter, with the marks still in the file.
    const marksInDoc = await win.webContents.executeJavaScript(`(__frameling.store().get().doc.marks ?? []).length`);
    if (marksInDoc !== MARKS.length) throw new Error(`expected ${MARKS.length} marks in the document, found ${marksInDoc}`);
    for (const [format, name] of [['png', 'drawing.png'], ['svg', 'drawing.svg']]) {
      const data = await b64(win, format);
      if (!data) throw new Error(`${format} made no file`);
      fs.writeFileSync(path.join(work, name), Buffer.from(data, 'base64'));
    }
    const svg = fs.readFileSync(path.join(work, 'drawing.svg'), 'utf8');
    if (/Raise this eye|#3b82f6|#2ec27e/i.test(svg)) throw new Error('a mark reached the SVG export');
    sh('rsvg-convert', ['-w', '764', path.join(work, 'drawing.svg'), '-o', path.join(work, 'svg.png')]);
    sh('convert', [path.join(work, 'drawing.png'), '-background', 'white', '-flatten', '-resize', '764x', path.join(work, 'png.png')]);
    const bg = mode === 'dark' ? '#1b1a24' : '#f3efe6';
    const fg = mode === 'dark' ? '#ffffff' : '#222222';
    const tiles = [['A: on the canvas, marks showing', 'screen'], ['B: the exported PNG, no marks', 'png'], ['B: the exported SVG, no marks', 'svg']];
    const labelled = tiles.map(([name, f]) => {
      const out = path.join(work, `${f}-l.png`);
      sh('convert', [path.join(work, `${f}.png`), '-resize', '764x', '-background', bg, '-fill', fg, '-gravity', 'north', '-splice', '0x34', '-pointsize', '20', '-annotate', '+0+6', name, out]);
      return out;
    });
    sh('montage', [...labelled, '-tile', '3x', '-geometry', '+8+8', '-background', mode === 'dark' ? '#0f0e15' : '#e4ded0', path.join(work, 'grid.png')]);
    sh('convert', [path.join(work, 'grid.png'), '-colors', '256', '-dither', 'None', '-strip', `PNG8:${path.join(outDir, `marks-shown-vs-exported-${mode}.png`)}`]);
    fs.copyFileSync(path.join(work, 'drawing.png'), path.join(outDir, `exported-${mode}-frame.png`));
    console.log(`ok marks-shown-vs-exported-${mode}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  win.destroy();
  app.quit();
});
