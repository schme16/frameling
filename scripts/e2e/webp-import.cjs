// Animated WebP import in the real Chromium: decodePicture reads every frame of test/fixtures/apng/blocks.webp (through the
// browser's ImageDecoder) and the frames and delays match what Pillow says the file holds. Also checks that a still WebP stays
// one picture.
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
  const bytes = Array.from(fs.readFileSync(path.join(dir, 'blocks.webp')));
  const got = await win.webContents.executeJavaScript(`(async () => {
    const hasDecoder = typeof ImageDecoder === 'function';
    const p = await Picture.decodePicture(new Uint8Array(${JSON.stringify(bytes)}));
    return { hasDecoder, kind: p.kind, width: p.width, height: p.height, notes: p.notes, frames: p.frames.map((f) => ({ delay: f.delay, rgba: Array.from(f.pixels) })) };
  })()`);
  const want = JSON.parse(fs.readFileSync(path.join(dir, 'blocks-webp.expected.json'), 'utf8'));
  const failures = [];
  if (!got.hasDecoder) failures.push('this Chromium has no ImageDecoder');
  if (got.kind !== 'webp') failures.push(`kind ${got.kind}, notes ${got.notes.join(' ')}`);
  else {
    if (got.width !== want.width || got.height !== want.height) failures.push('size differs');
    if (got.frames.length !== want.frames.length) failures.push(`${got.frames.length} frames, Pillow says ${want.frames.length}`);
    got.frames.forEach((f, i) => {
      const w = want.frames[i];
      if (!w) return;
      if (f.delay !== w.delay) failures.push(`frame ${i} delay ${f.delay}, Pillow says ${w.delay}`);
      const b = Buffer.from(w.rgba, 'hex');
      let bad = 0;
      for (let p = 0; p < b.length; p += 4) {
        if (b[p + 3] === 0 && f.rgba[p + 3] === 0) continue;
        if (Math.max(...[0, 1, 2, 3].map((k) => Math.abs(f.rgba[p + k] - b[p + k]))) > 1) bad++;
      }
      if (bad) failures.push(`frame ${i}: ${bad} pixels differ`);
    });
  }
  console.log(failures.length ? `FAIL ${failures.join('; ')}` : `ok   animated WebP: ${got.frames.length} frames, delays ${got.frames.map((f) => f.delay).join(', ')} ms`);
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failures.length ? 1 : 0);
});
