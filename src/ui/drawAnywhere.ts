// Draw anywhere: the tool decides what it writes. At the start of a stroke, if the layer you are on is the other kind from
// what the stroke writes (you pressed Pixels while on a vector layer, or the tool only draws pixels), the stroke goes to
// the other half of the layer's pair, made if it is missing. The layer and the stroke are one Undo.
// The plan is plain logic so it can be tested. beginStroke does it, and the canvas calls it once per press.
import { currentChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import type { Id, Layer, LayerKind } from '../core/format';
import { isDrawKind, pairOf } from '../core/pairs';
import { store } from '../core/store';
import { makeHalf, whyNoHalf } from '../timeline/pairs';
import { EDIT_HINTS } from '../tools/edit';
import { getPrefs } from './prefs';
import { drawIntentFor, MAKE_LAYER_CHOICE, setDrawIntent, sizeForNewPixelLayer, type Side } from './drawingMode';
import { openHelp } from './overlays';
import { toast } from './toast';

/** The tools that put new marks down. The selection, eraser, eyedropper and gradient tools work on what is there and never make a layer. */
export const STROKE_TOOLS: ReadonlySet<string> = new Set(['brush', 'pencil', 'pen', 'line', 'rect', 'ellipse', 'polygon', 'star', 'shade', 'dither', 'spray', 'soft-brush', 'airbrush', 'highlighter', 'charcoal']);

/** The kind of layer a stroke wants, or null when it is happy on the layer you are on. */
export function wantedKind(toolId: string, toolLayers: readonly LayerKind[], active: Pick<Layer, 'kind'> | undefined, side: Side | null): Side | null {
  if (!active || !isDrawKind(active.kind) || !STROKE_TOOLS.has(toolId)) return null;
  const kinds = toolLayers.filter(isDrawKind);
  if (!kinds.length) return null;
  // A tool that cannot draw on this kind of layer writes the kind it can.
  if (!kinds.includes(active.kind)) return kinds.length === 1 ? kinds[0] : null;
  // A tool that does both writes what the switch says.
  if (kinds.length === 2 && side && side !== active.kind) return side;
  return null;
}

/** What a press does before the tool gets it: nothing, go to the other half, or make it. */
export type StrokePlan = { do: 'stay' } | { do: 'go'; layerId: Id } | { do: 'make'; from: Id; kind: Side };

export function planStroke(layers: readonly Layer[], active: Layer | undefined, toolId: string, toolLayers: readonly LayerKind[], side: Side | null): StrokePlan {
  const want = wantedKind(toolId, toolLayers, active, side);
  if (!want || !active) return { do: 'stay' };
  const half = pairOf(layers, active);
  if (half && half.kind === want) return { do: 'go', layerId: half.id };
  return { do: 'make', from: active.id, kind: want };
}

const TOLD_KEY = 'frameling.told.siblingLayer';
// Remembered in this window even when storage is not there, so it is never said twice in a row.
let toldNow = false;
function toldBefore(): boolean {
  if (toldNow) return true;
  try {
    return localStorage.getItem(TOLD_KEY) === '1';
  } catch {
    return false;
  }
}
function markTold(): void {
  toldNow = true;
  try {
    localStorage.setItem(TOLD_KEY, '1');
  } catch {
    /* no storage: it is just said again next time */
  }
}

/** Forgets that the toast was said (for tests and for the help page's replay). */
export function forgetTold(): void {
  toldNow = false;
  try {
    localStorage.removeItem(TOLD_KEY);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Called at the start of a press, before the tool sees it. Moves you to the layer the stroke should go to, making it
 * first when it is not there. Returns a plain sentence when the stroke cannot go ahead (nothing is changed then).
 */
export function beginStroke(tool: { id: string; layers: LayerKind[] }): { refused?: string } {
  const look = () => {
    const { doc, ui } = store().get();
    const active = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
    return { doc, active, plan: planStroke(doc.layers, active, tool.id, tool.layers, drawIntentFor(active?.id)) };
  };
  let { doc, active, plan } = look();
  if (plan.do === 'stay' || !active) return {};
  // A layer made for an earlier press that drew nothing is taken back before this one starts.
  if (store().endJoin()) ({ doc, active, plan } = look());
  if (plan.do === 'stay' || !active) return {};
  if (plan.do === 'go') {
    setDrawIntent(null);
    // A hidden or locked half is the tool's own hint to give, once you are on it.
    store().setUi({ activeLayerId: plan.layerId });
    return {};
  }
  // Making the other half writes blank keys onto this layer's pair, which a locked layer does not allow.
  if (active.locked) return { refused: EDIT_HINTS.locked };
  const why = whyNoHalf(active);
  if (why) return { refused: why };
  // Someone who said "do not make layers for me" at the switch is not given one by a stroke either.
  if (currentChoice(MAKE_LAYER_CHOICE) === 'tell') {
    return { refused: `There is no ${plan.kind} layer next to "${active.name}" yet. Add one with New ${plan.kind} layer in the Layers menu, then draw on it.` };
  }
  const pick = sizeForNewPixelLayer(doc.layers, getPrefs().newPixelSize);
  let made: Id | null = null;
  store().update(`Add a ${plan.kind} layer for this stroke`, (d) => void (made = makeHalf(d, active.id, plan.kind, pick.size)));
  if (!made) return { refused: 'That layer could not be given another half.' };
  // The stroke that comes next joins this step, so Undo takes back the layer with it.
  store().joinNext({ activeLayerId: active.id }, { activeLayerId: made });
  store().setUi({ activeLayerId: made });
  setDrawIntent(null);
  tellOnce(findLayer(store().get().doc, made)?.name ?? '', active.name, plan.kind, pick.size);
  return {};
}

/** The first time a stroke makes a layer, say so, naming it. After that it just happens. */
function tellOnce(name: string, from: string, kind: Side, size: number): void {
  if (toldBefore()) return;
  markTold();
  const squares = kind === 'pixel' ? ` Its squares are ${size} wide.` : '';
  toast(`Made "${name}" beside "${from}" for that stroke.${squares} The two show as one row in Layers, and Undo takes back the layer along with the stroke.`, {
    kind: 'success',
    quill: null,
    duration: 7000,
    action: { label: 'How it works', run: () => openHelp('draw-anywhere') },
  });
}

/** The kind of the other half the layer you are on could have, or null when it has one already or cannot. */
export function missingHalfKind(layers: readonly Layer[], active: Layer | undefined): Side | null {
  if (!active || whyNoHalf(active) || pairOf(layers, active)) return null;
  return active.kind === 'vector' ? 'pixel' : 'vector';
}

/** Makes the other half of the layer you are on now, without drawing, and goes to it (the "Add the other half" command). */
export function addHalfNow(): void {
  const { doc, ui } = store().get();
  const active = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (active && pairOf(doc.layers, active)) return void toast(`"${active.name}" already has its other half.`, { quill: null });
  const why = whyNoHalf(active);
  if (why) return void toast(why, { quill: null });
  const kind = missingHalfKind(doc.layers, active);
  if (!kind || !active) return;
  const pick = sizeForNewPixelLayer(doc.layers, getPrefs().newPixelSize);
  let made: Id | null = null;
  store().update(`Add a ${kind} layer beside this one`, (d) => void (made = makeHalf(d, active.id, kind, pick.size)));
  if (!made) return;
  store().setUi({ activeLayerId: made });
  setDrawIntent(null);
  const name = findLayer(store().get().doc, made)?.name ?? '';
  toast(`Made "${name}" beside "${active.name}". They show as one row in Layers.`, { kind: 'success', quill: null, duration: 4000 });
}
