// The pixel bar's logic (see PixelBar.tsx): which size setting a tool uses, which controls it shows, and the palette
// index of the colour being painted with. Plain functions, so they can be tested.
import type { DocPalette } from '../core/format';
import { parseHex } from '../canvas/colors';
import { exactIndex, nearestIndex, paletteRgb } from './palette';

/** The sizes the bar offers, in art pixels. */
export const BAR_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Which setting holds a tool's size on a pixel layer, or null for tools without one. The pencil is always one pixel. */
export function sizeSettingFor(tool: string): 'pixelBrushSize' | 'eraserPixelSize' | 'ditherSize' | 'pencil' | null {
  if (tool === 'brush' || tool === 'shade') return 'pixelBrushSize';
  if (tool === 'eraser') return 'eraserPixelSize';
  if (tool === 'dither') return 'ditherSize';
  if (tool === 'pencil') return 'pencil';
  return null;
}

/** Tools whose footprint has a shape (square or round). */
export const hasShape = (tool: string): boolean => ['pencil', 'brush', 'shade', 'eraser', 'dither'].includes(tool);
/** Tools with the "pixel perfect" corner clean-up. */
export const hasPerfect = (tool: string): boolean => ['pencil', 'brush', 'shade'].includes(tool);
/** Tools mirror drawing works with. */
export const hasMirror = (tool: string): boolean => ['pencil', 'brush', 'shade', 'eraser', 'dither', 'line', 'rect', 'ellipse'].includes(tool);

/**
 * The palette colour being painted with: its index (0-based), and whether it's exactly that colour or the nearest
 * one it will snap to. Null for an empty palette or a colour that can't be read.
 */
export function paletteIndexOf(p: DocPalette, color: string): { index: number; exact: boolean } | null {
  const c = parseHex(color);
  if (!c || !p.colors.length) return null;
  const rgb = paletteRgb(p.colors);
  const exact = exactIndex(rgb, c[0], c[1], c[2]);
  if (exact >= 0) return { index: exact, exact: true };
  const near = nearestIndex(rgb, c[0], c[1], c[2]);
  return near >= 0 ? { index: near, exact: false } : null;
}
