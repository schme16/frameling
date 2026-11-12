/**
 * Paint and Back: in the Pixel workspace the two colour wells are plain Paint (in front) and Back (behind), the way
 * pixel tools have them. Paint is the stroke colour (`ui.color`) and Back is the fill colour (`ui.fillColor`), so
 * nothing about the document or the saved settings changes. While this is on:
 *  - every pixel tool paints with Paint, and no tool brings the other well forward;
 *  - a swatch click, the picker and the eyedropper set Paint;
 *  - X swaps Paint and Back, and a right-click paints with Back.
 * The workspace switches this on and off (src/pixel/index.ts); the Draw workspaces keep Fill and Stroke.
 */
import { useSyncExternalStore } from 'react';

const state = { on: false, filled: () => false };
const listeners = new Set<() => void>();

/** Are the Paint and Back wells in use (the Pixel workspace)? */
export const paintWellsOn = (): boolean => state.on;

export function setPaintWells(on: boolean): void {
  if (state.on === on) return;
  state.on = on;
  for (const fn of listeners) fn();
}

/** Where the "fill the shape" option lives (pixel settings), so the wells don't depend on them. */
export function setShapeFilledSource(fn: () => boolean): void {
  state.filled = fn;
}

/** In the Pixel workspace shapes are drawn in Paint, filled in Paint when "Filled" is on. */
export const shapesFilled = (): boolean => state.filled();

export function usePaintWells(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => state.on,
  );
}

/** The tools a right-click paints with, using Back for that one stroke (the others leave the right button alone). */
const RIGHT_PAINT = new Set(['pencil', 'brush', 'fill', 'shade', 'dither', 'spray', 'line', 'rect', 'ellipse', 'polygon', 'star']);

/** Does a press of this button, on this tool and layer, paint with Back? */
export const rightPaints = (tool: string, layerKind: string | undefined, button: number): boolean => button === 2 && state.on && layerKind === 'pixel' && RIGHT_PAINT.has(tool);
