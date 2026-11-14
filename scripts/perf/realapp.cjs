// The real main process for the perf harnesses that drive one window themselves (run.cjs, brushsize.cjs, palettepic.cjs).
//
// They used to make their own BrowserWindow and answer four channels by hand, so every other channel the page asks for
// at start-up ('app:restore', 'plugins:setDiagnostics', ...) failed, and a new channel could fail the same way unseen.
// Now the app's own main process (dist/main/main.cjs, the one that ships) runs, so it registers every handler itself and
// cannot drift. Only the window is steered: where it sits, whether it takes focus, no background throttling. The user's
// data folder is a temporary one, so a run never reads or writes the person's real recent files, autosave or library.
//
//   const { startRealApp } = require('./realapp.cjs');
//   const win = await startRealApp({ rendererDir, onScreen, hidden });   // the app's window, loaded with the renderer build
//
// An unanswered or failing handler stops the run (see watchIpc below), so it cannot hide in the output.
const electron = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Module = require('node:module');

const root = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Electron reports a handler problem by console.error in the main process and carries on: "No handler registered for
 * 'x'" when nothing answers, "Error occurred in handler for 'x'" when the handler throws. Either one means the harness
 * is not the app, so this ends the run at once with a plain message and a non-zero exit.
 */
function watchIpc(onProblem) {
  const orig = console.error;
  console.error = (...a) => {
    orig.apply(console, a);
    const text = a.map((x) => (x && x.message) || String(x)).join(' ');
    if (/Error occurred in handler for|No handler registered for/.test(text)) onProblem(text);
  };
}

function failOnIpcProblems() {
  let failed = false;
  let closing = false; // a request that lands while the app is shutting down is not a fault in the run
  electron.app.on('before-quit', () => (closing = true));
  watchIpc((text) => {
    if (failed || closing) return;
    failed = true;
    console.error(
      `\nHARNESS IS NOT THE APP: a request from the page was not answered, or failed, in the main process.\n  ${text}\n` +
        'The harness runs the real main process, so this is a real fault (or a channel the page asks for that main never registered). Fix it in src/main, then run again.\n',
    );
    // Give the message a moment to flush, then stop with a failing exit code.
    setTimeout(() => electron.app.exit(2), 50);
    process.exitCode = 2;
  });
}

/**
 * Starts dist/main/main.cjs with the window steered, and resolves with the window once its first load has finished.
 * opts: rendererDir, onScreen (window at its normal place, not parked off-screen), focus (may take focus, default the same as
 * onScreen), hidden (never shown, so it gets no frames), width, height.
 */
async function startRealApp({ rendererDir, onScreen = false, hidden = false, focus = onScreen, width = 1400, height = 900 }) {
  const { app } = electron;
  failOnIpcProblems();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-perf-'));
  app.setPath('userData', path.join(dataDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(rendererDir, 'index.html')).href + '?debug=1&perf=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(dataDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });

  // The app's own window class is swapped for one that parks the window and keeps it from taking focus. Electron's exports
  // cannot be redefined, so the app's require('electron') gets a stand-in (same trick as launch.cjs).
  const Orig = electron.BrowserWindow;
  class Steered extends Orig {
    constructor(o = {}) {
      super({
        ...o,
        width,
        height,
        x: onScreen ? undefined : -4000,
        y: onScreen ? undefined : 0,
        focusable: focus,
        skipTaskbar: !focus,
        paintWhenInitiallyHidden: true,
        show: false,
        webPreferences: { ...(o.webPreferences || {}), backgroundThrottling: false },
      });
      // The real app shows its window on ready-to-show. Parked windows show without taking focus; a hidden run never shows it.
      this.show = () => {
        if (hidden) return;
        focus ? Orig.prototype.show.call(this) : this.showInactive();
      };
    }
  }
  const patched = new Proxy(electron, { get: (t, k) => (k === 'BrowserWindow' ? Steered : t[k]) });
  const load = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'electron' ? patched : load.call(this, request, ...rest);
  };

  // The window is taken from the event: getAllWindows() does not list a window made through the stand-in class.
  let win = null;
  app.once('browser-window-created', (_e, w) => (win = w));
  require(path.join(process.env.PERF_DIST || path.join(root, 'dist'), 'main/main.cjs'));
  await app.whenReady();
  for (let i = 0; i < 100 && !win; i++) await sleep(100);
  if (!win) throw new Error('the real app never made a window');
  // Loaded means finished and stopped: did-finish-load fires while isLoading() is still true, and the GPU check that comes next
  // waits on did-finish-load again if it still sees a load going, so it has to start from a page that has really stopped.
  await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-stop-loading', r) : r()));
  return win;
}

module.exports = { startRealApp, watchIpc };
