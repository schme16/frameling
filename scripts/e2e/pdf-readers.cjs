// Hidden layers in a PDF, as the readers people actually have show them. Frameling writes layers as optional content
// (OCG), with hidden ones in /OFF, and a reader that ignores optional content would show art that is meant to be off.
// This writes the PDFs and Frameling's own picture of the same frame, draws each PDF with every reader on this
// computer, and says which ones agree.
//
//   npm run build
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pdf-readers.cjs [outDir] [--only=a,b]
//
// Readers: poppler (pdftoppm, what most Linux viewers use), Ghostscript (gs), MuPDF (mutool) and qpdf for reading the
// file's own layer list. A browser is not one of them: Chrome and Firefox use PDFium and pdf.js, which have to be
// driven in a browser, so this writes <outDir>/browser/index.html to open there and compare by eye.
//
// Outputs in outDir: <case>.pdf, <case>-frameling.png, <case>-<reader>.png, browser/index.html, report.json.
// Exits non-zero when a reader shows art that Frameling's own picture does not.
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixtures } = require('./illustrator-fixtures.cjs');
const gpu = require('../lib/gpu.cjs');

gpu.use('software', { noGpu: true });

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('pdf-readers.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-pdf-')));
const ONLY = argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) => cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const have = (cmd) => sh('which', [cmd]).status === 0;

// The cases worth asking a reader about: every one whose point is that something is switched off.
const WANT = ['hidden-layers', 'hidden-in-effect-folder', 'layers-folders', 'nested-folders'];
const cases = fixtures.filter((f) => WANT.includes(f.id)).filter((f) => !ONLY || ONLY.includes(f.id));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'browser'), { recursive: true });

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);

async function startApp() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.on('show', () => w.hide());
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('The app never opened a window');
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

/** Reads a PNG's pixels through the page, so no image library is needed here. */
const pixelsOf = (file) =>
  ev(`(async () => {
    const b = await fetch(${JSON.stringify(pathToFileURL(file).href)}).then((r) => r.blob());
    const bm = await createImageBitmap(b);
    const c = new OffscreenCanvas(${160}, ${90});
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bm, 0, 0, c.width, c.height);
    return [...x.getImageData(0, 0, c.width, c.height).data];
  })()`);

/** Root mean square difference between two pixel lists, 0 to 1. */
function rmse(a, b) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = (a[i + k] - b[i + k]) / 255;
      sum += d * d;
      n++;
    }
  }
  return Math.sqrt(sum / n);
}

const READERS = [
  { id: 'poppler', cmd: 'pdftoppm', run: (pdf, png) => sh('pdftoppm', ['-png', '-r', '96', '-singlefile', pdf, png.replace(/\.png$/, '')]) },
  { id: 'ghostscript', cmd: 'gs', run: (pdf, png) => sh('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', '-r96', `-sOutputFile=${png}`, pdf]) },
  { id: 'mupdf', cmd: 'mutool', run: (pdf, png) => sh('mutool', ['draw', '-r', '96', '-o', png, pdf, '1']) },
];

async function main() {
  await startApp();
  const report = { cases: [], readers: READERS.filter((r) => have(r.cmd)).map((r) => r.id), missing: READERS.filter((r) => !have(r.cmd)).map((r) => r.id) };
  let bad = 0;
  for (const c of cases) {
    await ev(c.code);
    const pdf64 = await ev(`window.__framelingExport.fileBase64('pdf', 0, 'frame')`);
    const png64 = await ev(`window.__framelingExport.pngBase64(0, 1)`);
    const pdf = path.join(outDir, `${c.id}.pdf`);
    const own = path.join(outDir, `${c.id}-frameling.png`);
    fs.writeFileSync(pdf, Buffer.from(pdf64, 'base64'));
    fs.writeFileSync(own, Buffer.from(png64, 'base64'));
    const mine = await pixelsOf(own);
    const row = { id: c.id, title: c.title, readers: {} };
    // What the file itself says about its layers, for the report.
    if (have('qpdf')) {
      const j = sh('qpdf', ['--json', pdf]);
      const names = [...(j.stdout || '').matchAll(/"\/Name":\s*"([^"]+)"/g)].map((m) => m[1]);
      row.ocgNames = [...new Set(names)];
      row.offCount = ((j.stdout || '').match(/"\/OFF":\s*\[([^\]]*)\]/)?.[1].match(/\d+ \d+ R/g) || []).length;
    }
    for (const r of READERS) {
      if (!have(r.cmd)) continue;
      const png = path.join(outDir, `${c.id}-${r.id}.png`);
      const out = r.run(pdf, png);
      if (!fs.existsSync(png)) {
        row.readers[r.id] = { error: (out.stderr || out.stdout || 'no picture').trim().slice(0, 200) };
        continue;
      }
      const e = rmse(mine, await pixelsOf(png));
      // A reader that ignores optional content draws the hidden art, which is a big difference, not a small one.
      const ok = e <= 0.06;
      row.readers[r.id] = { rmse: Number(e.toFixed(4)), ok };
      if (!ok) bad++;
    }
    report.cases.push(row);
    console.log(`${c.id}: ${Object.entries(row.readers).map(([k, v]) => `${k} ${v.error ? 'error' : v.rmse}`).join(', ')}`);
  }
  // A page for the browsers, which can only be judged in a browser.
  const page = `<!doctype html><meta charset="utf-8"><title>Hidden layers in a PDF</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;background:#faf7f2;color:#1d1b26}
h1{font-size:20px}h2{font-size:16px;margin:28px 0 8px}.row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.cell{border:1px solid #ddd8d0;border-radius:8px;padding:8px;background:#fff}.cell b{display:block;margin-bottom:6px;font-size:13px}
img,object{width:360px;height:auto;display:block;background:#fff}object{height:260px}</style>
<h1>Hidden layers in a PDF: what this browser shows</h1>
<p>Each row is the same frame: Frameling's own picture on the left, and the PDF drawn by this browser on the right.
They should look the same. If the browser's side has art the left does not, the browser is ignoring the layers that
are switched off in the file.</p>
${report.cases
  .map(
    (c) => `<h2>${c.title} (${c.id})</h2><div class="row">
<div class="cell"><b>Frameling</b><img src="../${c.id}-frameling.png" alt=""></div>
<div class="cell"><b>This browser</b><object data="../${c.id}.pdf#toolbar=0&navpanes=0" type="application/pdf"></object></div>
</div>`,
  )
  .join('\n')}`;
  fs.writeFileSync(path.join(outDir, 'browser', 'index.html'), page);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${outDir}`);
  console.log(`Readers run: ${report.readers.join(', ') || 'none'}${report.missing.length ? `; not on this computer: ${report.missing.join(', ')}` : ''}`);
  console.log(`Open browser/index.html in a browser for Chrome's and Firefox's own readers.`);
  app.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  app.exit(1);
});
