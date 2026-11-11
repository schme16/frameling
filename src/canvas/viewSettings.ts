// Little bits of view state that aren't part of the document or the shared UI state.
import { useSyncExternalStore } from 'react';

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
  /** Shapes and selections snap to guides and to the page's edges and middle. */
  snap: boolean;
  /** Guides can't be moved or added (they still show and snap). */
  lockGuides: boolean;
}

const KEY = 'frameling.view';
let state: ViewSettings = { pixelGrid: true, throughCamera: false, cameraWhilePlaying: true, rulers: false, guides: true, snap: true, lockGuides: false };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.pixelGrid === 'boolean') state = { ...state, pixelGrid: saved.pixelGrid };
    if (saved && typeof saved.throughCamera === 'boolean') state = { ...state, throughCamera: saved.throughCamera };
    if (saved && typeof saved.cameraWhilePlaying === 'boolean') state = { ...state, cameraWhilePlaying: saved.cameraWhilePlaying };
    for (const k of ['rulers', 'guides', 'snap', 'lockGuides'] as const) if (saved && typeof saved[k] === 'boolean') state = { ...state, [k]: saved[k] };
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
