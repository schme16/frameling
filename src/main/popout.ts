// The picture window: a second window that shows the drawing big (for a second screen) and follows what happens in the
// drawing window. This file is the desktop side of it: opening, linking the two pages with a message port, remembering
// where the window was, and tidying up in every awkward case (closed, reopened, the drawing window closing or reloading,
// the picture window's page crashing). Electron itself is handed in, so the rules are tested with stand-ins (test/main/popout.test.ts).
import { fitWindow, type WindowPlace } from './restart';
import { SECOND_WINDOW, sameOpen, windowUnits, type OpenOpts } from '../popout/capture';

export { readOpen, type OpenOpts } from '../popout/capture';

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

/** The bounds to open a capture view with a fixed size: the same place, the size in real pixels turned into window units for the screen it is on. */
export function fixedBounds(b: ReturnType<typeof openBounds>, size: { width: number; height: number }, scale: number): ReturnType<typeof openBounds> {
  return { ...b, ...windowUnits(size, scale) };
}

export interface PopoutWindow {
  alive(): boolean;
  /** Capture view only: the size has changed (fixed, or free again). Nothing else about an open window changes. */
  apply(o: OpenOpts): void;
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
  create(bounds: ReturnType<typeof openBounds>, events: WindowEvents, opts: OpenOpts): PopoutWindow;
  /** A pair of connected message ports. */
  channel(): { a: unknown; b: unknown };
  /** Hands the drawing window its end, and says which kind of window it is linked to (the capture view tells no one the drawing's name). */
  toMain(port: unknown, capture: boolean): void;
  /** The drawing window should stop sending: the picture window is gone. */
  tellClosed(): void;
  /** The capture view remembers its own place, apart from the second window's. */
  loadPlace(capture: boolean): Place | null;
  savePlace(p: Place, capture: boolean): void;
  screens(): { x: number; y: number; width: number; height: number }[];
}

export interface Popout {
  /** Opens the window (the plain second window unless the capture view is asked for), or brings it forward. Asking for the other kind swaps the window; asking for another size resizes the capture view. */
  open(o?: OpenOpts): void;
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
  let current: OpenOpts = SECOND_WINDOW;

  const link = () => {
    if (!win || !win.alive() || !loaded) return;
    const { a, b } = d.channel();
    win.sendPort(b);
    d.toMain(a, current.capture);
  };

  const gone = (w: PopoutWindow) => {
    // A late event from a window that was already replaced says nothing about the current one.
    if (win !== w) return;
    const at = lastPlace;
    win = null;
    loaded = false;
    if (at) d.savePlace(at, current.capture);
    d.tellClosed();
  };

  return {
    open(o = SECOND_WINDOW) {
      if (win?.alive()) {
        if (o.capture === current.capture) {
          if (!sameOpen(o, current)) {
            current = o;
            win.apply(o);
          } else current = o;
          win.raise();
          // The drawing window may have lost its end (a reload): a fresh pair costs nothing and puts it right.
          link();
          return;
        }
        // The other kind of window: a window cannot gain or lose its frame, so this one goes and a new one comes. The late
        // events of the old one are ignored (`gone` only listens to the current window).
        const old = win;
        const at = old.place() ?? lastPlace;
        if (at) d.savePlace(at, current.capture);
        win = null;
        loaded = false;
        old.close();
      }
      win = null;
      loaded = false;
      current = o;
      const bounds = openBounds(d.loadPlace(o.capture), d.screens());
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
      self = d.create(bounds, events, o);
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
