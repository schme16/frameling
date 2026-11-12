// Little bits of view state that aren't part of the document or the shared UI state.
import { useSyncExternalStore } from 'react';
import { defaultPicks, sanitizePicks, type SnapPicks } from './snapModel';

interface ViewSettings {
  /** Show the pixel grid on pixel layers when zoomed in far enough. */
  pixelGrid: boolean;
  /** Look through the camera (when the document has one) instead of at the whole stage. */
  throughCamera: boolean;
  /** Look through the camera while playing, even when not looking through it otherwise. */
  cameraWhilePlaying: boolean;
  /** Rulers along the top and left of the canvas. */
  rulers: boolean;
  /** Show the document's guide lines. */
  guides: boolean;
  /** The master switch for snapping (View > Snapping). */
  snap: boolean;
  /** Which things snap to what, for vector layers, pixel layers and artboards (see snapModel.ts). */
  snapPicks: SnapPicks;
  /** Guides can't be moved or added (they still show and snap). */
  lockGuides: boolean;
  /** On a frame with nothing drawn, show the last drawing faintly (the empty frame ghost). */
  emptyGhost: boolean;
  /** A grid over the page: squares, isometric diamonds, or none. */
  grid: 'off' | 'square' | 'iso';
  /** Grid spacing in stage pixels (an isometric diamond's width). */
  gridSize: number;
  /** Isometric slope: 2:1 (pixel art, 26.6 degrees) or true isometric (30 degrees). */
  isoStyle: '2:1' | '30';
  /** Show the document's perspective guides. */
  perspective: boolean;
}

const KEY = 'frameling.view';
let state: ViewSettings = { pixelGrid: true, throughCamera: false, cameraWhilePlaying: true, rulers: false, guides: true, snap: true, snapPicks: defaultPicks(), lockGuides: false, emptyGhost: true, grid: 'off', gridSize: 32, isoStyle: '2:1', perspective: true };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.pixelGrid === 'boolean') state = { ...state, pixelGrid: saved.pixelGrid };
    if (saved && typeof saved.throughCamera === 'boolean') state = { ...state, throughCamera: saved.throughCamera };
    if (saved && typeof saved.cameraWhilePlaying === 'boolean') state = { ...state, cameraWhilePlaying: saved.cameraWhilePlaying };
    for (const k of ['rulers', 'guides', 'snap', 'lockGuides', 'emptyGhost'] as const) if (saved && typeof saved[k] === 'boolean') state = { ...state, [k]: saved[k] };
    if (saved && saved.snapPicks) state = { ...state, snapPicks: sanitizePicks(saved.snapPicks) };
    if (saved && (saved.grid === 'square' || saved.grid === 'iso' || saved.grid === 'off')) state = { ...state, grid: saved.grid };
    if (saved && Number.isFinite(saved.gridSize) && saved.gridSize >= 1 && saved.gridSize <= 4096) state = { ...state, gridSize: saved.gridSize };
    if (saved && (saved.isoStyle === '2:1' || saved.isoStyle === '30')) state = { ...state, isoStyle: saved.isoStyle };
    if (saved && typeof saved.perspective === 'boolean') state = { ...state, perspective: saved.perspective };
  }
} catch {
  // storage can be unavailable; the defaults are fine
}

export function getViewSettings(): ViewSettings {
  return state;
}

export function setViewSettings(patch: Partial<ViewSettings>): void {
  state = { ...state, ...patch };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function subscribeViewSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useViewSettings<T>(selector: (s: ViewSettings) => T): T {
  return useSyncExternalStore(subscribeViewSettings, () => selector(state));
}
