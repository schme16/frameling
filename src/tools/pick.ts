// Switching tools, kept apart from wells.ts so the tool strip doesn't pull in the colour commands.
import { store } from '../core/store';
import { paintWellsOn } from './pixelWells';

/**
 * The box a tool paints with, so picking a tool brings it to the front: the bucket pours the fill, line tools draw
 * with the stroke. Then clicking a swatch always changes the colour you're about to paint with. Shape tools use both
 * boxes and the rest use none, so they leave the boxes alone (null).
 */
export function wellForTool(tool: string, paintWells = paintWellsOn()): 'fill' | 'stroke' | null {
  // With Paint and Back (the Pixel workspace) every tool paints with Paint, so none moves the wells.
  if (paintWells) return null;
  if (tool === 'fill') return 'fill';
  if (tool === 'brush' || tool === 'pencil' || tool === 'line' || tool === 'shade' || tool === 'dither') return 'stroke';
  return null;
}

/** Switches tool, bringing its colour box to the front (see wellForTool). */
export function pickTool(tool: string): void {
  const w = wellForTool(tool);
  store().setUi(w ? { tool, activeWell: w } : { tool });
}
