// Tile state that isn't part of the document: the tile being painted with, how it is turned, and tile mode.
import { useSyncExternalStore } from 'react';
import { onFreshDrawing } from '../core/fresh';

export interface TileUi {
  /** The tile the tile tools paint with (a tile key), or 0 for none picked yet. */
  brush: number;
  /** TILE_FLIP_* flags the brush paints with. */
  flags: number;
  /** Show the drawing repeated around itself, with edits wrapping across the edges (for seamless tiles). */
  tileMode: boolean;
  /** The Tileset panel's size and grid form is open. */
  sizeForm: boolean;
  /** The Tileset panel's "add a custom value" form is open. */
  valueForm: boolean;
  /** The terrain the edge buttons in the panel paint with (a terrain id), or 0 for the first one. */
  terrain: number;
  /** What the Collision tool draws next: a box or a many-sided shape. */
  shapeMode: 'box' | 'polygon';
  /** Show every tile's collision shapes over the tile map while painting. */
  showShapes: boolean;
}

let state: TileUi = { brush: 0, flags: 0, tileMode: false, sizeForm: false, valueForm: false, terrain: 0, shapeMode: 'box', showShapes: false };
const listeners = new Set<() => void>();

export function getTileUi(): TileUi {
  return state;
}

export function setTileUi(patch: Partial<TileUi>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(next) as (keyof TileUi)[]).every((k) => next[k] === state[k])) return;
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

// A tile key means something only in its own drawing's tileset. Tile mode is a choice, so it stays.
onFreshDrawing(() => setTileUi({ brush: 0, flags: 0, sizeForm: false, valueForm: false, terrain: 0 }));
