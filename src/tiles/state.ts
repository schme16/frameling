// Tile state that isn't part of the document: the tile being painted with, how it is turned, and tile mode.
import { useSyncExternalStore } from 'react';

export interface TileUi {
  /** The tile the tile tools paint with (a tile key), or 0 for none picked yet. */
  brush: number;
  /** TILE_FLIP_* flags the brush paints with. */
  flags: number;
  /** Show the drawing repeated around itself, with edits wrapping across the edges (for seamless tiles). */
  tileMode: boolean;
  /** The Tileset panel's size and grid form is open. */
  sizeForm: boolean;
}

let state: TileUi = { brush: 0, flags: 0, tileMode: false, sizeForm: false };
const listeners = new Set<() => void>();

export function getTileUi(): TileUi {
  return state;
}

export function setTileUi(patch: Partial<TileUi>): void {
  const next = { ...state, ...patch };
  if (next.brush === state.brush && next.flags === state.flags && next.tileMode === state.tileMode && next.sizeForm === state.sizeForm) return;
  state = next;
  for (const fn of listeners) fn();
}

export function subscribeTileUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTileUi<T>(selector: (s: TileUi) => T): T {
  return useSyncExternalStore(subscribeTileUi, () => selector(state));
}

/** True while tile mode is on: pixel edits wrap around the edges of the stage. */
export function tileModeOn(): boolean {
  return state.tileMode;
}

/** A whole-number position wrapped into 0..size-1. */
export function wrap(n: number, size: number): number {
  return ((n % size) + size) % size;
}

/** The grid start handle is shown and grabs clicks only with Alt held or while the grid form is open. */
export function gridHandleOn(alt: boolean, formOpen: boolean): boolean {
  return alt || formOpen;
}
