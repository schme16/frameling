/**
 * Timeline-only UI state: things the core store has no room for (zoom, the clip picked as the play range, which
 * name box is open). Not part of the document and never undone.
 */
import { useSyncExternalStore } from 'react';
import type { Id } from '../core/format';

export interface TlState {
  /** Width of one frame cell in screen pixels. */
  cw: number;
  /** The clip chosen as the play range. */
  clipId: Id | null;
  /** A name box that is open right now (a new clip or marker, or a layer being renamed). */
  editing: { kind: 'clip' | 'marker' | 'layer'; id: Id } | null;
}

export const MIN_CW = 5;
export const MAX_CW = 64;
export const DEFAULT_CW = 22;

let state: TlState = { cw: DEFAULT_CW, clipId: null, editing: null };
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

export function subscribeTl(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useTl<T>(selector: (s: TlState) => T): T {
  return useSyncExternalStore(subscribeTl, () => selector(state));
}
