// A review link (frameling://review?code=...) arriving from outside: the system started Frameling with it, or handed it to the
// copy that is already running. This only keeps the code and tells the drawing window one has come. The window asks the
// person ("Join this review?") and only their answer reaches review:join, so a link can never join anything by itself.
import { ipcMain, type BrowserWindow } from 'electron';
import { codeFromArgs, codeFromLink } from '../share/link';

export interface ReviewLinks {
  /** A link came in (a frameling:// address). True when it was a good review link. */
  fromUrl(url: string): boolean;
  /** The same, for a list of command line arguments. */
  fromArgs(args: string[]): boolean;
  /** The code waiting for the person to be asked about, once. */
  take(): string | null;
}

/**
 * `window` is the drawing window. When it is up and loaded it is brought forward and told (it then asks `take`); when it is
 * not, the code waits for the page to ask on start. Only the last link is kept: a second one replaces the first.
 */
export function makeReviewLinks(o: { window(): BrowserWindow | null }): ReviewLinks {
  let waiting: string | null = null;
  const arrived = (code: string | null): boolean => {
    if (!code) return false;
    waiting = code;
    const w = o.window();
    if (w && !w.isDestroyed()) {
      // A window that is still opening shows itself and asks for the code when its page is up.
      if (!w.webContents.isLoading()) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        w.webContents.send('review:link');
      }
    }
    return true;
  };
  const links: ReviewLinks = {
    fromUrl: (url) => arrived(typeof url === 'string' ? codeFromLink(url) : null),
    fromArgs: (args) => arrived(codeFromArgs(args)),
    take: () => {
      const c = waiting;
      waiting = null;
      return c;
    },
  };
  // Only our own drawing window may ask.
  ipcMain.handle('review:takeLink', (e) => (e.sender === o.window()?.webContents ? links.take() : null));
  return links;
}
