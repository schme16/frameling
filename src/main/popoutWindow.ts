// Electron's half of the picture window: builds the window and the message ports and hands them to the rules in popout.ts.
import { BrowserWindow, MessageChannelMain, screen, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createPopout, fixedBounds, readPlace, MIN_SIZE, type Place, type Popout } from './popout';
import { CAPTURE_TITLE } from '../popout/capture';
import { writeFileAtomic } from './store';

interface Host {
  /** The drawing window, if there is one. */
  main(): BrowserWindow | null;
  /** The app's data folder (the window's place is kept there). */
  dataDir(): string;
  /** Where the built pages are (dist/main). */
  dir: string;
}

export function makePopout(host: Host): Popout {
  const placeFile = (capture: boolean) => path.join(host.dataDir(), capture ? 'popout-capture-window.json' : 'popout-window.json');
  const mainPage = (): WebContents | null => {
    const w = host.main();
    return w && !w.isDestroyed() && !w.webContents.isDestroyed() ? w.webContents : null;
  };

  return createPopout({
    create: (bounds, events, opts) => {
      const scaleAt = (b: { x?: number; y?: number; width: number; height: number }) =>
        (b.x === undefined || b.y === undefined ? screen.getPrimaryDisplay() : screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height })).scaleFactor;
      const open = opts.capture && opts.size ? fixedBounds(bounds, opts.size, scaleAt(bounds)) : bounds;
      const win = new BrowserWindow({
        ...open,
        minWidth: MIN_SIZE.width,
        minHeight: MIN_SIZE.height,
        // The capture view has no title bar and a name that says nothing about the drawing.
        title: opts.capture ? CAPTURE_TITLE : 'Frameling picture',
        ...(opts.capture ? { frame: false, useContentSize: true, resizable: !opts.size, hasShadow: false } : {}),
        ...(process.platform === 'darwin' ? {} : { icon: path.join(host.dir, 'icon.png') }),
        backgroundColor: opts.capture ? opts.background : '#121019',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          // Its own small preload: it can receive the port and nothing else (the page never gets the app's file and desktop calls).
          preload: path.join(host.dir, '../preload/popout.cjs'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });
      win.once('ready-to-show', () => win.show());
      const wc = win.webContents;
      // The page may not rename the capture view (it never has the drawing's name, but nothing should be able to give it one).
      if (opts.capture) win.on('page-title-updated', (e) => e.preventDefault());
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
      win.once('closed', events.closed);
      const dev = process.env.FRAMELING_DEV_URL;
      if (dev) void win.loadURL(new URL('popout.html', dev).toString());
      else void win.loadFile(path.join(host.dir, '../popout/popout.html'));
      return {
        alive: () => !win.isDestroyed(),
        apply: (o) => {
          if (win.isDestroyed()) return;
          // Frees it first so the new size sticks, then locks it again when the size is fixed.
          win.setResizable(true);
          if (o.size) {
            const b = win.getBounds();
            const u = fixedBounds({ width: b.width, height: b.height }, o.size, scaleAt(b));
            win.setContentSize(u.width, u.height);
            win.setResizable(false);
          }
        },
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
          if (!win.isDestroyed() && !wc.isDestroyed()) wc.postMessage('popout:port', null, [port as Electron.MessagePortMain]);
        },
      };
    },
    channel: () => {
      const { port1, port2 } = new MessageChannelMain();
      return { a: port1, b: port2 };
    },
    toMain: (port, capture) => {
      // The kind first, so the drawing window knows it by the time the port arrives.
      mainPage()?.send('popout:mode', capture ? 'capture' : 'second');
      mainPage()?.postMessage('popout:port', null, [port as Electron.MessagePortMain]);
    },
    tellClosed: () => {
      mainPage()?.send('popout:closed');
    },
    loadPlace: (capture) => {
      try {
        return readPlace(JSON.parse(fs.readFileSync(placeFile(capture), 'utf8')));
      } catch {
        return null;
      }
    },
    savePlace: (p: Place, capture: boolean) => {
      try {
        writeFileAtomic(placeFile(capture), JSON.stringify(p));
      } catch {
        // Not being able to remember where it was is never worth bothering anyone about.
      }
    },
    screens: () => screen.getAllDisplays().map((d) => d.workArea),
  });
}
