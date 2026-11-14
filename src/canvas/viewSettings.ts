// Little bits of view state that aren't part of the document or the shared UI state.
import { useSyncExternalStore } from 'react';
import { clampDistance, defaultPicks, SNAP_DISTANCE, migrateSavedPicks, sanitizeChosen, sanitizePicks, type SnapChosen, type SnapPicks } from './snapModel';

interface ViewSettings {
  /** Show the pixel grid on pixel layers when zoomed in far enough. */
  pixelGrid: boolean;
  /** Look through the camera (when the document has one) instead of at the whole stage: what an artboard does until it has been told otherwise. */
  throughCamera: boolean;
  /** Each artboard's own choice of that, by document and artboard (remembered between sessions, the last few hundred). */
  throughBy: Record<string, boolean>;
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
  /** The ticks someone actually chose (saved); `snapPicks` is these over the defaults. */
  snapChosen: SnapChosen;
  /** How close (screen pixels) something has to come to snap. */
  snapDistance: number;
  /** Other shapes (and equal gaps) look at every visible vector layer, not just the open one. */
  snapAllLayers: boolean;
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
/** How many artboards' camera choices are kept (the newest). */
const KEEP_THROUGH = 300;

/** The saved choices, checked: only true or false per name, at most `KEEP_THROUGH`. */
function readThrough(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'boolean' && k !== '__proto__') out[k] = v;
  return keepNewest(out);
}

/** Drops the oldest entries (the first set) past the limit. */
function keepNewest(by: Record<string, boolean>): Record<string, boolean> {
  const keys = Object.keys(by);
  if (keys.length <= KEEP_THROUGH) return by;
  return Object.fromEntries(keys.slice(keys.length - KEEP_THROUGH).map((k) => [k, by[k]]));
}
let state: ViewSettings = { pixelGrid: true, throughCamera: false, throughBy: {}, cameraWhilePlaying: true, rulers: false, guides: true, snap: true, snapPicks: defaultPicks(), snapChosen: {}, snapDistance: SNAP_DISTANCE.usual, snapAllLayers: true, lockGuides: false, emptyGhost: true, grid: 'off', gridSize: 32, isoStyle: '2:1', perspective: true };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.pixelGrid === 'boolean') state = { ...state, pixelGrid: saved.pixelGrid };
    if (saved && typeof saved.throughCamera === 'boolean') state = { ...state, throughCamera: saved.throughCamera };
    if (saved && saved.throughBy) state = { ...state, throughBy: readThrough(saved.throughBy) };
    if (saved && typeof saved.cameraWhilePlaying === 'boolean') state = { ...state, cameraWhilePlaying: saved.cameraWhilePlaying };
    for (const k of ['rulers', 'guides', 'snap', 'snapAllLayers', 'lockGuides', 'emptyGhost'] as const) if (saved && typeof saved[k] === 'boolean') state = { ...state, [k]: saved[k] };
    // Newer saves hold only what was chosen; older ones held every tick, so the ones still at their old default are dropped.
    if (saved && (saved.snapChosen || saved.snapPicks)) {
      const snapChosen = saved.snapChosen ? sanitizeChosen(saved.snapChosen) : migrateSavedPicks(saved.snapPicks);
      state = { ...state, snapChosen, snapPicks: sanitizePicks(snapChosen) };
    }
    if (saved && saved.snapDistance !== undefined) state = { ...state, snapDistance: clampDistance(saved.snapDistance) };
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

/** The snap distance in screen pixels (View > Snapping options). */
export const snapPx = (): number => state.snapDistance;

export function setViewSettings(patch: Partial<ViewSettings>): void {
  state = { ...state, ...patch };
  if (patch.snapDistance !== undefined) state.snapDistance = clampDistance(patch.snapDistance);
  if (patch.snapChosen) state.snapPicks = sanitizePicks(state.snapChosen);
  if (patch.throughBy) state.throughBy = keepNewest(state.throughBy);
  try {
    // The ticks are saved as what was chosen only (snapPicks is worked out from it).
    const { snapPicks: _derived, ...saved } = state;
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(saved));
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
