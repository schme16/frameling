// Restarting Frameling: close it the way closing always does (the same question about unsaved work), then open it again
// with the drawing, the frame and the window as they were. One path for everything that says "restart": the update's
// Restart now, the hardware drawing switch, the plugin memory switch and the command. No Electron in here, the pieces
// it needs are handed in, so the order (ask, save, then relaunch) and the "cannot relaunch" case can be tested.

export interface RelaunchFacts {
  platform: string;
  /** A built app, not `npm run dev` or `npm start`. */
  packaged: boolean;
  /** The AppImage's own path (the APPIMAGE variable), when this copy was started from one. */
  appImage: string;
  /** The Windows portable build's own path (PORTABLE_EXECUTABLE_FILE): it runs from a temporary copy of itself. */
  portableFile: string;
  /** Whether a file is there (injected, so tests need no disk). */
  exists: (file: string) => boolean;
}

export type RelaunchPlan = { ok: true; execPath: string | null } | { ok: false; message: string };

/**
 * What to open again. An AppImage runs from a temporary mount that goes away when it quits, so it has to be opened by
 * its own file (which an update has just replaced, so the new version is what comes back). A portable Windows build
 * the same. Where that file is gone, or this is a system that can't be relaunched, it says so in plain words.
 */
export function relaunchPlan(f: RelaunchFacts): RelaunchPlan {
  if (f.platform === 'linux' && f.packaged && f.appImage) {
    if (!f.exists(f.appImage)) return { ok: false, message: "Frameling can't find its own file to open it again, so it can't restart itself. Close it and start it again yourself." };
    return { ok: true, execPath: f.appImage };
  }
  if (f.platform === 'win32' && f.packaged && f.portableFile) {
    if (!f.exists(f.portableFile)) return { ok: false, message: "Frameling can't find its own file to open it again, so it can't restart itself. Close it and start it again yourself." };
    return { ok: true, execPath: f.portableFile };
  }
  return { ok: true, execPath: null };
}

/** Where the window was, to put it back. */
export interface WindowPlace {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullScreen: boolean;
}

/** Where the person was in the drawing, as the page saw it just before. Every field is optional: what is missing is left alone. */
export interface RestartView {
  frame?: number;
  layerId?: string;
  zoom?: number;
  panX?: number;
  panY?: number;
}

/** Everything handed from the copy that quits to the copy that starts. */
export interface RestartState {
  /** When it was written, so an old leftover is never mistaken for a restart. */
  at: number;
  /** The drawing that was open (saved, or as far as it was saved), or null for an untitled one. */
  file: string | null;
  view: RestartView;
  window: WindowPlace | null;
}

/** A state file older than this is a leftover from a restart that never came back, and is ignored. */
export const STATE_MAX_AGE_MS = 5 * 60_000;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Keeps what is a sensible number or name, drops the rest. */
export function cleanView(raw: unknown): RestartView {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const view: RestartView = {};
  const frame = num(v.frame);
  if (frame !== undefined && frame >= 0) view.frame = Math.floor(frame);
  if (typeof v.layerId === 'string' && v.layerId.length < 200) view.layerId = v.layerId;
  const zoom = num(v.zoom);
  if (zoom !== undefined && zoom > 0 && zoom < 1000) view.zoom = zoom;
  const px = num(v.panX);
  const py = num(v.panY);
  if (px !== undefined && py !== undefined) {
    view.panX = px;
    view.panY = py;
  }
  return view;
}

/** Reads what a state file holds, dropping anything that isn't the right shape. Null when it is old, or isn't a state at all. */
export function readState(raw: unknown, now = Date.now()): RestartState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const at = num(o.at);
  if (at === undefined || now - at > STATE_MAX_AGE_MS || at - now > 60_000) return null;
  const view = cleanView(o.view);
  const w = (o.window && typeof o.window === 'object' ? o.window : null) as Record<string, unknown> | null;
  const place = w && [w.x, w.y, w.width, w.height].every((n) => num(n) !== undefined) && (w.width as number) > 0 && (w.height as number) > 0
    ? { x: w.x as number, y: w.y as number, width: w.width as number, height: w.height as number, maximized: w.maximized === true, fullScreen: w.fullScreen === true }
    : null;
  return { at, file: typeof o.file === 'string' && o.file ? o.file : null, view, window: place };
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounds to open the window with: where it was, as long as most of it is still on a screen (a screen may have been
 * unplugged since). Otherwise just the size, and the system picks the spot.
 */
export function fitWindow(place: WindowPlace, screens: Area[], min = { width: 800, height: 560 }): { x?: number; y?: number; width: number; height: number } {
  const width = Math.max(min.width, Math.round(place.width));
  const height = Math.max(min.height, Math.round(place.height));
  const seen = screens.some((s) => {
    const w = Math.min(place.x + width, s.x + s.width) - Math.max(place.x, s.x);
    const h = Math.min(place.y + height, s.y + s.height) - Math.max(place.y, s.y);
    return w > width / 2 && h > height / 2;
  });
  return seen ? { x: Math.round(place.x), y: Math.round(place.y), width, height } : { width, height };
}

export interface RestartDeps {
  plan(): RelaunchPlan;
  /** Starts quitting: the window closes the way the close button closes it (the question about unsaved work, then the quit). */
  quit(): void;
  /** What is open and where the window is, read as late as possible (after the work was saved). */
  state(view: RestartView): RestartState;
  writeState(state: RestartState): void;
  relaunch(execPath: string | null): void;
}

export type RestartAnswer = { ok: true } | { ok: false; message: string };

/** Remembers that a restart was asked for, and does the relaunch only when the app really is quitting. */
export function createRestarter(deps: RestartDeps) {
  let wanted = false;
  let view: RestartView = {};
  return {
    /** Asks for a restart. Says no, in plain words, when this copy can't open itself again (and then closes nothing). */
    request(v: RestartView = {}): RestartAnswer {
      const plan = deps.plan();
      if (!plan.ok) return { ok: false, message: plan.message };
      wanted = true;
      view = v;
      deps.quit();
      return { ok: true };
    },
    /** The question was answered Cancel, or the save did not work: the restart is off, and a later close is only a close. */
    cancelled(): void {
      wanted = false;
    },
    /** The app is quitting for real, and the work is safe. Writes what to come back to, then opens the new copy. */
    quitting(): void {
      if (!wanted) return;
      wanted = false;
      const plan = deps.plan();
      if (!plan.ok) return;
      try {
        deps.writeState(deps.state(view));
      } catch {
        // Coming back without the exact spot is better than not coming back.
      }
      deps.relaunch(plan.execPath);
    },
    get wanted(): boolean {
      return wanted;
    },
  };
}
