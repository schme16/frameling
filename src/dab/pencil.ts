// The plain Brush (B) on a pixel layer draws a plain, hard brush the way the pixel pencil always did: whole pixels, a
// square or round footprint, Pixel perfect corners, Shift+click straight lines. This file says which brushes count as plain
// and hard (so B keeps drawing them exactly as before), and moves the old Brush settings (size, shape, picture) into a
// brush of the one shared kind. Pure functions, no DOM.
import { readPixelStamp, type PixelStamp } from '../brushes/stamps';
import { cleanDab, DEFAULT_DAB, type DabBrush } from './maths';

export type PencilShape = 'square' | 'round';

/** What the pencil lays down: a square or round footprint of this many pixels, or a picture. */
export interface Footprint {
  size: number;
  shape: PencilShape;
  stamp: PixelStamp | null;
}

/**
 * True when the brush is a plain hard one that the pixel pencil can draw: a square or round tip (or a picture at its own
 * size) with a hard edge, whole pixels, full flow and opacity, and nothing that changes from dab to dab. Anything else
 * (soft edges, scatter, dynamics, paper, a second tip, taper, a blend mode) is drawn by the dab engine, as the Pixel brush does.
 */
export function isPencilDab(b: DabBrush): boolean {
  if (b.hardness !== 1 || !b.aliased || b.angle !== 0 || b.roundness !== 1 || b.follow) return false;
  if (b.scatter !== 0 || b.sizeJitter !== 0 || b.angleJitter !== 0 || b.flow !== 1 || b.opacity !== 1 || b.wet !== 0) return false;
  if (b.dynamics.length || b.grain || b.dual || b.taper || b.blend !== 'normal') return false;
  if (b.tip === 'picture') {
    const p = readPixelStamp(b.picture);
    // Copies go side by side, as the picture brush always did; scaled, it is the dab engine's job.
    return !!p && b.size === Math.max(p.w, p.h) && b.spacing === 1;
  }
  // A dab spaced wider than itself makes dots, which the pencil's solid line is not.
  return Number.isInteger(b.size) && b.spacing <= 1;
}

/** The footprint the pencil draws for a plain brush. */
export function footprintOf(b: DabBrush): Footprint {
  const stamp = b.tip === 'picture' ? readPixelStamp(b.picture) : null;
  return { size: b.size, shape: b.tip === 'square' ? 'square' : 'round', stamp };
}

/** The shared kind of brush that draws what the pencil's size, shape and picture drew. */
export function dabFromPencil(f: Footprint): DabBrush {
  const stamp = readPixelStamp(f.stamp);
  if (stamp) return cleanDab({ ...DEFAULT_DAB, tip: 'picture', picture: stamp, size: Math.max(stamp.w, stamp.h), spacing: 1 });
  return cleanDab({ ...DEFAULT_DAB, tip: f.shape === 'round' ? 'round' : 'square', size: f.size });
}

/** The Brush's settings before it shared the Pixel brush's panel: size 1, square, no picture. */
export const OLD_BRUSH_DEFAULT: Footprint = { size: 1, shape: 'square', stamp: null };

/** True when the old Brush settings were never changed (nothing to keep). */
export const isDefaultFootprint = (f: Footprint): boolean => f.size === OLD_BRUSH_DEFAULT.size && f.shape === OLD_BRUSH_DEFAULT.shape && !readPixelStamp(f.stamp);

export interface PencilMove {
  /** Already moved on an earlier launch. */
  done: boolean;
  /** The saved size, shape and picture the Brush had. Read from the tool settings, which keep them for Shade, Dither and Spray. */
  old: Footprint;
  /** Whether a Pixel brush was ever saved on this machine. */
  hadBrush: boolean;
}

export interface PencilMoved {
  done: true;
  /** The brush to make current, or null to leave the current one alone. */
  use: DabBrush | null;
  /** A brush to add to the saved ones, so the old settings can always be got back, or null. */
  keep: DabBrush | null;
}

/**
 * The one time move of the Brush's old size, shape and picture into the shared kind of brush.
 * Nothing is lost: untouched settings only give a new person the pencil they always had; changed ones become the current
 * brush when there is no Pixel brush of their own to replace, and always a saved brush, so they can be picked again.
 * Run again, it does nothing.
 */
export function movePencil(i: PencilMove): PencilMoved {
  if (i.done) return { done: true, use: null, keep: null };
  const pencil = dabFromPencil(i.old);
  if (isDefaultFootprint(i.old)) return { done: true, use: i.hadBrush ? null : pencil, keep: null };
  return { done: true, use: i.hadBrush ? null : pencil, keep: pencil };
}
