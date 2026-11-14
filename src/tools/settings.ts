/**
 * Options that belong to a tool (not the document): pixel brush size, shape fill, eraser size and so on. They live
 * here because the shared UI state is rebuilt at every launch and carries only what you are doing right now. Saved in
 * the browser's storage so they're still there next time. The brush, colours, loop playback and onion skin sit in that
 * shared state, so they are copied in and out of the `remembered` option (see rememberUi.ts) rather than kept twice.
 */
import { useSyncExternalStore } from 'react';
import type { PlaneChoice } from '../canvas/perspectivePlane';
import type { RememberedUi } from '../core/uiMemory';

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
  /** New lines and shapes: dashes, how wide the line is along its length, and arrow heads on open lines (see geometry/lineStyle.ts). */
  lineDash: string;
  lineWidth: string;
  arrowStart: string;
  arrowEnd: string;
  /** Hold to tidy: how long the pen stays still before a stroke is tidied, in milliseconds (see tools/quickshape.ts). */
  quickHoldMs: number;
  /** Rectangle and ellipse with perspective guides showing: which plane they lie on (auto guesses from the drag). */
  perspectivePlane: PlaneChoice;
  /** Eyedropper: pick from the active layer only. */
  pickActiveLayerOnly: boolean;
  /** Polygon: how many sides. Star: how many points, and how deep the dips are (inner size, 10 to 95 percent). */
  polygonSides: number;
  starPoints: number;
  starInner: number;
  /** Pencil on vector layers: false draws the hand-drawn outline, true a clean even line you can edit by its points. */
  pencilClean: boolean;
  /**
   * The vector brush, the stroke and fill colours, loop playback and the onion skin. They live in the shared UI state
   * while you work, so src/tools/rememberUi.ts copies them here on every change and puts them back at launch. The
   * values are checked when they are read back (core/uiMemory.ts). null = nothing saved yet.
   */
  remembered: Partial<RememberedUi> | null;
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
  lineDash: 'solid',
  lineWidth: 'even',
  arrowStart: 'none',
  arrowEnd: 'none',
  quickHoldMs: 600,
  perspectivePlane: 'auto',
  pickActiveLayerOnly: false,
  polygonSides: 6,
  starPoints: 5,
  starInner: 45,
  pencilClean: false,
  remembered: null,
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
