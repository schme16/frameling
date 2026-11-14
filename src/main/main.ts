import './profile';
import { app, BrowserWindow, dialog, screen, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { grantFile, registerIpc } from './ipc';
import { fileFromArgs, fileFromUrl, PROTOCOL } from './library';
import { setupMenu } from './menu';
import { watchDisplay } from './display';
import { clearAutosave, keepAutosave, pruneKept, writeFileAtomic } from './store';
import type { DocumentState } from '../preload/api';
import { isolationWanted, PLUGIN_PROCESS_FEATURE } from './pluginMemory';
import { endRun, markOffered, noteEvent, readLast, startRun } from './crashMarker';
import { PROFILE } from './profileName';
import { choiceAt, saveChangesQuestion } from '../shared/saveQuestion';
import { closeStep, createCloseAsker, holdClose } from './closeQuestion';
import { addFeatures, applyGpuOff } from './gpu';
import { colourSwitches } from './gpuFlags';
import { createRestarter, fitWindow, readState, relaunchPlan, type RestartState, type WindowPlace } from './restart';

// The colour profile is pinned to sRGB before the engine starts (see gpuFlags.ts for what that means on a wide-gamut screen).
for (const [name, value] of colourSwitches()) value === undefined ? app.commandLine.appendSwitch(name) : app.commandLine.appendSwitch(name, value);

// Plugins share one process (cheap), unless "Measure plugins' memory and speed" was on when Frameling last closed: then
// each sandbox gets a process of its own (about 90 MB each), so its memory can be told apart.
if (isolationWanted(app.getPath('userData'))) addFeatures([PLUGIN_PROCESS_FEATURE]);

// Hardware drawing: off for the gpu-off file or FRAMELING_GPU=off, otherwise asked for by name on Linux (see gpuFlags.ts).
// Read before any window exists.
applyGpuOff();

// Only one Frameling runs at a time; a second launch focuses the first window and hands it the file, if it has one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Spotting a crash (see crashMarker.ts): a marker written at start and taken away on a proper quit. Only the copy that
// holds the lock does it (a second launch quits straight away and must not touch the first one's marker), and only
// the installed app does (a dev run killed with Ctrl+C is not a crash worth Quill's time).
const watchCrashes = gotLock && (app.isPackaged || process.env.FRAMELING_CRASH_MARKER === '1');
let quitting = false;
// Anything that says "restart" (an update, hardware drawing, plugin memory, the command) comes through here: close the
// way closing always does, then open again with the drawing and the window as they were (see restart.ts).
const restartFile = () => path.join(app.getPath('userData'), 'restart.json');
let lastPlace: WindowPlace | null = null;
const restarter = createRestarter({
  plan: () =>
    relaunchPlan({
      platform: process.platform,
      packaged: app.isPackaged,
      appImage: process.env.APPIMAGE ?? '',
      portableFile: process.env.PORTABLE_EXECUTABLE_FILE ?? '',
      exists: (f) => fs.existsSync(f),
    }),
  // Work that is safe in the autosave goes straight away (the close is let through unasked); otherwise it asks first.
  quit: (ask) => {
    if (!ask) closeApproved = true;
    app.quit();
  },
  state: (view): RestartState => {
    const w = win && !win.isDestroyed() && !win.isMinimized() ? win : null;
    if (w) lastPlace = { ...w.getNormalBounds(), maximized: w.isMaximized(), fullScreen: w.isFullScreen() };
    return { at: Date.now(), file: docState.filePath, view, window: lastPlace };
  },
  writeState: (s) => writeFileAtomic(restartFile(), JSON.stringify(s)),
  relaunch: (execPath) => app.relaunch(execPath ? { execPath } : undefined),
});
// What the last restart left for this start, read once and taken away.
let restoring: RestartState | null = null;
const dataDir = () => app.getPath('userData');


let win: BrowserWindow | null = null;
let docState: DocumentState = { dirty: false, name: 'Untitled', filePath: null };
// A file waiting to be opened by the page (given on the command line, or by the system before the window was ready).
let launchFile: string | null = null;
// Set once the person has said it is fine to close, so the question is not asked twice.
let closeApproved = false;
let askingClose = false;
// A quit (Cmd+Q, a shutdown) is what closed the window: once the close is let through, the quit carries on, because
// holding the close stopped it.
let quitRequested = false;
let keepDone: (() => void) | null = null;

// frameling://open?path=... opens a file, so other apps (Interactives' "Edit in Frameling") can hand one over. Only the
// installed app claims it (the macOS app, the Linux .desktop file and the Windows installer register it too, see
// build/installer.nsh), so a dev run never takes it over. The Windows portable build runs from a temporary copy of
// itself, so it registers the .exe the person actually has. A profile copy (the beta one) never claims it, so the
// ordinary copy keeps the links.
if (app.isPackaged && !PROFILE) {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  if (process.platform === 'win32' && portable) app.setAsDefaultProtocolClient(PROTOCOL, portable, []);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}

function openFileInWindow(file: string) {
  grantFile(file);
  if (win && !win.webContents.isLoading()) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('app:openFile', file);
  } else {
    launchFile = file;
  }
}

/** The question has been answered and any saving is done: let the window go, and carry on with the quit that began it. */
function finishClose() {
  closeApproved = true;
  win?.close();
  if (quitRequested) app.quit();
}

// Who asks about unsaved work when the window closes: the page first, the system's own box when it can't.
const questionFor = () => ({ name: docState.name, neverSaved: !docState.filePath });
const closeAsker = createCloseAsker({
  sendToPage: (id) => {
    const wc = win && !win.isDestroyed() ? win.webContents : null;
    if (!wc || wc.isDestroyed() || wc.isCrashed() || wc.isLoading()) return false;
    wc.send('app:closeQuestion', id, questionFor());
    return true;
  },
  withdrawFromPage: (id) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('app:closeQuestionWithdraw', id);
  },
  system: async () => {
    const q = saveChangesQuestion(docState.name, !docState.filePath);
    const opts = { type: 'question' as const, message: q.message, detail: q.detail, buttons: q.buttons, defaultId: 0, cancelId: 2, noLink: true };
    const r = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    return choiceAt(r.response);
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as NodeJS.Timeout),
});

/** Reads the file a restart left (and takes it away, so an ordinary start never finds it). */
function takeRestartState(): RestartState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(restartFile(), 'utf8'));
    return readState(raw);
  } catch {
    return null;
  } finally {
    fs.rmSync(restartFile(), { force: true });
  }
}

function createWindow() {
  closeApproved = false;
  const where = restoring?.window ? fitWindow(restoring.window, screen.getAllDisplays().map((d) => d.workArea)) : null;
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...(where ?? {}),
    minWidth: 800,
    minHeight: 560,
    title: 'Frameling',
    // Quill in the taskbar on Windows and Linux (an AppImage has no installed launcher to take it from).
    ...(process.platform === 'darwin' ? {} : { icon: path.join(__dirname, 'icon.png') }),
    backgroundColor: '#1d1b26',
    show: false,
    // The app draws its own menu bar, so Windows and Linux get no native one.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--frameling-version=${app.getVersion()}`],
    },
  });
  if (restoring?.window?.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (restoring?.window?.fullScreen) win?.setFullScreen(true);
    win?.show();
  });
  // The drawing window dying is a crash even if the app is then closed properly, so it goes in the marker.
  win.webContents.on('render-process-gone', (_e, d) => {
    if (watchCrashes && !quitting && d.reason !== 'clean-exit') noteEvent(dataDir(), process.pid, `The drawing window stopped (${d.reason}, exit code ${d.exitCode}).`);
  });
  // Dragged onto another screen: tell the page, which may offer a better interface size for it.
  const stopWatching = watchDisplay(win, (d) => win?.webContents.send('app:displayChanged', d));
  win.once('closed', stopWatching);

  // Links to the web open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault();
  });

  // Closing with unsaved work is held while the page asks (Quill's dialog): Save, Don't save, or Cancel. The window button
  // and Quit (Ctrl+Q is the page closing its own window; a Mac's Cmd+Q and a system shutdown go through app.quit, which
  // closes the windows too) both end up here, and a close we prevent also stops the quit.
  win.on('close', (e) => {
    // Where the window is now, for a restart to put it back.
    const w = win;
    if (w && !w.isMinimized()) lastPlace = { ...w.getNormalBounds(), maximized: w.isMaximized(), fullScreen: w.isFullScreen() };
    if (!holdClose({ approved: closeApproved, dirty: docState.dirty })) return;
    e.preventDefault();
    if (askingClose) return;
    askingClose = true;
    void (async () => {
      const choice = await closeAsker.ask();
      const step = closeStep(choice);
      if (step === 'save-then-close') {
        // The page does the saving (it owns the document), then tells us how it went.
        win?.webContents.send('app:saveBeforeClose');
        return;
      }
      askingClose = false;
      if (step === 'stay-open') {
        quitRequested = false;
        restarter.cancelled();
        return;
      }
      // "Don't save" still puts a copy aside for a week (Recover unsaved work...). The page makes the copy fresh
      // first, with a thumbnail; if it doesn't answer in a moment the latest autosave is kept instead.
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 3000);
        keepDone = () => {
          clearTimeout(t);
          resolve();
        };
        win?.webContents.send('app:keepUnsaved');
      });
      keepDone = null;
      try {
        keepAutosave();
      } catch {
        // Never stop a close over a safety copy.
      }
      clearAutosave();
      finishClose();
    })();
  });
  // A page that has crashed or hung can't show its dialog: whatever question is open goes to the system box.
  win.webContents.on('render-process-gone', () => closeAsker.pageLost());
  win.on('unresponsive', () => closeAsker.pageLost());

  const devUrl = process.env.FRAMELING_DEV_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => (win = null));
}

registerIpc({
  window: () => win,
  takeLaunchFile: () => {
    const f = launchFile;
    launchFile = null;
    return f;
  },
  setDocumentState: (s) => {
    docState = s;
    if (!win) return;
    // The Mac title bar shows the little dot and the file's icon.
    win.setDocumentEdited(s.dirty);
    win.setRepresentedFilename(s.filePath ?? '');
  },
  keepUnsavedDone: () => keepDone?.(),
  lastCrash: () => readLast(dataDir()),
  crashOffered: () => markOffered(dataDir()),
  saveBeforeCloseDone: (ok) => {
    askingClose = false;
    if (!ok) {
      quitRequested = false;
      restarter.cancelled();
      return;
    }
    finishClose();
  },
  closeQuestionShown: (id) => closeAsker.shown(id),
  closeQuestionAnswer: (id, answer) => closeAsker.answered(id, answer),
  restart: (view, carry) => restarter.request(view, carry),
  takeRestore: () => {
    const r = restoring;
    restoring = null;
    return r ? { file: r.file, view: r.view, carry: r.carry === true } : null;
  },
  finishUpdate: () => app.quit(),
});

app.on('second-instance', (_e, argv, cwd) => {
  const f = fileFromArgs(argv.slice(1), cwd);
  if (f) openFileInWindow(f);
  else if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// macOS hands files over this way (double-click, drop on the dock icon), possibly before the window exists.
app.on('open-file', (e, file) => {
  e.preventDefault();
  openFileInWindow(path.resolve(file));
});

// macOS hands frameling:// links over this way.
app.on('open-url', (e, url) => {
  e.preventDefault();
  const f = fileFromUrl(url);
  if (f) openFileInWindow(f);
});

app.whenReady().then(() => {
  if (watchCrashes) startRun({ dir: dataDir(), pid: process.pid, version: app.getVersion(), platform: `${process.platform} ${process.arch}` });
  setupMenu();
  // A restart left word of what to come back to: the drawing it had open wins over a file on the command line.
  restoring = takeRestartState();
  // Whatever a crash left behind is put aside too, so it can still be found after the "Restore it?" question goes away.
  // Not the work a restart carried across: that is about to be opened, not put aside.
  try {
    if (!restoring?.carry) keepAutosave();
    pruneKept();
  } catch {
    // A tidy-up, nothing more.
  }
  const f = restoring?.file && fs.existsSync(restoring.file) ? restoring.file : fileFromArgs(process.argv.slice(1));
  if (f) {
    grantFile(f);
    // Carried work opens from the autosave (the page does that), not from the saved file.
    if (!restoring?.carry) launchFile = f;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit asks the windows to close, and a window that holds its close (the question above) stops the quit. Remember that
// a quit was wanted so it carries on once the question is answered; Cancel forgets it.
app.on('before-quit', () => {
  quitRequested = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// A proper quit clears the marker. Closing the window is not enough (on a Mac the app lives on), and being asked to
// stop by the system (logging out, a shutdown, Ctrl+C) is not a crash either, so those signals quit properly too.
app.on('will-quit', () => {
  quitting = true;
  restarter.quitting();
  if (watchCrashes) endRun(dataDir(), process.pid);
});
if (watchCrashes && process.platform !== 'win32') {
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => app.quit());
}
