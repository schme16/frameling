// What the drawing window tells the second window (the picture window), and what it can say back. Plain data only, so it
// crosses a message port as it is. The logic on each side is in mirror.ts (the sender) and replica.ts (the receiver).
import type { Patch } from 'immer';
import type { Doc, Drawing, Id, StrokeShape } from '../core/format';

/** The few theme colours the picture window wears, so it matches the drawing window in dark and light. */
export interface PopoutTheme {
  dark: boolean;
  bg: string;
  text: string;
  muted: string;
  accent: string;
  raised: string;
}

/** Everything about what to show that is not the drawing itself. Small, so it is sent whenever any part of it changes. */
export interface Look {
  /** The drawing's name, for the window title. */
  name: string;
  /** The playhead in the drawing window (inside a symbol this is the symbol's own frame; see `shownFrame`). */
  frame: number;
  playing: boolean;
  /** The layer being drawn on, so a stroke in progress goes where it will land. */
  activeLayerId: Id | null;
  /** Look through the camera (what an export would show) instead of at the whole page. */
  camera: boolean;
  /** Draw the marks over the picture (they are only ever shown while paused and not looking through the camera). */
  marks: boolean;
  theme: PopoutTheme;
}

/** A layer showing something other than its saved drawing: a move or an erase half done. */
export interface LiveDrawing {
  layerId: Id;
  drawing: Drawing;
}

export type ToPopout =
  /** The whole drawing (first message, a new or opened file, and anything that could not be sent as patches). */
  | { t: 'doc'; seq: number; doc: Doc }
  /** What changed since the last message, as patches. `seq` is one more than the one before, or the receiver asks again. */
  | { t: 'patch'; seq: number; patches: Patch[] }
  | { t: 'look'; look: Look }
  /** The stroke the pen is drawing right now (null when it ends: the finished stroke arrives as a patch). */
  | { t: 'ink'; ink: StrokeShape | null }
  | { t: 'live'; live: LiveDrawing | null };

export type FromPopout =
  /** Ready, or out of step: send the whole drawing again. */
  | { t: 'hello' };

export const isToPopout = (m: unknown): m is ToPopout => typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';
