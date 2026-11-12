// Animated WebP import in the real Chromium: decodePicture reads every frame of test/fixtures/apng/blocks.webp (lossless) and
// lossy.webp (lossy with alpha), once through the browser's ImageDecoder and once with ImageDecoder taken away (the file is
// cut into frames by src/pixel/import/webp.ts and the browser decodes each as a still WebP). Frames and delays must match what
// Pillow says the files hold.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/webp-import.cjs
//
// Exits non-zero when anything fails.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'test/fixtures/apng');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-webp-'));

buildSync({ entryPoints: [path.join(root, 'src/pixel/import/picture.ts')], bundle: true, format: 'iife', globalName: 'Picture', outfile: path.join(tmp, 'picture.js'), logLevel: 'error' });

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  // The page the app itself is loaded from is a file, which counts as a secure page (ImageDecoder needs one).
  fs.writeFileSync(path.join(tmp, 'page.html'), '<!doctype html><title>webp</title>');
  await win.loadFile(path.join(tmp, 'page.html'));
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(tmp, 'picture.js'), 'utf8'));
  const failures = [];
  const notes = [];
  // Each file twice: through ImageDecoder, and with ImageDecoder taken away so the file is cut up and each frame decoded as a still.
  // (Taking ImageDecoder away is for good, so the runs with it come first.)
  for (const withDecoder of [true, false]) {
    for (const [file, expectedFile, tol] of [['blocks.webp', 'blocks-webp.expected.json', 1], ['lossy.webp', 'lossy-webp.expected.json', 8]]) {
      const bytes = Array.from(fs.readFileSync(path.join(dir, file)));
      const want = JSON.parse(fs.readFileSync(path.join(dir, expectedFile), 'utf8'));
      const label = `${file} ${withDecoder ? 'with ImageDecoder' : 'without ImageDecoder'}`;
      const got = await win.webContents.executeJavaScript(`(async () => {
        const hasDecoder = typeof ImageDecoder === 'function';
        ${withDecoder ? '' : 'delete globalThis.ImageDecoder;'}
        const p = await Picture.decodePicture(new Uint8Array(${JSON.stringify(bytes)}));
        return { hasDecoder, kind: p.kind, width: p.width, height: p.height, notes: p.notes, frames: p.frames.map((f) => ({ delay: f.delay, rgba: Array.from(f.pixels) })) };
      })()`);
      if (withDecoder && !got.hasDecoder) failures.push(`${label}: this Chromium has no ImageDecoder`);
      if (got.kind !== 'webp') {
        failures.push(`${label}: kind ${got.kind}, notes ${got.notes.join(' ')}`);
        continue;
      }
      if (got.width !== want.width || got.height !== want.height) failures.push(`${label}: size differs`);
      if (got.frames.length !== want.frames.length) failures.push(`${label}: ${got.frames.length} frames, Pillow says ${want.frames.length}`);
      got.frames.forEach((f, i) => {
        const w = want.frames[i];
        if (!w) return;
        if (f.delay !== w.delay) failures.push(`${label}: frame ${i} delay ${f.delay}, Pillow says ${w.delay}`);
        const b = Buffer.from(w.rgba, 'hex');
        let bad = 0;
        for (let p = 0; p < b.length; p += 4) {
          if (b[p + 3] === 0 && f.rgba[p + 3] === 0) continue;
          if (Math.max(...[0, 1, 2, 3].map((k) => Math.abs(f.rgba[p + k] - b[p + k]))) > tol) bad++;
        }
        if (bad) failures.push(`${label}: frame ${i}: ${bad} pixels differ`);
      });
      notes.push(`${label}: ${got.frames.length} frames, delays ${got.frames.map((f) => f.delay).join(', ')} ms`);
    }
  }
  console.log(failures.length ? `FAIL ${failures.join('; ')}` : notes.map((n) => `ok   animated WebP ${n}`).join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failures.length ? 1 : 0);
});
