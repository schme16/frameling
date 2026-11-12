/**
 * Variation actions on the app's store: each is one undo step. (The maths is in variations.ts.)
 */
import type { Doc, Id } from '../core/format';
import { onBlocked, store } from '../core/store';
import { choose } from '../core/choices';
import { findLayer } from '../core/doc';
import { toast } from '../ui/toast';
import { leaveSymbol } from '../symbols/ops';
import { leaveTileEdit } from '../tiles/tileEdit';
import { toggleThroughCamera } from '../camera/ops';
import type { FitMode } from './fit';
import { activeId, findArtboard, sizeOf } from './model';
import { goToArtboard, installArtboards } from './ops';
import { detachVariation, listDifferences, makeVariation, resetDifference, resetVariation, setVariationSize, sourceOf, variationsOf, type DiffItem, type ResetKey } from './variations';

// A change to what a variation shares with its original is refused with a plain note.
onBlocked((message) => void toast(message, { kind: 'warn' }));

export type SizePreset = 'same' | 'square' | 'wide' | 'tall';

export const SIZE_PRESETS: { id: SizePreset; label: string; title: string }[] = [
  { id: 'same', label: 'Same size', title: 'The same size as the original' },
  { id: 'square', label: 'Square', title: 'A square cut (1:1), for social posts and icons' },
  { id: 'wide', label: 'Wide', title: 'A wide cut (16:9), for video' },
  { id: 'tall', label: 'Tall', title: 'A tall cut (9:16), for stories and phones' },
];

/** The size of a preset cut, taken from the shorter side of the original so nothing gets small. */
export function presetSize(from: { w: number; h: number }, preset: SizePreset): { width: number; height: number } {
  const s = Math.min(from.w, from.h);
  const long = Math.round((s * 16) / 9);
  if (preset === 'square') return { width: s, height: s };
  if (preset === 'wide') return { width: long, height: s };
  if (preset === 'tall') return { width: s, height: long };
  return { width: from.w, height: from.h };
}

function toTopLevel(): void {
  leaveTileEdit();
  const n = store().get().doc.editing?.length ?? 0;
  if (n) leaveSymbol(n);
}

/**
 * Makes a variation of an artboard (the open one by default) and opens it. With a size preset it starts as that cut,
 * framed on the original (the first time, Frameling asks whether to fill or fit; see the choice `variations.frame`).
 */
export async function makeVariationOf(id?: Id, preset: SizePreset = 'same', open = true): Promise<Id | null> {
  toTopLevel();
  installArtboards();
  const from = id ?? activeId(store().get().doc);
  const doc = store().get().doc;
  const src = findArtboard(doc, from);
  if (!src) return null;
  const root = sourceOf(doc, src) ?? src;
  const size = presetSize(sizeOf(doc, root), preset);
  const differs = preset !== 'same' && (size.width !== sizeOf(doc, root).w || size.height !== sizeOf(doc, root).h);
  const frame = differs ? await choose<FitMode>('variations.frame') : 'fill';
  let made: Id | null = null;
  store().update('Make a variation', (d) => {
    made = makeVariation(d as Doc, from, differs ? { size, frame } : {});
  });
  if (made && open) {
    goToArtboard(made, true);
    // A cut of another size is framed by a camera, so the editing view looks through it to show the cut.
    if (differs) toggleThroughCamera(true);
    toast(`Made "${findArtboard(store().get().doc, made)!.name}". It follows "${root.name}": change things here and only those things differ.`);
  }
  return made;
}

/** Gives the open variation (or any) a preset size, framed on the original. */
export async function sizeVariation(id: Id, preset: SizePreset): Promise<void> {
  const doc = store().get().doc;
  const a = findArtboard(doc, id);
  const root = a && sourceOf(doc, a);
  if (!a || !root) return;
  const size = presetSize(sizeOf(doc, root), preset);
  const frame = preset === 'same' ? 'fill' : await choose<FitMode>('variations.frame');
  store().update(preset === 'same' ? 'Back to the original size' : `Make it ${preset}`, (d) => void setVariationSize(d as Doc, id, size.width, size.height, frame));
}

/** Changes how the variation frames the original (and does it again for the size it has). */
export function reframeVariation(id: Id, frame: FitMode): void {
  const doc = store().get().doc;
  const a = findArtboard(doc, id);
  if (!a) return;
  const { w, h } = sizeOf(doc, a);
  store().update('Frame the original', (d) => void setVariationSize(d as Doc, id, w, h, frame));
}

export function detachVariationById(id: Id = activeId(store().get().doc)): boolean {
  const a = findArtboard(store().get().doc, id);
  if (!a?.variationOf) return false;
  const name = a.name;
  const colourway = !!a.overrides?.palette;
  store().update(`Detach "${name}"`, (d) => void detachVariation(d as Doc, id));
  toast(`"${name}" is a plain artboard now. It keeps what it shows, and no longer follows the original.${colourway ? ' Its pixels keep their colours, and the palette list goes back to the shared one.' : ''}`);
  return true;
}

export function resetVariationById(id: Id = activeId(store().get().doc)): boolean {
  const a = findArtboard(store().get().doc, id);
  if (!a?.variationOf) return false;
  store().update('Reset variation to the original', (d) => void resetVariation(d as Doc, id));
  return true;
}

export function resetDifferenceById(id: Id, key: ResetKey): void {
  store().update('Reset to the original', (d) => void resetDifference(d as Doc, id, key));
}

/** Opens the variation if needed, then goes to the layer, frame and shapes a difference is about. */
export function jumpToDifference(id: Id, item: DiffItem): void {
  if (activeId(store().get().doc) !== id) goToArtboard(id, true);
  const { doc } = store().get();
  if (item.layer && findLayer(doc, item.layer)) {
    const layer = findLayer(doc, item.layer)!;
    const frame = item.frame === undefined ? store().get().ui.frame : Math.max(0, Math.min(doc.length - 1, item.frame));
    store().setUi({ activeLayerId: layer.id, frame, selection: item.shapes ?? [] });
  }
}

/** The differences of the open artboard (empty when it is not a variation). */
export function openDifferences(): DiffItem[] {
  const { doc } = store().get();
  return listDifferences(doc, activeId(doc));
}

/** The variations of an artboard, for "export all". */
export function variationIdsOf(id: Id): Id[] {
  return variationsOf(store().get().doc, id).map((a) => a.id);
}
