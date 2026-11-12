// Electron entry used by startup.cjs. Opens either the real built app (dist/main/main.cjs) or a URL (the web build),
// with every window unfocusable, and parked off-screen on a real desktop so nothing pops up while it is measured
// (in xvfb it stays on-screen: nobody sees it, and an off-screen window is never drawn there).
//
//   electron scripts/perf/launch.cjs app            the real app, main process and all
//   electron scripts/perf/launch.cjs url <address>  a plain browser window on that address
const electron = require('electron');
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
  }
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
  require(path.join(__dirname, '../../dist/main/main.cjs'));
}
