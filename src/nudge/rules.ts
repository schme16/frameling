// When the gentle nudges show and when they stay quiet. All plain functions of what's true right now, so they test
// without a window. The wiring (watching the document, drawing the line, the toast) is in index.ts.
import type { Doc } from '../core/format';

/** A remembered answer for each nudge (Preferences > Behaviour). */
export type NudgeChoice = 'on' | 'off';

/** The Quill nudge after the first drawing is shown this many times at most, and never again once it's answered. */
export const MAX_SHOWS = 3;

/** Tools that draw straight away, so the page can say "the brush is ready". */
export const DRAWING_TOOLS = ['brush', 'pencil'];

/** Whether every drawing is an empty vector one, remembered per drawings object (an edit that leaves them alone keeps the answer). */
const blankDrawings = new WeakMap<object, boolean>();

function allDrawingsBlank(drawings: Doc['drawings']): boolean {
  let blank = blankDrawings.get(drawings);
  if (blank === undefined) {
    blank = true;
    // for...in stops at the first drawing with anything on it, without first copying all of them into an array.
    for (const id in drawings) {
      const d = drawings[id];
      if (d.kind !== 'vector' || d.shapes.length > 0) {
        blank = false;
        break;
      }
    }
    blankDrawings.set(drawings, blank);
  }
  return blank;
}

/** An empty page that is a plain vector drawing: nothing drawn, no pixel or tile layers, no artboards, not inside a symbol. */
export function isFreshVectorPage(doc: Doc): boolean {
  if (doc.artboards?.length || doc.editing?.length || doc.layers.length === 0) return false;
  if (!doc.layers.every((l) => l.kind === 'vector')) return false;
  return allDrawingsBlank(doc.drawings);
}

export interface Mood {
  /** Show Quill in Preferences. Off means no nudges of any kind. */
  quill: boolean;
  /** Pointing at the nudges' own switch (Preferences > Behaviour). */
  choice: NudgeChoice;
  /** The screenshot and test scripts stay out of it unless they ask. */
  harness: boolean;
}

/** Whether nudges are allowed at all right now. */
export const nudgesAllowed = (m: Mood): boolean => m.quill && m.choice === 'on' && !m.harness;

export interface PageLineInput extends Mood {
  /** isFreshVectorPage(doc). */
  fresh: boolean;
  /** This file has already had its first stroke (so undoing back to blank doesn't bring the line back). */
  drawnOn: boolean;
  playing: boolean;
  /** A stroke is being drawn right now: the page line goes as soon as the pen touches down, not when it lifts. */
  stroking: boolean;
}

/** The faint line on the empty page. */
export const pageLineShows = (i: PageLineInput): boolean => nudgesAllowed(i) && i.fresh && !i.drawnOn && !i.playing && !i.stroking;

export interface DrawnInput extends Mood {
  /** The page was empty a moment ago and has something on it now. */
  firstStroke: boolean;
  /** How many times the nudge has been shown on this computer. */
  shown: number;
  /** The animation has more than one frame, so "play it" and "frame 2" mean something. */
  frames: number;
  playing: boolean;
}

/** Quill's line after the first drawing: once per file, a few times at most, and only while it still makes sense. */
export const drawnNudgeShows = (i: DrawnInput): boolean => nudgesAllowed(i) && i.firstStroke && i.shown < MAX_SHOWS && i.frames > 1 && !i.playing;

/** The page names the tool only when it draws straight away. */
export const drawsStraightAway = (toolId: string): boolean => DRAWING_TOOLS.includes(toolId);

/** Ink for the faint line: dark on a light page, light on a dark one. A page with no colour is drawn white. */
export function pageLineInk(background: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(background ?? '');
  if (!m) return 'rgba(40, 36, 56, 0.42)';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.5 ? 'rgba(40, 36, 56, 0.42)' : 'rgba(245, 242, 255, 0.5)';
}
