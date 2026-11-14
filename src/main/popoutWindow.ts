// Electron's half of the picture window: builds the window and the message ports and hands them to the rules in popout.ts.
import { BrowserWindow, MessageChannelMain, screen, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createPopout, readPlace, MIN_SIZE, type Place, type Popout } from './popout';
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
  const placeFile = () => path.join(host.dataDir(), 'popout-window.json');
  const mainPage = (): WebContents | null => {
    const w = host.main();
    return w && !w.isDestroyed() && !w.webContents.isDestroyed() ? w.webContents : null;
  };

  return createPopout({
    create: (bounds, events) => {
      const win = new BrowserWindow({
        ...bounds,
        minWidth: MIN_SIZE.width,
        minHeight: MIN_SIZE.height,
        title: 'Frameling picture',
        ...(process.platform === 'darwin' ? {} : { icon: path.join(host.dir, 'icon.png') }),
        backgroundColor: '#121019',
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
    toMain: (port) => {
      mainPage()?.postMessage('popout:port', null, [port as Electron.MessagePortMain]);
    },
    tellClosed: () => {
      mainPage()?.send('popout:closed');
    },
    loadPlace: () => {
      try {
        return readPlace(JSON.parse(fs.readFileSync(placeFile(), 'utf8')));
      } catch {
        return null;
      }
    },
    savePlace: (p: Place) => {
      try {
        writeFileAtomic(placeFile(), JSON.stringify(p));
      } catch {
        // Not being able to remember where it was is never worth bothering anyone about.
      }
    },
    screens: () => screen.getAllDisplays().map((d) => d.workArea),
  });
}
