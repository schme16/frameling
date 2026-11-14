// Electron entry used by startup.cjs. Opens either the real built app (dist/main/main.cjs) or a URL (the web build),
// with every window unfocusable, and parked off-screen on a real desktop so nothing pops up while it is measured
// (in xvfb it stays on-screen: nobody sees it, and an off-screen window is never drawn there).
//
//   electron scripts/perf/launch.cjs app            the real app, main process and all
//   electron scripts/perf/launch.cjs url <address>  a plain browser window on that address
const electron = require('electron');
// A speed claim, so the real card (scripts/lib/gpu.cjs). startup.cjs checks beforehand that the card comes up, since
// asking the page here would be part of what is being timed.
require('../lib/gpu.cjs').use(process.env.PERF_SOFTWARE_GL === '1' ? 'software' : 'card');
const path = require('node:path');
const { keepOnScreen } = require('./display.cjs');

// Off-screen on a real desktop; on-screen in a virtual display (see display.cjs).
const onScreen = keepOnScreen();
const Orig = electron.BrowserWindow;
class OffScreen extends Orig {
  constructor(o = {}) {
    super({ ...o, x: onScreen ? 0 : -4000, y: 0, focusable: false, skipTaskbar: true });
    if (o.show !== false) this.showInactive();
    // The real app shows its window on ready-to-show; showInactive keeps it from taking focus.
    this.show = () => this.showInactive();
    if (process.env.STARTUP_TRACE) traceWindow(this, process.env.STARTUP_TRACE);
    if (process.env.STARTUP_PROFILE) profileWindow(this, process.env.STARTUP_PROFILE);
  }
}
// STARTUP_TRACE=file.json records a Chromium trace of the window's first load (read by tracesum.cjs). The recording
// starts before the page is asked to load.
function traceWindow(win, file) {
  const dbg = win.webContents.debugger;
  const events = [];
  if (!dbg.isAttached()) dbg.attach('1.3');
  dbg.on('message', (_e, method, params) => {
    if (method === 'Tracing.dataCollected') events.push(...params.value);
  });
  void dbg.sendCommand('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'blink.user_timing', 'loading', 'disabled-by-default-devtools.timeline'] }, transferMode: 'ReportEvents' });
  setTimeout(() => {
    dbg.on('message', (_e, method) => {
      if (method !== 'Tracing.tracingComplete') return;
      require('node:fs').writeFileSync(file, JSON.stringify(events));
      electron.app.quit();
    });
    void dbg.sendCommand('Tracing.end');
  }, 3000);
}

// STARTUP_PROFILE=file.cpuprofile records a V8 CPU profile of the window's first load (read by startprofile.cjs).
function profileWindow(win, file) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  void dbg.sendCommand('Profiler.enable').then(() => dbg.sendCommand('Profiler.setSamplingInterval', { interval: 50 })).then(() => dbg.sendCommand('Profiler.start'));
  setTimeout(async () => {
    const { profile } = await dbg.sendCommand('Profiler.stop');
    require('node:fs').writeFileSync(file, JSON.stringify(profile));
    electron.app.quit();
  }, 2500);
}

// electron's exports can't be redefined, so the app's require('electron') gets a stand-in with this window class.
const Module = require('node:module');
const patched = new Proxy(electron, { get: (t, k) => (k === 'BrowserWindow' ? OffScreen : t[k]) });
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron' ? patched : load.call(this, request, ...rest);
};

const [mode, url] = process.argv.slice(process.argv.indexOf(__filename) + 1).length
  ? process.argv.slice(process.argv.indexOf(__filename) + 1)
  : process.argv.slice(2);

if (process.env.STARTUP_USER_DATA) electron.app.setPath('userData', process.env.STARTUP_USER_DATA);

if (mode === 'url') {
  electron.app.whenReady().then(() => {
    const win = new OffScreen({ width: 1400, height: 900, show: false, backgroundColor: '#1d1b26' });
    win.once('ready-to-show', () => win.showInactive());
    void win.loadURL(url);
  });
  electron.app.on('window-all-closed', () => electron.app.quit());
} else {
  require(path.join(process.env.PERF_DIST || path.join(__dirname, '../../dist'), 'main/main.cjs'));
}
