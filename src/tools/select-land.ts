// Putting a matrix on the selected shapes as one undo step: what letting go of a drag does, and what the Position and
// size boxes do. One place, so both behave the same on merge layers and in the middle of an in-between.
import { current, isDraft } from 'immer';
import type { Id, Shape, VectorDrawing } from '../core/format';
import { store } from '../core/store';
import { isInBetween, shownDrawing } from '../core/symbols';
import { shapesBounds, transformShape, type Matrix, type Rect } from '../canvas/geometry';
import { transformPicked, type PartMap } from '../select/scope';
import { activeDrawing, activeLayer, editActiveDrawing, type EditResult } from './edit';
import { activeIsMerge, editShapes, pendingCut } from './merge-mode';
import { placeMoved } from '../geometry/merge';

/** The drawing the shapes are on, and the shapes a change would land on. */
export interface Target {
  drawing: VectorDrawing;
  originals: Shape[];
}

/** What to do to each shape: the matrix for it, or null to leave it where it is. */
export type MatrixFor = (s: Shape) => Matrix | null;

/** The selected shapes on the active vector layer (part of a merged shape picked with a box counts as that part), or null. */
export function selectionTarget(): (Target & { bounds: Rect }) | null {
  const { layer } = activeLayer();
  const { doc, ui } = store().get();
  if (!layer || layer.kind !== 'vector') return null;
  const d = shownDrawing(doc, layer, ui.frame) ?? activeDrawing();
  if (!d || d.kind !== 'vector') return null;
  const cut = pendingCut();
  const ids = new Set(ui.selection);
  const originals = cut ? cut.lifted : d.shapes.filter((s) => ids.has(s.id));
  const bounds = shapesBounds(originals);
  if (!bounds) return null;
  return { drawing: cut ? { ...d, shapes: cut.shapes } : d, originals, bounds };
}

/**
 * Applies `m` to the originals in one undo step. On a merge layer they land the merge way (joining their colour and
 * cutting what they cover), and `ids` are the shapes that came out. In the middle of an in-between the same change
 * is made to the key it creates.
 */
export function landMatrix(label: string, t: Target, m: Matrix | MatrixFor, opts: { coalesce?: string; parts?: PartMap } = {}): { result: EditResult | 'nothing'; ids?: Id[] } {
  // One matrix for all of them (a drag), or one each (Align and Spread out: every shape goes its own way). A shape with no matrix stays.
  const matrixOf = new Map<Id, Matrix>();
  for (const o of t.originals) {
    const mo = typeof m === 'function' ? m(o) : m;
    if (mo) matrixOf.set(o.id, mo);
  }
  // Only a drag of picked points says `parts`; everything else takes whole shapes.
  const take = (o: Shape, mo: Matrix): Shape => (opts.parts?.size ? transformPicked(o, mo, opts.parts) : transformShape(o, mo));
  const repl = new Map(t.originals.filter((o) => matrixOf.has(o.id)).map((o) => [o.id, take(o, matrixOf.get(o.id)!)]));
  if (activeIsMerge()) {
    let ids: Id[] = [];
    const result = editShapes(
      label,
      () => {
        const p = placeMoved(t.drawing.shapes, [...repl.values()]);
        ids = p.added;
        return p.shapes;
      },
      opts,
    );
    return { result, ids };
  }
  const { layer } = activeLayer();
  const { doc, ui } = store().get();
  const between = !!layer && isInBetween(doc, layer, ui.frame);
  const result = editActiveDrawing(
    label,
    'vector',
    (d) => {
      if (!between) {
        d.shapes = d.shapes.map((x) => repl.get(x.id) ?? x);
        return;
      }
      // Mid-tween: the same move applied to whatever the frame ends up holding, a new key (made from the in-between)
      // or the key before (moved by the same amount).
      d.shapes = d.shapes.map((x) => (repl.has(x.id) ? take((isDraft(x) ? current(x) : x) as Shape, matrixOf.get(x.id)!) : x));
    },
    opts,
  );
  return { result };
}
