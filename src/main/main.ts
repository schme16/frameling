import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { grantFile, registerIpc } from './ipc';
import { setupMenu } from './menu';
import { clearAutosave, keepAutosave, pruneKept } from './store';
import type { DocumentState } from '../preload/api';

// Only one Frameling runs at a time; a second launch focuses the first window and hands it the file, if it has one.
if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let docState: DocumentState = { dirty: false, name: 'Untitled', filePath: null };
// A file waiting to be opened by the page (given on the command line, or by the system before the window was ready).
let launchFile: string | null = null;
// Set once the person has said it is fine to close, so the question is not asked twice.
let closeApproved = false;
let askingClose = false;
let keepDone: (() => void) | null = null;

/** The first `.frameling` in a list of command line arguments, as an absolute path. */
function fileFromArgs(args: string[], cwd = process.cwd()): string | null {
  const a = args.find((x) => !x.startsWith('-') && x.toLowerCase().endsWith('.frameling'));
  return a ? path.resolve(cwd, a) : null;
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

app.whenReady().then(() => {
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
