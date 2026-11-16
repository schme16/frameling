// Typed numbers landing on the selection: the glue between the boxes (src/symbols/SelectionNumbers.tsx), the maths
// (numbers.ts) and the same edits a drag makes.
import type { Id } from '../core/format';
import { store } from '../core/store';
import { hint } from '../canvas/controller';
import type { Matrix, Rect } from '../canvas/geometry';
import { landMatrix, selectionTarget } from '../tools/select-land';
import { setCut } from '../tools/merge-mode';
import { EDIT_HINTS } from '../tools/edit';
import { editPixels } from '../pixel/commands';
import { rotateSmooth, type PixelBox } from '../pixel/transform';
import { maskBounds } from './mask';
import { pixelSelection } from './pixel-state';
import { pixelSizeTo, scalePixels, shiftPixels } from './numbers';

/** The box round the selected shapes (page pixels), or null when no shapes are selected on a vector layer. */
export function shapeBox(): Rect | null {
  return selectionTarget()?.bounds ?? null;
}

/** Puts a change on the selected shapes as one undo step. `key` merges the steps of one number typed in (the arrows held down). */
export function changeShapes(label: string, key: string, make: (b: Rect) => Matrix | null): boolean {
  const t = selectionTarget();
  if (!t) return false;
  const m = make(t.bounds);
  if (!m) return false;
  const { result, ids } = landMatrix(label, t, m, { coalesce: `num-${key}` });
  if (result === 'ok') {
    // Landed the merge way, the shapes that come out are the new selection.
    if (ids) {
      setCut(null);
      store().setUi({ selection: ids as Id[] });
    }
    return true;
  }
  if (result !== 'nothing') hint(EDIT_HINTS[result]);
  return false;
}

/** The box round the selected pixels, in whole pixels of the art, or null. */
export function pixelBox(): PixelBox | null {
  const m = pixelSelection();
  return m ? maskBounds(m) : null;
}

/** Moves the selected pixels so their box's left and top are at x and y (whole pixels of the art). */
export function movePixelsTo(x: number | null, y: number | null): boolean {
  return editPixels(
    'Move pixels',
    (img, box) => {
      if (!box) return null;
      const dx = x === null ? 0 : Math.round(x) - box.x0;
      const dy = y === null ? 0 : Math.round(y) - box.y0;
      return dx || dy ? shiftPixels(img, dx, dy) : null;
    },
    'transform',
  );
}

/** Stretches the selected pixels to a width and/or height in whole pixels, from the box's top left. */
export function sizePixelsTo(w: number | null, h: number | null, keep: boolean): boolean {
  return editPixels(
    'Resize pixels',
    (img, box) => {
      const to = box ? pixelSizeTo(box, w, h, keep) : null;
      return box && to ? scalePixels(img, box, to.w, to.h) : null;
    },
    'transform',
  );
}

/** Turns the selected pixels by some degrees about the middle of the selection, without smudging them. */
export function turnPixelsBy(degrees: number): boolean {
  if (!Number.isFinite(degrees) || degrees % 360 === 0) return false;
  return editPixels(`Turn ${Math.round(degrees * 100) / 100}°`, (img, box) => rotateSmooth(img, degrees, box), 'transform');
}
