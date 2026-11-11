/**
 * The one way tools change a drawing. It finds (or makes) the drawing on the active layer at the current frame and
 * runs the recipe inside a single undo step.
 *
 * If the current frame has no drawing on that layer, a new key (cel + empty drawing) is made there first, so drawing
 * on an empty frame "just works". If the frame is held from an earlier key, the `draw.heldFrame` choice decides
 * (asked the first time): make a new key here from a copy of the held drawing, or change the held drawing itself.
 */
import { current, type Draft } from 'immer';
import type { Doc, Drawing, Layer, PixelDrawing, TilemapDrawing, VectorDrawing } from '../core/format';
import { celAt, findLayer, newDrawingFor, uid } from '../core/doc';
import { store } from '../core/store';
import { registerChoice, withChoice } from '../core/choices';

export type HeldFrameChoice = 'new-key' | 'edit-held';

registerChoice<HeldFrameChoice>({
  id: 'draw.heldFrame',
  title: 'Drawing on a held frame',
  question:
    "This frame is still showing a drawing from an earlier frame (it's being held). When you draw here, what should happen?",
  options: [
    { value: 'new-key', label: 'Make a new drawing here', detail: 'This frame gets its own copy of the drawing, with your change. Earlier frames stay as they were.' },
    { value: 'edit-held', label: 'Change the held drawing', detail: 'Your change shows on every frame that holds that drawing.' },
  ],
  default: 'new-key',
  category: 'Drawing',
  help: 'timeline-frames',
});

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
export function editActiveDrawing<K extends 'vector' | 'pixel' | 'tilemap'>(
  label: string,
  kind: K,
  recipe: (drawing: Draft<K extends 'vector' ? VectorDrawing : K extends 'pixel' ? PixelDrawing : TilemapDrawing>, doc: Draft<Doc>) => void,
  opts: { coalesce?: string } = {},
): EditResult {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return problem ?? 'no-layer';
  if (layer.kind !== kind) return 'wrong-kind';
  const frame = store().get().ui.frame;
  const held = celAt(layer, frame);
  const apply = (split: boolean) =>
    store().update(
      label,
      (doc) => {
        const l = doc.layers.find((x) => x.id === layer.id)!;
        let cel = celAt(l as Layer, frame);
        if (cel && split && cel.start < frame) {
          // Make a new key here: the held cel ends just before this frame, and a copy of its drawing takes over.
          const src = doc.drawings[cel.drawingId];
          const copy = structuredClone(current(src)) as Draft<Drawing>;
          copy.id = uid(src.kind === 'pixel' ? 'p' : src.kind === 'tilemap' ? 't' : 'v');
          doc.drawings[copy.id] = copy;
          const end = cel.start + cel.length;
          cel.length = frame - cel.start;
          l.cels.push({ id: uid('c'), start: frame, length: end - frame, drawingId: copy.id });
          l.cels.sort((a, b) => a.start - b.start);
          cel = l.cels.find((c) => c.start === frame)!;
        }
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
  if (!held || held.start === frame) {
    apply(false);
    return 'ok';
  }
  // Drawing on a held frame. Asked the first time, then remembered (Preferences > Behaviour).
  withChoice<HeldFrameChoice>('draw.heldFrame', (v) => apply(v === 'new-key'));
  return 'ok';
}
