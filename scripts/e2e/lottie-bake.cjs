// Bakes effect-heavy documents several ways and prints file size and RMSE against Frameling's own frames (lottie-web
// canvas player), so the picture settings can be compared. Reuses vector-check's page.
//
//   ONLY=heavy-effects,tpl:explosion-fx xvfb-run -a npx electron scripts/e2e/lottie-bake.cjs [outDir]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const argv = process.argv.slice(2).filter((a) => !a.endsWith('lottie-bake.cjs') && !a.startsWith('--'));
const outDir = path.resolve(argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-bake-')));
fs.mkdirSync(outDir, { recursive: true });
const VARIANTS = [
  { label: 'sharp (png 2x)', opts: { pictures: 'sharp' } },
  { label: 'png 1x', opts: { bake: { scale: 1, format: 'png' } } },
  { label: 'webp lossless 2x', opts: { bake: { scale: 2, format: 'webp', quality: 1 } } },
  { label: 'webp q.9 2x', opts: { pictures: 'balanced' } },
  { label: 'webp q.8 2x', opts: { bake: { scale: 2, format: 'webp', quality: 0.8 } } },
  { label: 'webp q.9 1.5x', opts: { bake: { scale: 1.5, format: 'webp', quality: 0.9 } } },
  { label: 'webp q.9 1x', opts: { bake: { scale: 1, format: 'webp', quality: 0.9 } } },
  { label: 'small (webp q.8 1x)', opts: { pictures: 'small' } },
  { label: 'soften+shadow as pictures', opts: { softAndShadow: 'pictures' } },
];

app.whenReady().then(async () => {
  try {
    await require('esbuild').build({
      entryPoints: [path.join(__dirname, 'vector-check-page.ts')],
      bundle: true,
      format: 'iife',
      outfile: path.join(outDir, 'page.js'),
      logLevel: 'error',
      loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    });
    fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="svg"></div><div id="lsvg"></div><div id="lottie"></div><script src="page.js"></script></body></html>');
    const win = new BrowserWindow({ width: 1000, height: 700, show: true, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(pathToFileURL(path.join(outDir, 'index.html')).href);
    const ev = (js) => win.webContents.executeJavaScript(js);
    const names = (process.env.ONLY ?? 'heavy-effects,effects,tpl:explosion-fx').split(',');
    for (const name of names) {
      await ev(`check.load(${JSON.stringify(name)})`);
      console.log('\n' + name);
      const rows = await ev(`check.variants(${JSON.stringify(VARIANTS)})`);
      for (const r of rows) console.log(r.label.padEnd(24), String(r.bytes).padStart(9), 'bytes  pictures', String(r.baked).padStart(9), ' rmse', r.rmse.toFixed(2), ' ', r.ms.toFixed(0) + 'ms');
    }
    // AB=dir: one frame of each look drawn at 2x the stage size, to compare by eye.
    if (process.env.AB) {
      fs.mkdirSync(process.env.AB, { recursive: true });
      const frame = Number(process.env.FRAME ?? 9);
      for (const name of names) {
        await ev(`check.load(${JSON.stringify(name)})`);
        for (const v of VARIANTS) {
          const url = await ev(`check.pictureAt(${JSON.stringify(v.opts)}, ${frame}, 2)`);
          fs.writeFileSync(path.join(process.env.AB, `${name.replace(/[^a-z0-9]+/gi, '-')}-${v.label.replace(/[^a-z0-9.]+/gi, '-')}.png`), Buffer.from(url.split(',')[1], 'base64'));
        }
      }
    }
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
