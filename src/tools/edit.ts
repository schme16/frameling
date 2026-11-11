/**
 * The one way tools change a drawing. It finds (or makes) the drawing on the active layer at the current frame and
 * runs the recipe inside a single undo step.
 *
 * If the current frame has no drawing on that layer, a new key (cel + empty drawing) is made there first, so drawing
 * on an empty frame "just works". If the frame is held from an earlier key, drawing changes that held drawing (the
 * way flipbook tools behave); use the timeline's "New blank key" to start a fresh drawing instead.
 */
import type { Draft } from 'immer';
import type { Doc, Drawing, Layer, PixelDrawing, VectorDrawing } from '../core/format';
import { celAt, findLayer, newDrawingFor, uid } from '../core/doc';
import { store } from '../core/store';

export type EditResult = 'ok' | 'no-layer' | 'locked' | 'hidden' | 'wrong-kind';

/** Friendly words for why an edit didn't happen, for `ctx.hint`. */
export const EDIT_HINTS: Record<Exclude<EditResult, 'ok'>, string> = {
  'no-layer': 'Add a layer first, then draw on it.',
  locked: 'This layer is locked. Unlock it in the timeline to draw on it.',
  hidden: 'This layer is hidden. Show it in the timeline to draw on it.',
  'wrong-kind': "This tool doesn't work on this kind of layer.",
};

/** The active layer, and whether it can be drawn on. */
export function activeLayer(): { layer: Layer | undefined; problem: Exclude<EditResult, 'ok'> | null } {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return { layer, problem: 'no-layer' };
  if (layer.locked) return { layer, problem: 'locked' };
  if (!layer.visible) return { layer, problem: 'hidden' };
  return { layer, problem: null };
}

/** The drawing showing on the active layer at the current frame, if any (read only). */
export function activeDrawing(): Drawing | undefined {
  const { doc, ui } = store().get();
  const { layer } = activeLayer();
  if (!layer) return undefined;
  const cel = celAt(layer, ui.frame);
  return cel ? doc.drawings[cel.drawingId] : undefined;
}

/**
 * Changes the active drawing in one undo step. `kind` limits it to vector or pixel layers.
 * Returns why nothing happened, if nothing did.
 */
export function editActiveDrawing<K extends 'vector' | 'pixel'>(
  label: string,
  kind: K,
  recipe: (drawing: Draft<K extends 'vector' ? VectorDrawing : PixelDrawing>, doc: Draft<Doc>) => void,
  opts: { coalesce?: string } = {},
): EditResult {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return problem ?? 'no-layer';
  if (layer.kind !== kind) return 'wrong-kind';
  const frame = store().get().ui.frame;
  store().update(
    label,
    (doc) => {
      const l = doc.layers.find((x) => x.id === layer.id)!;
      let cel = celAt(l as Layer, frame);
      if (!cel) {
        const d = newDrawingFor(doc as Doc, l as Layer);
        doc.drawings[d.id] = d as Draft<Drawing>;
        // The new key holds until the next key on this layer, or for one frame at the end.
        const next = l.cels.find((c) => c.start > frame);
        const length = next ? next.start - frame : 1;
        l.cels.push({ id: uid('c'), start: frame, length, drawingId: d.id });
        l.cels.sort((a, b) => a.start - b.start);
        if (frame + length > doc.length) doc.length = frame + length;
        cel = l.cels.find((c) => c.start === frame)!;
      }
      recipe(doc.drawings[cel.drawingId] as never, doc);
    },
    opts,
  );
  return 'ok';
}
