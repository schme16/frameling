/**
 * Timeline-only UI state: things the core store has no room for (zoom, the clip picked as the play range, which
 * name box is open). Not part of the document and never undone.
 */
import { useSyncExternalStore } from 'react';
import type { Id } from '../core/format';
import { onFreshDrawing } from '../core/fresh';

export interface TlState {
  /** Width of one frame cell in screen pixels. */
  cw: number;
  /** The clip chosen as the play range. */
  clipId: Id | null;
  /** A name box that is open right now (a new clip or marker, a layer or a drawing being renamed). */
  editing: { kind: 'clip' | 'marker' | 'layer' | 'cel'; id: Id } | null;
  /** Layers opened up to show their property rows (detailed timeline). */
  open: ReadonlySet<Id>;
  /** Keys picked on the detailed timeline (see tracks.ts for the ref format). */
  keys: ReadonlySet<string>;
  /** The Drawings panel shows the whole animation instead of the clip you are in. */
  drawingsAll: boolean;
  /** Counts up each time "Find a drawing" is run, so the open panel puts the cursor in its search box. */
  findTick: number;
}

export const MIN_CW = 5;
export const MAX_CW = 64;
export const DEFAULT_CW = 22;

const freshTl = (): TlState => ({ cw: DEFAULT_CW, clipId: null, editing: null, open: new Set(), keys: new Set(), drawingsAll: false, findTick: 0 });
let state: TlState = freshTl();
const listeners = new Set<() => void>();

export function tl(): TlState {
  return state;
}

export function setTl(patch: Partial<TlState>): void {
  const next = { ...state, ...patch };
  next.cw = Math.max(MIN_CW, Math.min(MAX_CW, Math.round(next.cw * 100) / 100));
  state = next;
  for (const fn of listeners) fn();
}

/** Back to a new window's timeline: default zoom, no clip picked, nothing open or selected. */
export function resetTl(): void {
  state = freshTl();
  for (const fn of listeners) fn();
}

/** Opens or folds a layer's property rows. */
export function toggleOpen(id: Id, to?: boolean): void {
  const next = new Set(state.open);
  if (to ?? !next.has(id)) next.add(id);
  else next.delete(id);
  setTl({ open: next });
}

/** Picks keys (replacing the pick, or adding to it). */
export function pickKeys(refs: Iterable<string>, add = false): void {
  const next = new Set(add ? state.keys : []);
  for (const r of refs) next.add(r);
  if (!add && next.size === state.keys.size && [...next].every((r) => state.keys.has(r))) return;
  setTl({ keys: next });
}

export function clearKeys(): void {
  if (state.keys.size) setTl({ keys: new Set() });
}

export function subscribeTl(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useTl<T>(selector: (s: TlState) => T): T {
  return useSyncExternalStore(subscribeTl, () => selector(state));
}

onFreshDrawing(resetTl);
