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
import { celAt, findLayer, newDrawingFor, pixelGrid, uid } from '../core/doc';
import { gridPixels, setGridPixels } from '../core/pixelBounds';
import { cutProblem, cutTween, takeTurns, OVERSHOOT_CUT_WHY } from '../core/tweenCut';
import { celOffsetAt, isInBetween, nextKey, shownDrawing } from '../core/symbols';
import { store } from '../core/store';
import { registerChoice, withChoice } from '../core/choices';
import { placesOf } from '../core/sharedDrawings';
import { autoHeldAt, cloneDrawing, newKeySpan, splitAutoHold } from '../timeline/edit-core';
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

export type SharedDrawingChoice = 'everywhere' | 'own';

registerChoice<SharedDrawingChoice>({
  id: 'draw.sharedDrawing',
  title: 'Drawing on a shared drawing',
  question: 'This drawing is shown in more than one place (the link mark on its block in the timeline says where). When you change it, what should happen?',
  options: [
    { value: 'everywhere', label: 'Change it everywhere', detail: 'Every place that shows this drawing changes with it. Good when they are meant to match.', did: 'Changed the drawing everywhere it is shown.' },
    { value: 'own', label: 'Make this one its own', detail: 'This place gets a copy of its own, with your change. The other places keep the drawing as it was.', did: 'Made this one its own, so only this place changed.' },
  ],
  default: 'everywhere',
  category: 'Drawing',
  help: 'timeline-shared',
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

export type EditResult = 'ok' | 'no-layer' | 'locked' | 'hidden' | 'wrong-kind' | 'bones' | 'morph' | 'overshoot';

/** Friendly words for why an edit didn't happen, for `ctx.hint`. */
export const EDIT_HINTS: Record<Exclude<EditResult, 'ok'>, string> = {
  'no-layer': 'Add a layer first, then draw on it.',
  locked: 'This layer is locked. Unlock it in the timeline to draw on it.',
  hidden: 'This layer is hidden. Show it in the timeline to draw on it.',
  'wrong-kind': "This tool doesn't work on this kind of layer.",
  bones: 'This is the Bones layer: it holds the skeleton. Pick another layer to draw on.',
  morph: "This frame is inside a morph (one shape melting into the next), which can't be cut in two. Draw on one of its two keys instead.",
  overshoot: OVERSHOOT_CUT_WHY,
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
  const apply = (split: boolean, own = false) =>
    store().update(
      label,
      (doc) => {
        const l = doc.layers.find((x) => x.id === layer.id)!;
        let cel = celAt(l as Layer, frame);
        if (cel && split && cel.start < frame) {
          // Make a new key here: the held cel ends just before this frame, and a copy of its drawing takes over.
          const src = doc.drawings[cel.drawingId];
          // The new key sits where the old one was (or where its glide had got to), so a moved drawing doesn't jump.
          const moved = celOffsetAt(current(l) as Layer, frame);
          const copy = (shown ? structuredClone(shown) : structuredClone(current(src))) as Draft<Drawing>;
          copy.id = uid(src.kind === 'pixel' ? 'p' : src.kind === 'tilemap' ? 't' : 'v');
          doc.drawings[copy.id] = copy;
          const end = cel.start + cel.length;
          // The glide carries on from the new key to the next one. Each half plays its part of the one easing curve and
          // takes its share of the spin and its piece of the motion path, so the motion keeps looking the same.
          const cut = tweened && cel.tween ? cutTween(current(cel).tween!, (frame - cel.start) / cel.length) : undefined;
          if (cut) {
            const next = nextKey(current(l) as Layer, current(cel) as Cel);
            takeTurns(copy as never, src.kind === 'vector' ? (current(src) as Drawing) : undefined, next && (current(doc.drawings[next.drawingId]) as Drawing), cut.turns);
            cel.tween = cut.first;
          }
          const tween = cut?.second;
          cel.length = frame - cel.start;
          l.cels.push({ id: uid('c'), start: frame, length: end - frame, drawingId: copy.id, ...(tween ? { tween } : {}), ...(moved ? { offset: { ...moved } } : {}) });
          l.cels.sort((a, b) => a.start - b.start);
          cel = l.cels.find((c) => c.start === frame)!;
        }
        // This place gets a drawing of its own, so the other places that show the old one stay as they are.
        if (own && cel) {
          const copy = cloneDrawing(current(doc.drawings[cel.drawingId]) as Drawing) as Draft<Drawing>;
          doc.drawings[copy.id] = copy;
          cel.drawingId = copy.id;
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
  // Changing a drawing that other places show would change them too. Asked the first time, then remembered
  // (Preferences > Behaviour). Not when a new drawing is about to be made here, which nothing else shows.
  const autoNew = !!opts.adds && !!autoHeldAt(layer, frame);
  const run = (split: boolean) => {
    const shared = !!held && !autoNew && !(split && held.start < frame) && placesOf(store().get().doc, held.drawingId) > 1;
    if (shared) withChoice<SharedDrawingChoice>('draw.sharedDrawing', (v) => apply(split, v === 'own'));
    else apply(split);
  };
  if (!held || held.start === frame || autoNew) {
    run(false);
    return 'ok';
  }
  if (held.tween?.kind === 'shape' && frame > held.start && nextKey(layer, held)) return 'morph';
  if (tweened && cutProblem(held.tween, (frame - held.start) / held.length, held.length)) return 'overshoot';
  if (tweened) {
    withChoice<TweenFrameChoice>('draw.tweenFrame', (v) => run(v === 'new-key'));
    return 'ok';
  }
  // Drawing on a held frame. Asked the first time, then remembered (Preferences > Behaviour).
  withChoice<HeldFrameChoice>('draw.heldFrame', (v) => run(v === 'new-key'));
  return 'ok';
}

/** The art grid of the active pixel layer (null when the active layer is not a pixel layer). */
export function activeGrid(): { width: number; height: number } | null {
  const { doc } = store().get();
  const layer = activeLayer().layer;
  return layer && layer.kind === 'pixel' ? pixelGrid(doc, layer) : null;
}

/**
 * Replaces the active pixel layer's picture with a whole-grid RGBA array. Only the painted part is kept in the
 * drawing, so a small picture on a big canvas stays small.
 */
export function setActivePixels(label: string, pixels: Uint8ClampedArray, opts: { coalesce?: string; adds?: boolean } = {}): EditResult {
  const g = activeGrid();
  if (!g) return 'wrong-kind';
  return editActiveDrawing(label, 'pixel', (d) => void setGridPixels(d, pixels, g.width, g.height), opts);
}

/** Changes the active pixel layer's picture as a whole grid: `paint` gets a private copy of it and changes it in place. */
export function paintActiveGrid(label: string, paint: (grid: Uint8ClampedArray, g: { width: number; height: number }) => void, opts: { coalesce?: string; adds?: boolean } = {}): EditResult {
  const g = activeGrid();
  if (!g) return 'wrong-kind';
  return editActiveDrawing(
    label,
    'pixel',
    (d) => {
      const px = new Uint8ClampedArray(gridPixels(d, g.width, g.height));
      paint(px, g);
      setGridPixels(d, px, g.width, g.height);
    },
    opts,
  );
}
