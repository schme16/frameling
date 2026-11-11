/**
 * The one way tools change a drawing. It finds (or makes) the drawing on the active layer at the current frame and
 * runs the recipe inside a single undo step.
 *
 * If the current frame has no drawing on that layer, a new key (cel + empty drawing) is made there first, so drawing
 * on an empty frame "just works". If the frame is held from an earlier key, the `draw.heldFrame` choice decides
 * (asked the first time): make a new key here from a copy of the held drawing, or change the held drawing itself.
 */
import { current, type Draft } from 'immer';
import type { Cel, Doc, Drawing, Layer, PixelDrawing, TilemapDrawing, VectorDrawing } from '../core/format';
import { celAt, findLayer, newDrawingFor, uid } from '../core/doc';
import { isInBetween, shownDrawing } from '../core/symbols';
import { store } from '../core/store';
import { registerChoice, withChoice } from '../core/choices';
import { autoHeldAt, newKeySpan, splitAutoHold } from '../timeline/edit-core';
import { markTracing } from '../canvas/ghost';

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

export type TweenFrameChoice = 'new-key' | 'edit-key';

registerChoice<TweenFrameChoice>({
  id: 'draw.tweenFrame',
  title: 'Changing an in-between',
  question:
    "This frame is an in-between: Frameling works it out from the keys on either side. When you move or change something here, what should happen?",
  options: [
    { value: 'new-key', label: 'Make a key here', detail: 'This frame becomes a key with your change, and the glide goes through it. The keys on either side stay as they were.' },
    { value: 'edit-key', label: 'Change the key before', detail: 'Your change goes to the key the in-betweens start from, so the whole glide changes.' },
  ],
  default: 'new-key',
  category: 'Drawing',
  help: 'tweens',
});

export type EditResult = 'ok' | 'no-layer' | 'locked' | 'hidden' | 'wrong-kind' | 'bones';

/** Friendly words for why an edit didn't happen, for `ctx.hint`. */
export const EDIT_HINTS: Record<Exclude<EditResult, 'ok'>, string> = {
  'no-layer': 'Add a layer first, then draw on it.',
  locked: 'This layer is locked. Unlock it in the timeline to draw on it.',
  hidden: 'This layer is hidden. Show it in the timeline to draw on it.',
  'wrong-kind': "This tool doesn't work on this kind of layer.",
  bones: 'This is the Bones layer: it holds the skeleton. Pick another layer to draw on.',
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

/**
 * True when adding to the active layer here starts a new drawing: the frame is a later frame of an automatic hold
 * (the last drawing just carries on until the next one).
 */
export function addingStartsNewDrawing(): boolean {
  const { layer } = activeLayer();
  return !!layer && !!autoHeldAt(layer, store().get().ui.frame);
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
  recipe: (drawing: Draft<K extends 'vector' ? VectorDrawing : K extends 'pixel' ? PixelDrawing : TilemapDrawing>, doc: Draft<Doc>, split: boolean) => void,
  opts: { coalesce?: string; adds?: boolean } = {},
): EditResult {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return problem ?? 'no-layer';
  if (layer.kind !== kind) return 'wrong-kind';
  if (layer.kind === 'vector' && layer.rig) return 'bones';
  const frame = store().get().ui.frame;
  const held = celAt(layer, frame);
  // On an in-between the new key starts from what shows there, not from the key before.
  const tweened = isInBetween(store().get().doc, layer, frame);
  const shown = tweened ? shownDrawing(store().get().doc, layer, frame) : undefined;
  const apply = (split: boolean) =>
    store().update(
      label,
      (doc) => {
        const l = doc.layers.find((x) => x.id === layer.id)!;
        let cel = celAt(l as Layer, frame);
        if (cel && split && cel.start < frame) {
          // Make a new key here: the held cel ends just before this frame, and a copy of its drawing takes over.
          const src = doc.drawings[cel.drawingId];
          const copy = (shown ? structuredClone(shown) : structuredClone(current(src))) as Draft<Drawing>;
          copy.id = uid(src.kind === 'pixel' ? 'p' : src.kind === 'tilemap' ? 't' : 'v');
          doc.drawings[copy.id] = copy;
          const end = cel.start + cel.length;
          cel.length = frame - cel.start;
          // The glide carries on from the new key to the next one.
          const tween = tweened && cel.tween ? { ...(cel.tween.kind ? { kind: cel.tween.kind } : {}), ease: current(cel).tween!.ease } : undefined;
          l.cels.push({ id: uid('c'), start: frame, length: end - frame, drawingId: copy.id, ...(tween ? { tween } : {}) });
          l.cels.sort((a, b) => a.start - b.start);
          cel = l.cels.find((c) => c.start === frame)!;
        }
        const auto = opts.adds && cel ? autoHeldAt(l as Layer, frame) : undefined;
        if (auto) {
          // A later frame of an automatic hold works like an empty frame: a new drawing starts here.
          const d = newDrawingFor(doc as Doc, l as Layer);
          doc.drawings[d.id] = d as Draft<Drawing>;
          splitAutoHold(l as Layer, auto as Cel, frame, d.id);
          cel = l.cels.find((c) => c.start === frame)!;
          markTracing(l.id, frame);
        }
        if (!cel) {
          const d = newDrawingFor(doc as Doc, l as Layer);
          doc.drawings[d.id] = d as Draft<Drawing>;
          // Until the next key on this layer or the end (or for one frame, if that's the preference).
          const span = newKeySpan(doc as Doc, l as Layer, frame);
          l.cels.push({ id: uid('c'), start: frame, drawingId: d.id, ...span });
          l.cels.sort((a, b) => a.start - b.start);
          if (frame + span.length > doc.length) doc.length = frame + span.length;
          cel = l.cels.find((c) => c.start === frame)!;
          if (l.cels.some((c) => c.start < frame)) markTracing(l.id, frame);
        }
        recipe(doc.drawings[cel.drawingId] as never, doc, split && !!held && held.start < frame);
      },
      { coalesce: opts.coalesce },
    );
  if (!held || held.start === frame || (opts.adds && autoHeldAt(layer, frame))) {
    apply(false);
    return 'ok';
  }
  if (tweened) {
    withChoice<TweenFrameChoice>('draw.tweenFrame', (v) => apply(v === 'new-key'));
    return 'ok';
  }
  // Drawing on a held frame. Asked the first time, then remembered (Preferences > Behaviour).
  withChoice<HeldFrameChoice>('draw.heldFrame', (v) => apply(v === 'new-key'));
  return 'ok';
}
