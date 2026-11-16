// Electron's half of the Stream control board: a small window for a second screen, linked to the drawing window by a
// message port. It reuses the picture window's rules (popout.ts) for opening, linking and remembering where it was; this
// file only builds the window and says what is different about it.
import { BrowserWindow, MessageChannelMain, screen, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createPopout, readPlace, type Place } from './popout';
import { writeFileAtomic } from './store';

interface Host {
  main(): BrowserWindow | null;
  dataDir(): string;
  /** Where the built pages are (dist/main). */
  dir: string;
}

export const BOARD_SIZE = { width: 1000, height: 780 };
export const BOARD_MIN = { width: 320, height: 380 };

export interface Streamboard {
  /** Opens the board (or brings it forward). `top` keeps it above other windows, such as OBS. */
  open(top: boolean): void;
  close(): void;
  isOpen(): boolean;
  mainReloaded(): void;
  mainClosed(): void;
  /** Brings the drawing window forward (a button on the board opened a setup dialog there). */
  raiseMain(): void;
  /** True when the board is open on a different screen from the drawing window. */
  apart(): boolean;
}

export function makeStreamboard(host: Host): Streamboard {
  const placeFile = path.join(host.dataDir(), 'streamboard-window.json');
  const mainPage = (): WebContents | null => {
    const w = host.main();
    return w && !w.isDestroyed() && !w.webContents.isDestroyed() ? w.webContents : null;
  };
  let top = false;
  let live: BrowserWindow | null = null;

  // Whether the board and the drawing window are on different screens. The drawing window is told when it changes, so the
  // board can be private on a screen the viewers do not see (src/streamboard/privacy.ts).
  const apart = (): boolean => {
    const m = host.main();
    if (!live || live.isDestroyed() || !m || m.isDestroyed()) return false;
    return screen.getDisplayMatching(live.getBounds()).id !== screen.getDisplayMatching(m.getBounds()).id;
  };
  let lastApart: boolean | null = null;
  let tellTimer: ReturnType<typeof setTimeout> | null = null;
  const tellApart = (force = false) => {
    if (tellTimer) clearTimeout(tellTimer);
    tellTimer = setTimeout(() => {
      tellTimer = null;
      const now = apart();
      if (!force && now === lastApart) return;
      lastApart = now;
      mainPage()?.send('streamboard:apart', now);
    }, 150);
  };
  const onMainMove = () => tellApart();
  const watchMain = () => {
    host.main()?.removeListener('move', onMainMove);
    host.main()?.on('move', onMainMove);
  };

  const popout = createPopout({
    defaultSize: BOARD_SIZE,
    create: (bounds, events) => {
      const win = new BrowserWindow({
        ...bounds,
        minWidth: BOARD_MIN.width,
        minHeight: BOARD_MIN.height,
        title: 'Frameling - stream control',
        ...(process.platform === 'darwin' ? {} : { icon: path.join(host.dir, 'icon.png') }),
        backgroundColor: '#17151f',
        show: false,
        autoHideMenuBar: true,
        alwaysOnTop: top,
        // A press on the board counts even when another window (the drawing) has the focus, so one tap does the job.
        acceptFirstMouse: true,
        webPreferences: {
          preload: path.join(host.dir, '../preload/streamboard.cjs'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      live = win;
      lastApart = null;
      watchMain();
      win.on('move', () => tellApart());
      win.once('ready-to-show', () => {
        win.show();
        tellApart(true);
      });
      const wc = win.webContents;
      const note = () => {
        if (win.isDestroyed() || win.isMinimized() || win.isFullScreen() || win.isMaximized()) return;
        const b = win.getNormalBounds();
        events.placed({ x: b.x, y: b.y, width: b.width, height: b.height });
      };
      win.on('moved', note);
      win.on('resized', note);
      win.on('close', note);
      wc.once('did-finish-load', events.loaded);
      wc.on('render-process-gone', (_e, d) => {
        if (d.reason !== 'clean-exit') events.crashed();
      });
      wc.setWindowOpenHandler(({ url }) => {
        if (/^https?:/.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      wc.on('will-navigate', (e) => e.preventDefault());
      win.once('closed', () => {
        if (live === win) live = null;
        events.closed();
        mainPage()?.send('streamboard:apart', false);
      });
      const dev = process.env.FRAMELING_DEV_URL;
      if (dev) void win.loadURL(new URL('streamboard.html', dev).toString());
      else void win.loadFile(path.join(host.dir, '../popout/streamboard.html'));
      return {
        alive: () => !win.isDestroyed(),
        apply: () => {},
        raise: () => {
          if (win.isDestroyed()) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        },
        close: () => {
          if (!win.isDestroyed()) win.close();
        },
        place: () => {
          if (win.isDestroyed()) return null;
          const b = win.getNormalBounds();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        },
        sendPort: (port) => {
          if (!win.isDestroyed() && !wc.isDestroyed()) wc.postMessage('streamboard:port', null, [port as Electron.MessagePortMain]);
        },
      };
    },
    channel: () => {
      const { port1, port2 } = new MessageChannelMain();
      return { a: port1, b: port2 };
    },
    toMain: (port) => {
      mainPage()?.postMessage('streamboard:port', null, [port as Electron.MessagePortMain]);
    },
    tellClosed: () => {
      mainPage()?.send('streamboard:closed');
    },
    loadPlace: () => {
      try {
        return readPlace(JSON.parse(fs.readFileSync(placeFile, 'utf8')));
      } catch {
        return null;
      }
    },
    savePlace: (p: Place) => {
      try {
        writeFileAtomic(placeFile, JSON.stringify(p));
      } catch {
        // Not being able to remember where it was is never worth bothering anyone about.
      }
    },
    screens: () => screen.getAllDisplays().map((d) => d.workArea),
  });

  return {
    open(want) {
      top = want;
      popout.open();
      // An open board follows the choice at once (a new window was made with it already).
      if (live && !live.isDestroyed()) live.setAlwaysOnTop(top, 'floating');
    },
    close: () => popout.close(),
    isOpen: () => popout.isOpen(),
    mainReloaded: () => popout.mainReloaded(),
    mainClosed: () => popout.mainClosed(),
    apart,
    raiseMain() {
      const w = host.main();
      if (!w || w.isDestroyed()) return;
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    },
  };
}
