/**
 * Options that belong to a tool (not the document): pixel brush size, shape fill, eraser size and so on. They live
 * here because the shared UI state only carries the colour and the vector brush. Saved in the browser's storage so
 * they're still there next time.
 */
import { useSyncExternalStore } from 'react';

export interface ToolSettings {
  /** Pixel brush: size in art pixels, shape, and the corner clean-up. */
  pixelBrushSize: number;
  pixelBrushShape: 'square' | 'round';
  pixelPerfect: boolean;
  /** Pencil: line width in document pixels. */
  pencilSize: number;
  /** Eraser: size in document pixels on vector layers, in art pixels on pixel layers. */
  eraserSize: number;
  eraserPixelSize: number;
  /** Rectangle, ellipse and line: outline thickness. Colours come from the fill and stroke boxes (wells.ts). */
  shapeStroke: number;
  cornerRadius: number;
  /** Eyedropper: pick from the active layer only. */
  pickActiveLayerOnly: boolean;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  pixelBrushSize: 1,
  pixelBrushShape: 'square',
  pixelPerfect: true,
  pencilSize: 2,
  eraserSize: 16,
  eraserPixelSize: 1,
  shapeStroke: 4,
  cornerRadius: 0,
  pickActiveLayerOnly: false,
};

const KEY = 'frameling.toolSettings';
let state: ToolSettings = { ...DEFAULT_TOOL_SETTINGS };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT_TOOL_SETTINGS) as (keyof ToolSettings)[]) {
        if (k in saved && typeof saved[k] === typeof DEFAULT_TOOL_SETTINGS[k]) (state as unknown as Record<string, unknown>)[k] = saved[k];
        else if (k in saved && saved[k] === null) (state as unknown as Record<string, unknown>)[k] = null;
      }
    }
  }
} catch {
  // unreadable saved options: start from the defaults
}

export function getToolSettings(): ToolSettings {
  return state;
}

export function setToolSettings(patch: Partial<ToolSettings>): void {
  state = { ...state, ...patch };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function resetToolSettings(): void {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
}

export function useToolSettings<T>(selector: (s: ToolSettings) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => selector(state),
  );
}
