// End-to-end check of Aseprite files in the real app (real main process, throwaway profile): files are read through the
// same path a double-click or File > Open takes (`openPath`), open as a new drawing, can be added to the open one, and
// every file given opens without a page error. With no files it uses the sample in scripts/docs/help/assets.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/aseprite.cjs [file.aseprite ...]
//
// Exits non-zero when anything fails. Files are only read.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const files = process.argv.slice(2).filter((a) => /\.(aseprite|ase)$/i.test(a));
if (!files.length) files.push(path.join(root, 'scripts/docs/help/assets/slime-bounce.aseprite'));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ase-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const failures = [];
const pageErrors = [];

async function main() {
  app.setPath('userData', path.join(out, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(out, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.on('show', () => w.hide()));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message', (e) => {
    if ((e.level ?? e.severity) === 'error' || (e.level ?? e.severity) === 3) pageErrors.push(String(e.message ?? e));
  });
  for (let i = 0; i < 200 && !(await ev('!!(window.__framelingIo && window.__frameling && window.__framelingAseprite)').catch(() => false)); i++) await sleep(100);

  for (const f of files) {
    await ev(`__frameling.store().setUi({ dirty: false })`);
    const ok = await ev(`window.__framelingIo.openPath(${JSON.stringify(f)})`);
    const d = await ev(`(() => { const d = __frameling.store().get().doc; const u = __frameling.store().get().ui; return { layers: d.layers.length, length: d.length, fps: d.fps, w: d.width, h: d.height, clips: d.clips.length, dirty: u.dirty, path: u.filePath, ext: !!d.ext && !!d.ext.aseprite }; })()`);
    if (!ok) failures.push(`${f}: openPath said no`);
    else if (!d.ext || d.path !== null || !d.dirty || d.layers < 1) failures.push(`${f}: unexpected state ${JSON.stringify(d)}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${path.basename(f)}: ${JSON.stringify(d)}`);
  }

  // Adding to the open drawing is one undo step and keeps the drawing's own rate.
  const before = await ev(`(() => { const d = __frameling.store().get().doc; return { layers: d.layers.length, fps: d.fps }; })()`);
  const bytes = JSON.stringify(Array.from(fs.readFileSync(files[0])));
  const added = await ev(`__framelingAseprite.add(${bytes}, 'again.aseprite')`);
  const after = await ev(`(() => { const s = __frameling.store(); const d = s.get().doc; return { layers: d.layers.length, fps: d.fps, undo: s.undoLabel() }; })()`);
  if (!added || after.layers <= before.layers || after.fps !== before.fps || !/^Add Aseprite file/.test(after.undo || '')) failures.push(`add: ${JSON.stringify({ added, before, after })}`);
  await ev(`__frameling.store().undo()`);
  const undone = await ev(`__frameling.store().get().doc.layers.length`);
  if (undone !== before.layers) failures.push(`undo left ${undone} layers, expected ${before.layers}`);
  console.log(`add ok: ${before.layers} layers -> ${after.layers} -> undo ${undone}`);

  if (pageErrors.length) failures.push(`page errors: ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`);
  fs.rmSync(out, { recursive: true, force: true });
  console.log(failures.length ? `FAILED\n${failures.join('\n')}` : `all good (${files.length} file${files.length === 1 ? '' : 's'})`);
  app.exit(failures.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
