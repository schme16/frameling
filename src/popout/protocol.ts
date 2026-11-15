// What the drawing window tells the second window (the picture window), and what it can say back. Plain data only, so it
// crosses a message port as it is. The logic on each side is in mirror.ts (the sender) and replica.ts (the receiver).
import type { Patch } from 'immer';
import type { Doc, Drawing, Id, Shape } from '../core/format';
import type { CaptureLook } from './capture';

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
  /** The drawing's name, for the window title. Empty in the capture view: the name is never sent there. */
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
  /** Set when the window is the capture view: how it looks. Missing or null for the plain second window. */
  capture?: CaptureLook | null;
}

/** A layer showing something other than its saved drawing: a move or an erase half done. */
export interface LiveDrawing {
  layerId: Id;
  drawing: Drawing;
}

/**
 * A piece of a pixel layer being painted on. The second window keeps a canvas the size of the layer's grid: `start` makes it
 * anew (seeded from the layer's saved drawing when `base` is true, empty otherwise), and the pixels (RGBA, `w` x `h`) go
 * on it at (`x`, `y`) of the grid, replacing what was there.
 */
export interface PixelPatch {
  layerId: Id;
  /** The grid the canvas covers, in art pixels. */
  width: number;
  height: number;
  start: boolean;
  base: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export type ToPopout =
  /** The whole drawing (first message, a new or opened file, and anything that could not be sent as patches). */
  | { t: 'doc'; seq: number; doc: Doc }
  /** What changed since the last message, as patches. `seq` is one more than the one before, or the receiver asks again. */
  | { t: 'patch'; seq: number; patches: Patch[] }
  | { t: 'look'; look: Look }
  /** What the pen is drawing right now (null when it ends: the finished shape arrives as a patch). Several shapes when mirror drawing is on. */
  | { t: 'ink'; ink: Shape | readonly Shape[] | null }
  /** Pixels painted so far on a pixel layer, as a piece to put on the second window's own copy (null when that ends). */
  | { t: 'pixels'; patch: PixelPatch | null }
  | { t: 'live'; live: LiveDrawing | null };

export type FromPopout =
  /** Ready, or out of step: send the whole drawing again. */
  | { t: 'hello' };

export const isToPopout = (m: unknown): m is ToPopout => typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';
