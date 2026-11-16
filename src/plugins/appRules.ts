// What a script or plugin with the `app` power may press and choose. Pure, so the rules can be tested on their own.

/** A command as a script sees it. */
export interface AppCommandInfo {
  id: string;
  label: string;
  category: string;
  description: string;
  keys: string[];
  /** Whether it can run right now (a command that needs a selection says no until there is one). */
  enabled: boolean;
}

/**
 * The parts of the app a script cannot press, because pressing them reaches outside the drawing: files and exports,
 * restarting or updating Frameling, accounts and live shows, reports, other windows, the app's own settings and shortcut
 * sets, Undo and Redo (a run is one Undo step, and taken back whole), other plugins and other scripts (a script pressing a
 * script could never be stopped sensibly). Each entry is an id, or a prefix ending in a dot.
 */
export const NOT_FOR_SCRIPTS: readonly string[] = [
  'file.',
  'app.',
  'plugins.',
  'plugin.',
  'script.',
  'scripts.',
  'audience.',
  'stream',
  'twitch.',
  'votes.',
  'guess.',
  'promptjar.',
  'dares.',
  'review.',
  'popout.',
  'beta.',
  'update.',
  'settings.',
  'help.',
  'perf.',
  'keys.',
  'features.',
  'quests.',
  'pixel.new',
  'view.preferences',
  'view.commandPalette',
  // A run is one step in Undo and is taken back whole if it fails: a script that undoes steps would undo the person's own.
  'edit.undo',
  'edit.redo',
  'history.',
  'golive.',
  'capture.',
  'timelapse.',
];

/** True when a script may press the command with this id. */
export function isRunnable(id: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id)) return false;
  return !NOT_FOR_SCRIPTS.some((p) => (p.endsWith('.') ? id.startsWith(p) : id === p || id.startsWith(p)));
}

/** What a script may choose for the commands to act on. */
export interface AppSet {
  frame?: number;
  layerId?: string;
  selection?: string[];
  color?: string;
  fillColor?: string | null;
}

const MAX_SELECTION = 5000;
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);

/** Keeps the fields we know, and only when they are the right kind of thing. Throws in plain words for one that is not. */
export function cleanAppSet(raw: Record<string, unknown>): AppSet {
  const out: AppSet = {};
  if (raw.frame !== undefined) {
    if (typeof raw.frame !== 'number' || !Number.isFinite(raw.frame) || raw.frame < 0) throw new Error('frame must be a number from 0 up.');
    out.frame = Math.round(raw.frame);
  }
  if (raw.layerId !== undefined) {
    if (typeof raw.layerId !== 'string' || !raw.layerId || raw.layerId.length > 80) throw new Error('layerId must be the id of a layer.');
    out.layerId = raw.layerId;
  }
  if (raw.selection !== undefined) {
    if (!Array.isArray(raw.selection) || raw.selection.length > MAX_SELECTION || !raw.selection.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 80)) throw new Error(`selection must be a list of shape ids (up to ${MAX_SELECTION}).`);
    out.selection = [...new Set(raw.selection as string[])];
  }
  if (raw.color !== undefined) {
    if (!isColor(raw.color)) throw new Error('color must be a colour like "#ffcc00".');
    out.color = raw.color;
  }
  if (raw.fillColor !== undefined) {
    if (raw.fillColor !== null && !isColor(raw.fillColor)) throw new Error('fillColor must be a colour like "#ffcc00", or null for no fill.');
    out.fillColor = raw.fillColor;
  }
  return out;
}
