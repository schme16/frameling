// The picture window: a second window that shows the drawing big (for a second screen) and follows what happens in the
// drawing window. This file is the desktop side of it: opening, linking the two pages with a message port, remembering
// where the window was, and tidying up in every awkward case (closed, reopened, the drawing window closing or reloading,
// the picture window's page crashing). Electron itself is handed in, so the rules are tested with stand-ins (test/main/popout.test.ts).
import { fitWindow, type WindowPlace } from './restart';

/** Where the window was, to put it back. */
export type Place = Pick<WindowPlace, 'x' | 'y' | 'width' | 'height'> & { fullScreen?: boolean };

export const DEFAULT_SIZE = { width: 960, height: 640 };
export const MIN_SIZE = { width: 320, height: 240 };

/** A saved place read back from the file: only sane numbers survive, anything else is as if there were no file. */
export function readPlace(raw: unknown): Place | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const [x, y, width, height] = [n(r.x), n(r.y), n(r.width), n(r.height)];
  if (x === null || y === null || width === null || height === null) return null;
  if (width < 50 || height < 50 || width > 20000 || height > 20000 || Math.abs(x) > 100000 || Math.abs(y) > 100000) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), ...(r.fullScreen === true ? { fullScreen: true } : {}) };
}

/**
 * The bounds to open with: where it was if most of it is still on a screen (the screen it was on may be unplugged now,
 * which is the whole point of a second-screen window), otherwise just a size and the system picks the spot.
 */
export function openBounds(saved: Place | null, screens: { x: number; y: number; width: number; height: number }[]): { x?: number; y?: number; width: number; height: number } {
  if (!saved) return { ...DEFAULT_SIZE };
  return fitWindow({ ...saved, maximized: false, fullScreen: false }, screens, MIN_SIZE);
}

export interface PopoutWindow {
  alive(): boolean;
  /** Bring it forward: un-minimise, show, focus. */
  raise(): void;
  close(): void;
  /** Where it is now (not counting fullscreen or maximised), null when it can't be read. */
  place(): Place | null;
  /** Hands the page its end of the message port. */
  sendPort(port: unknown): void;
}

export interface WindowEvents {
  /** The page has loaded (it is ready for a port). */
  loaded(): void;
  /** The window is gone, whatever the reason. */
  closed(): void;
  /** The page's process died. */
  crashed(): void;
  /** It moved, was resized, or is about to close: this is where it is. */
  placed(p: Place): void;
}

export interface PopoutDeps {
  create(bounds: ReturnType<typeof openBounds>, events: WindowEvents): PopoutWindow;
  /** A pair of connected message ports. */
  channel(): { a: unknown; b: unknown };
  /** Hands the drawing window its end. */
  toMain(port: unknown): void;
  /** The drawing window should stop sending: the picture window is gone. */
  tellClosed(): void;
  loadPlace(): Place | null;
  savePlace(p: Place): void;
  screens(): { x: number; y: number; width: number; height: number }[];
}

export interface Popout {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** The drawing window's page was reloaded (or is new): it has lost its end of the port, so make a new pair. */
  mainReloaded(): void;
  /** The drawing window is going: take the picture window with it. */
  mainClosed(): void;
}

export function createPopout(d: PopoutDeps): Popout {
  let win: PopoutWindow | null = null;
  let loaded = false;
  let lastPlace: Place | null = null;

  const link = () => {
    if (!win || !win.alive() || !loaded) return;
    const { a, b } = d.channel();
    win.sendPort(b);
    d.toMain(a);
  };

  const gone = (w: PopoutWindow) => {
    // A late event from a window that was already replaced says nothing about the current one.
    if (win !== w) return;
    const at = lastPlace;
    win = null;
    loaded = false;
    if (at) d.savePlace(at);
    d.tellClosed();
  };

  return {
    open() {
      if (win?.alive()) {
        win.raise();
        // The drawing window may have lost its end (a reload): a fresh pair costs nothing and puts it right.
        link();
        return;
      }
      win = null;
      loaded = false;
      const bounds = openBounds(d.loadPlace(), d.screens());
      let self: PopoutWindow | null = null;
      const events: WindowEvents = {
        loaded: () => {
          if (self && win === self) {
            loaded = true;
            link();
          }
        },
        closed: () => {
          if (self) gone(self);
        },
        crashed: () => self?.close(),
        placed: (p) => {
          if (self && win === self) lastPlace = p;
        },
      };
      self = d.create(bounds, events);
      win = self;
      // `placed` keeps this up to date as it moves, so a window closed by quitting (no chance to ask) still comes back in place.
      lastPlace = null;
    },
    close() {
      if (win?.alive()) {
        lastPlace = win.place() ?? lastPlace;
        win.close();
      }
    },
    isOpen: () => !!win?.alive(),
    mainReloaded() {
      link();
    },
    mainClosed() {
      if (win?.alive()) {
        lastPlace = win.place() ?? lastPlace;
        win.close();
      }
    },
  };
}
