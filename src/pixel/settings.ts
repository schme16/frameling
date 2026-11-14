// Options for the pixel art tools (mirror drawing, shading, dither; mirror drawing is shared with the vector tools), kept in the browser's storage like the other
// tool options in src/tools/settings.ts.
import { useSyncExternalStore } from 'react';
import type { DitherPattern } from './dither';

export type SymmetryMode = 'off' | 'h' | 'v' | 'both';

export interface PixelSettings {
  /** Mirror drawing: off, left-right (`h`, a line down the middle), top-bottom (`v`), or both. */
  symmetry: SymmetryMode;
  /** Where the mirror lines sit, in art pixels from the left / top (half steps allowed). null = the canvas centre. */
  axisX: number | null;
  axisY: number | null;
  /** The same two lines on a vector layer, in document pixels from the left / top. null = the page centre. */
  vectorAxisX: number | null;
  vectorAxisY: number | null;
  /** The shading brush makes pixels lighter (true) or darker. */
  shadeLighter: boolean;
  ditherPattern: DitherPattern;
  /** Dither brush size in art pixels. */
  ditherSize: number;
  /** Outline: include diagonal neighbours. */
  outlineCorners: boolean;
  /** Spray brush size in art pixels (the radius of the spray). */
  spraySize: number;
  /** Pixel shapes are filled in Paint (false = outline only). Only in the Pixel workspace, where shapes use Paint. */
  shapeFilled: boolean;
  /** Slices (named rectangles) are drawn on the canvas. */
  showSlices: boolean;
}

export const DEFAULT_PIXEL_SETTINGS: PixelSettings = {
  symmetry: 'off',
  axisX: null,
  axisY: null,
  vectorAxisX: null,
  vectorAxisY: null,
  shadeLighter: true,
  ditherPattern: 'checker',
  ditherSize: 4,
  outlineCorners: false,
  spraySize: 8,
  shapeFilled: false,
  showSlices: true,
};

const KEY = 'frameling.pixelSettings';
let state: PixelSettings = { ...DEFAULT_PIXEL_SETTINGS };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT_PIXEL_SETTINGS) as (keyof PixelSettings)[]) {
        const v = saved[k];
        const d = DEFAULT_PIXEL_SETTINGS[k];
        if (v !== undefined && (typeof v === typeof d || (d === null && (typeof v === 'number' || v === null)))) (state as unknown as Record<string, unknown>)[k] = v;
      }
    }
  }
} catch {
  // start from the defaults
}

export function getPixelSettings(): PixelSettings {
  return state;
}

export function setPixelSettings(patch: Partial<PixelSettings>): void {
  state = { ...state, ...patch };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function resetPixelSettings(): void {
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
}

export function usePixelSettings<T>(selector: (s: PixelSettings) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => selector(state),
  );
}

export function onPixelSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
