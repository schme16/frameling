import './profile';
import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { grantFile, registerIpc } from './ipc';
import { fileFromArgs, fileFromUrl, PROTOCOL } from './library';
import { setupMenu } from './menu';
import { watchDisplay } from './display';
import { clearAutosave, keepAutosave, pruneKept } from './store';
import type { DocumentState } from '../preload/api';
import { isolationWanted, PLUGIN_PROCESS_FEATURE } from './pluginMemory';
import { endRun, markOffered, noteEvent, readLast, startRun } from './crashMarker';
import { PROFILE } from './profileName';

// Plugins share one process (cheap), unless "Measure plugins' memory and speed" was on when Frameling last closed: then
// each sandbox gets a process of its own (about 90 MB each), so its memory can be told apart.
if (isolationWanted(app.getPath('userData'))) app.commandLine.appendSwitch('enable-features', PLUGIN_PROCESS_FEATURE);

// Only one Frameling runs at a time; a second launch focuses the first window and hands it the file, if it has one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Spotting a crash (see crashMarker.ts): a marker written at start and taken away on a proper quit. Only the copy that
// holds the lock does it (a second launch quits straight away and must not touch the first one's marker), and only
// the installed app does (a dev run killed with Ctrl+C is not a crash worth Quill's time).
const watchCrashes = gotLock && (app.isPackaged || process.env.FRAMELING_CRASH_MARKER === '1');
let quitting = false;
const dataDir = () => app.getPath('userData');


let win: BrowserWindow | null = null;
let docState: DocumentState = { dirty: false, name: 'Untitled', filePath: null };
// A file waiting to be opened by the page (given on the command line, or by the system before the window was ready).
let launchFile: string | null = null;
// Set once the person has said it is fine to close, so the question is not asked twice.
let closeApproved = false;
let askingClose = false;
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

function createWindow() {
  closeApproved = false;
  win = new BrowserWindow({
    width: 1400,
    height: 900,
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
  win.once('ready-to-show', () => win?.show());
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

  // Closing with unsaved work asks first: Save, Don't save, or Cancel.
  win.on('close', (e) => {
    if (closeApproved || !docState.dirty) return;
    e.preventDefault();
    if (askingClose) return;
    askingClose = true;
    void (async () => {
      const r = await dialog.showMessageBox(win!, {
        type: 'question',
        message: `Save changes to "${docState.name.slice(0, 80)}"?`,
        detail: `If you don't save, your latest changes will be lost.`,
        buttons: ['Save', `Don't save`, 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (r.response === 0) {
        // The page does the saving (it owns the document), then tells us how it went.
        win?.webContents.send('app:saveBeforeClose');
        return;
      }
      askingClose = false;
      if (r.response === 1) {
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
        closeApproved = true;
        win?.close();
      }
    })();
  });

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
    if (!ok) return;
    closeApproved = true;
    win?.close();
  },
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
  // Whatever a crash left behind is put aside too, so it can still be found after the "Restore it?" question goes away.
  try {
    keepAutosave();
    pruneKept();
  } catch {
    // A tidy-up, nothing more.
  }
  const f = fileFromArgs(process.argv.slice(1));
  if (f) {
    grantFile(f);
    launchFile = f;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// A proper quit clears the marker. Closing the window is not enough (on a Mac the app lives on), and being asked to
// stop by the system (logging out, a shutdown, Ctrl+C) is not a crash either, so those signals quit properly too.
app.on('will-quit', () => {
  quitting = true;
  if (watchCrashes) endRun(dataDir(), process.pid);
});
if (watchCrashes && process.platform !== 'win32') {
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => app.quit());
}
