// Checks the Lottie and animated SVG exports against Frameling's own renderer, frame by frame, in Chromium.
//
// For each test document (Bouncing logo, a shape tween with hints, a camera move with a parallax layer, the
// frame-by-frame Bouncing ball and a pixel layer) it renders frames with renderFrame, with lottie-web (canvas
// renderer) from docToLottie, and with Chromium's SVG renderer from animatedSvg (CSS animations paused and moved to
// the frame, then the window captured). It prints the mean difference per channel (0 to 255) and the share of pixels
// that differ by more than 48 in any channel, and fails when a frame is far off.
//
//   xvfb-run -a npx electron scripts/e2e/vector-check.cjs [outDir]
//
// Needs no build: the page is bundled with esbuild on the spot.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('vector-check.cjs') && !a.startsWith('--'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-vector-')));
fs.mkdirSync(outDir, { recursive: true });
// Thresholds for a pass: anti-aliasing differs between renderers, so a few edge pixels always do.
const MAX_MEAN = 3;
const MAX_OFF = 2;

async function bundle() {
  const esbuild = require('esbuild');
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'vector-check-page.ts')],
    bundle: true,
    format: 'iife',
    outfile: path.join(outDir, 'page.js'),
    logLevel: 'error',
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
  });
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;overflow:hidden}#svg{position:absolute;left:0;top:0;line-height:0}#lottie{position:absolute;left:0;top:0;visibility:hidden}</style></head><body><div id="svg"></div><div id="lottie"></div><script src="page.js"></script></body></html>`,
  );
}

app.whenReady().then(async () => {
  let failed = false;
  try {
    await bundle();
    const win = new BrowserWindow({ width: 1400, height: 900, show: true, x: 0, y: 0, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: false } });
    const errors = new Set();
    win.webContents.on('console-message', (e) => {
      const m = e.message ?? '';
      if (e.level === 'error' || e.level === 3 || /error/i.test(m)) errors.add(m.slice(0, 300));
    });
    await win.loadURL(pathToFileURL(path.join(outDir, 'index.html')).href);
    const ev = (js) => win.webContents.executeJavaScript(js);
    const only = process.env.ONLY?.split(',');
    const names = (await ev('check.names()')).filter((n) => !only || only.includes(n));
    const report = [];
    for (const name of names) {
      const info = await ev(`check.load(${JSON.stringify(name)})`);
      const frames = [...new Set([0, 1, Math.floor(info.length / 4), Math.floor(info.length / 3), Math.floor(info.length / 2), Math.floor((info.length * 2) / 3), info.length - 1])].filter((f) => f >= 0 && f < info.length);
      for (const f of frames) {
        const lot = await ev(`check.lottieAt(${f})`);
        const r = await ev(`check.svgSeek(${f})`);
        await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
        const img = await win.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: info.width, height: info.height });
        const sized = img.getSize().width === info.width ? img : img.resize({ width: info.width, height: info.height });
        const bgra = sized.toBitmap();
        const rgba = new Array(bgra.length);
        for (let i = 0; i < bgra.length; i += 4) {
          rgba[i] = bgra[i + 2];
          rgba[i + 1] = bgra[i + 1];
          rgba[i + 2] = bgra[i];
          rgba[i + 3] = bgra[i + 3];
        }
        if (f === frames[2]) {
          fs.writeFileSync(path.join(outDir, `${name}-svg-${f}.png`), sized.toPNG());
          const pics = await ev(`check.lottiePictures(${f})`);
          for (const [k, url] of Object.entries(pics)) fs.writeFileSync(path.join(outDir, `${name}-${k}-${f}.png`), Buffer.from(url.split(',')[1], 'base64'));
        }
        const svg = await ev(`check.svgCompare(${f}, ${JSON.stringify(rgba)})`);
        const bad = lot.mean > MAX_MEAN || lot.off > MAX_OFF || svg.mean > MAX_MEAN || svg.off > MAX_OFF;
        failed ||= bad;
        if (bad) {
          // Keep the pictures of a frame that's off, to look at.
          fs.writeFileSync(path.join(outDir, `${name}-svg-${f}.png`), sized.toPNG());
          const pics = await ev(`check.lottiePictures(${f})`);
          for (const [k, url] of Object.entries(pics)) fs.writeFileSync(path.join(outDir, `${name}-${k}-${f}.png`), Buffer.from(url.split(',')[1], 'base64'));
        }
        report.push({ doc: name, frame: f, lottieMean: +lot.mean.toFixed(2), lottieOff: +lot.off.toFixed(2), svgMean: +svg.mean.toFixed(2), svgOff: +svg.off.toFixed(2), bad });
      }
      report.push({ doc: name, lottieBytes: info.lottieBytes, svgBytes: info.svgBytes });
    }
    for (const r of report) console.log(JSON.stringify(r));
    for (const e of errors) console.log('page error:', e);
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(failed ? 'SOME FRAMES DIFFER' : 'ALL FRAMES MATCH', '->', outDir);
  } catch (e) {
    console.error(e);
    failed = true;
  }
  app.exit(failed ? 1 : 0);
});
