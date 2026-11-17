// What is changed on a brush, part by part, and what just changed. A saved brush is a bundle: its tip (and the stick that
// lives inside a chalk or charcoal tip) and everything else (size, pressure, smoothing, pointy ends). Paper is the sheet's,
// not the brush's, so it is never part of "changed". Pure functions, no DOM: the options (PartsOptions.tsx) and the flash
// (flash.ts) read them.
import type { BrushSettings } from '../core/format';
import { tipName } from '../geometry/tip';
import { mediumInfo } from '../dry/maths';
import { paperInfo, type PaperKind } from '../dry/paper';
import { sameBrush } from './model';
import { stickOf } from './stickList';

export type Part = 'brush' | 'tip' | 'stick' | 'paper';

export interface Parts {
  /** Anything is different from how the brush came. */
  changed: boolean;
  /** The tip is another kind, or the same kind with its settings tweaked. */
  tip: boolean;
  /** The stick is another one (or is off, or was off and is on). */
  stick: boolean;
  /** Size, pressure, smoothing or pointy ends are different. */
  other: boolean;
}

export const NONE_CHANGED: Parts = { changed: false, tip: false, stick: false, other: false };

/** Which parts of `live` differ from `was`, the brush as it came. With no `was` (not a saved brush) nothing can be said. */
export function partsOf(was: BrushSettings | undefined, live: BrushSettings): Parts {
  if (!was) return NONE_CHANGED;
  const kind = (was.tip?.kind ?? null) !== (live.tip?.kind ?? null);
  const stick = stickOf(was.tip) !== stickOf(live.tip);
  const other = !sameBrush({ ...live, tip: was.tip }, was);
  const tweaked = !kind && !stick && !sameBrush({ ...was, tip: live.tip }, was);
  return { changed: kind || stick || other || tweaked, tip: kind || tweaked, stick, other };
}

/** The brush with its tip, and the stick that lives in it, put back as it came. */
export function withTipOf(live: BrushSettings, was: BrushSettings): BrushSettings {
  const { tip: _t, ...rest } = live;
  return was.tip ? { ...rest, tip: { ...was.tip } } : rest;
}

/** The brush with only its stick put back as it came. A tip with no stick to put back is left alone. */
export function withStickOf(live: BrushSettings, was: BrushSettings): BrushSettings {
  const t = live.tip;
  if (!t || (t.kind !== 'chalk' && t.kind !== 'charcoal')) return live;
  const { dry: _d, ...rest } = t;
  const dry = was.tip?.dry;
  return { ...live, tip: dry ? { ...rest, dry } : rest };
}

// ---------------------------------------------------------------- what just changed (the flash)

/** What the flash needs to know about the moment before and after. */
export interface Moment {
  /** The saved brush that is picked, if one is. */
  id: string | null;
  name: string;
  brush: BrushSettings;
  paper: PaperKind;
}

export interface Flash {
  /** The parts that lit up. A tip that brings its own stick along lights both. */
  parts: Part[];
  /** What the tag on the preview says: "Tip: Chalk", "Tip: Chalk, Stick: Chalk". */
  text: string;
}

const stickName = (b: BrushSettings): string => {
  const s = stickOf(b.tip);
  return s ? mediumInfo(s).label : 'off';
};

/** What to flash for a move from one moment to the next, or null when nothing worth naming changed (a slider is not). */
export function flashFor(a: Moment, b: Moment): Flash | null {
  if (a.id !== b.id) return { parts: ['brush'], text: `Brush: ${b.id ? b.name : 'Custom'}` };
  if ((a.brush.tip?.kind ?? null) !== (b.brush.tip?.kind ?? null)) {
    // Another tip can bring another stick with it: say so, so it never changes quietly.
    const had = stickOf(a.brush.tip);
    const has = stickOf(b.brush.tip);
    if (has && had !== has) return { parts: ['tip', 'stick'], text: `Tip: ${tipName(b.brush.tip)}, Stick: ${stickName(b.brush)}` };
    return { parts: ['tip'], text: `Tip: ${tipName(b.brush.tip)}` };
  }
  if (stickOf(a.brush.tip) !== stickOf(b.brush.tip)) return { parts: ['stick'], text: `Stick: ${stickName(b.brush)}` };
  if (a.paper !== b.paper) return { parts: ['paper'], text: `Paper: ${paperInfo(b.paper).label}` };
  return null;
}

// ---------------------------------------------------------------- remembering which brush was picked

/** The picked brush saved from last time, if it is still in the library. Anything unreadable is nothing. */
export function readPicked(raw: unknown, ids: readonly string[]): string | null {
  return typeof raw === 'string' && ids.includes(raw) ? raw : null;
}
