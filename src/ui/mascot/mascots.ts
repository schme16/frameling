// Which mascots the app has, and which one is current. The app asks here instead of reaching for Quill, so a second
// mascot is a new entry in mascots.json (and a drawn source file) rather than a hunt through the code.
//
// A mascot is: a sprite sheet and its json that keep the clip contract (CLIPS in timing.ts), his words (the lines
// shared by every mascot unless he brings his own), and, if he has them, the pencils the pet recolours. The app icon
// and logo are the app's own, not the mascot's: they stay Quill's whoever is showing.
import data from './mascots.json';
import { getPrefs } from '../prefs';
import type { LineEntry, LineId } from './lines';

export interface Pencil {
  bright: string;
  shade: string;
}

export interface Mascot {
  id: string;
  /** What people see: "Quill". */
  name: string;
  /** One friendly sentence about him, for the picker. */
  blurb: string;
  /** Where the sheet image and its frame list are, relative to the page. */
  sheetUrl: string;
  metaUrl: string;
  /** The coloured parts the pet repaints with your colours. A mascot without any is never repainted. */
  pencils?: Pencil[];
  /** Words he says differently. Any line he doesn't have falls back to the standard one (Quill's, in lines.json). */
  lines?: Partial<Record<LineId, LineEntry>>;
}

interface Row {
  id: string;
  name: string;
  blurb: string;
  sheet: string;
  meta: string;
  pencils?: Pencil[];
}

const fromRow = (r: Row): Mascot => ({ id: r.id, name: r.name, blurb: r.blurb, sheetUrl: r.sheet, metaUrl: r.meta, pencils: r.pencils });

/** The standard mascot: who you get with nothing chosen, and who anything unknown falls back to. */
export const DEFAULT_MASCOT: string = data.default;

const all = new Map<string, Mascot>();
for (const r of data.mascots as Row[]) all.set(r.id, fromRow(r));

/** Every mascot, standard one first. */
export const mascots = (): Mascot[] => [...all.values()];

/** True when there is a real choice to make. With one mascot nothing is offered. */
export const hasChoice = (): boolean => all.size > 1;

/** A mascot by id. An unknown or missing id gives the standard one, so a damaged setting never leaves no mascot. */
export function getMascot(id?: string | null): Mascot {
  return (id ? all.get(id) : undefined) ?? all.get(DEFAULT_MASCOT) ?? [...all.values()][0];
}

/** True for an id that names a mascot the app has. */
export const isMascotId = (id: unknown): id is string => typeof id === 'string' && all.has(id);

/** Adds (or replaces) a mascot. For tests and, later, mascots that arrive some other way than the manifest. */
export function registerMascot(m: Mascot): () => void {
  const before = all.get(m.id);
  all.set(m.id, m);
  return () => {
    if (before) all.set(m.id, before);
    else all.delete(m.id);
  };
}

/** The mascot showing now: the saved choice, or the standard one. */
export const currentMascot = (): Mascot => getMascot(getPrefs().mascot);
