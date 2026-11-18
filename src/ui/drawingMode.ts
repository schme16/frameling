// Which kind of layer you are drawing on, said where the tools are. The layer decides how drawing behaves and which tools
// work (the workspace is only a layout), so the tool rail carries a line for it, and says how many tools are off here.
// This file is the plain logic: the words, the counts, the one ask-once question about hiding or greying, and moving
// between layers. ToolStrip.tsx draws it.
import { onChoiceChange, rememberedChoice, registerChoice, setChoice, withChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import type { Id, Layer, LayerKind } from '../core/format';
import { pairOf } from '../core/pairs';
import { store, useStore } from '../core/store';
import { useSyncExternalStore } from 'react';
import * as ops from '../timeline/ops';
import { whyNoHalf } from '../timeline/pairs';
import { inHarness } from '../pixel/harness';
import { getPrefs, setPrefs, subscribePrefs, type OffLayerPref } from './prefs';
import { openPrefs } from './overlays';
import { toast } from './toast';
import type { WaitingTool } from './toolArrange';
import { SIDE_WORDS } from './toolRailWidth';
import { STACK_CLICK_CHOICE, STACK_SHARE_CHOICE, type StackClick, type StackMode } from './toolStacks';
import { choiceWord } from '../words/choices';

const WORDS: Record<LayerKind, string> = { vector: 'Vector layer', pixel: 'Pixel layer', tilemap: 'Tile layer', camera: 'Camera layer' };
const ICONS: Record<LayerKind, 'vector' | 'pixel' | 'tilemap' | 'camera'> = { vector: 'vector', pixel: 'pixel', tilemap: 'tilemap', camera: 'camera' };
const LOWER: Record<LayerKind, string> = { vector: 'vector', pixel: 'pixel', tilemap: 'tile', camera: 'camera' };

/** "Vector layer", "Pixel layer": the short name shown on the rail. */
export const layerWord = (kind: LayerKind): string => WORDS[kind];

/** The icon that stands for a kind of layer. */
export const layerIcon = (kind: LayerKind): 'vector' | 'pixel' | 'tilemap' | 'camera' => ICONS[kind];

/** What the layer line on the rail says and how it reads aloud. `off` is how many tools are left off because of this layer. */
export interface ModeLine {
  word: string;
  /** The small second line ("5 tools off"), or empty when every tool is here. */
  off: string;
  /** The needed kind of layer, when tools are off. */
  needs: 'vector' | 'pixel' | null;
  tip: string;
  desc: string;
  label: string;
}

/** The words for the layer line, from the layer in use and the tools waiting for another kind of layer. */
export function modeLine(kind: LayerKind, layerName: string, waiting: WaitingTool[], greyed = false): ModeLine {
  const word = layerWord(kind);
  const n = waiting.length;
  const needs = n ? waiting[0].needs : null;
  const named = layerName ? ` "${layerName}"` : '';
  const other: Side | null = needs ?? (kind === 'pixel' ? 'vector' : kind === 'vector' ? 'pixel' : null);
  const press = other ? `Press ${sideWord(other)} to go to ${n ? 'one' : `a ${other} layer`}.` : 'Press Pixels or Vectors to go to a layer.';
  if (!n) {
    return {
      word,
      off: '',
      needs: null,
      tip: `${word}${named}`,
      desc: `${greyed ? 'This is the layer you are drawing on.' : 'This is the layer you are drawing on, so every tool here works on it.'} ${press}`,
      label: `You are drawing on a ${LOWER[kind]} layer${named}. ${press}`,
    };
  }
  const names = waiting.slice(0, 3).map((t) => t.label);
  // "Shade and Dither", "Shade, Dither and Spray", "Shade, Dither, Spray and 2 more".
  const list = n > 3 ? `${names.join(', ')} and ${n - 3} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return {
    word,
    off: greyed ? `${n} greyed out` : `${n} tool${n === 1 ? '' : 's'} off`,
    needs,
    tip: `${word}${named}: ${n} tool${n === 1 ? '' : 's'} ${greyed ? 'greyed out' : 'off'}`,
    desc: `${list} ${n === 1 ? 'needs' : 'need'} a ${needs} layer. ${press}`,
    label: `You are drawing on a ${LOWER[kind]} layer${named}. ${n} tool${n === 1 ? ' is' : 's are'} ${greyed ? 'greyed out' : 'off the rail'} because they need a ${needs} layer: ${list}. ${press}`,
  };
}

/** How many tools of a group are off because of the layer, for the small note on its heading. */
export function offInGroup(tools: readonly string[], waiting: ReadonlySet<string>): number {
  let n = 0;
  for (const t of tools) if (waiting.has(t)) n++;
  return n;
}

/** The top layer of a kind (the one nearest the front), or undefined when there is none. */
export function topLayerOf(layers: readonly Layer[], kind: LayerKind): Layer | undefined {
  return [...layers].reverse().find((l) => l.kind === kind);
}

/**
 * Goes to the top layer of a kind and picks it. With none, says so and how to make one (and does not make it for you:
 * a layer you did not ask for would be an odd surprise). `because` names the tool that sent you ("Shade"). True when it went.
 */
export function goToLayerKind(kind: 'vector' | 'pixel', because?: string): boolean {
  const layer = topLayerOf(store().get().doc.layers, kind);
  if (!layer) {
    toast(`There is no ${kind} layer yet. Add one with New ${kind} layer in the Layers menu, then go to it.`, { quill: null });
    return false;
  }
  store().setUi({ activeLayerId: layer.id });
  toast(because ? `${because} works on ${kind} layers, so you are now on "${layer.name}".` : `Now on the ${kind} layer "${layer.name}".`, { kind: 'success', quill: null, duration: 2200 });
  return true;
}

// ---- The Pixels | Vectors switch at the top of the rail. It shows the kind of the layer you are on, so it can never
// disagree with the layer. Pressing a side goes to the top layer of that kind, or offers to make one.

export type Side = 'pixel' | 'vector';
export const SIDES: readonly Side[] = ['pixel', 'vector'];

/** The word on a side of the switch. */
export const sideWord = (side: Side): string => SIDE_WORDS[side];

/** Which side of the switch a layer lights: pixel or vector. Tile and camera layers light neither. */
export function sideOf(kind: LayerKind | null): Side | null {
  return kind === 'pixel' || kind === 'vector' ? kind : null;
}

// ---- What you are about to write. Pressing the other side does not move you: it says what the next stroke is, and the
// stroke goes to the other half of the layer's pair (made if it is not there). The intent belongs to the layer it was set
// on, so picking another layer puts the switch back to that layer's own kind.

let intent: { side: Side; layerId: Id } | null = null;
const intentListeners = new Set<() => void>();

/** Says what the next stroke on this layer is: pixels or vectors, whatever the layer is. */
export function setDrawIntent(side: Side | null, layerId?: Id): void {
  const next = side && layerId ? { side, layerId } : null;
  if (intent?.side === next?.side && intent?.layerId === next?.layerId) return;
  intent = next;
  intentListeners.forEach((f) => f());
}

/** The kind the next stroke will be: the side you pressed on this layer, or else the layer's own kind. */
export function drawKind(layers: readonly Layer[], activeLayerId: Id | null): LayerKind | null {
  const l = findLayer({ layers } as never, activeLayerId) ?? layers[layers.length - 1];
  if (!l) return null;
  // Picking another layer drops it: it was about the layer it was pressed on.
  if (intent && intent.layerId !== l.id) intent = null;
  return intent ? intent.side : l.kind;
}

/** The kind the next stroke will be, right now. */
export const drawKindNow = (): LayerKind | null => drawKind(store().get().doc.layers, store().get().ui.activeLayerId);

/** The side you pressed on a layer and have not drawn on yet, or null. */
export function drawIntentFor(layerId: Id | null | undefined): Side | null {
  return intent && intent.layerId === layerId ? intent.side : null;
}

/** React: the kind the next stroke will be. */
export function useDrawKind(): LayerKind | null {
  const layers = useStore((s) => s.doc.layers);
  const id = useStore((s) => s.ui.activeLayerId);
  useSyncExternalStore(
    (f) => (intentListeners.add(f), () => void intentListeners.delete(f)),
    () => intent,
  );
  return drawKind(layers, id);
}

/** The short tip on a side of the switch you are not on. `half` is the other half of your layer's pair, `top` the top layer of that kind. */
export function sideTip(side: Side, o: { half: string; top: string; canMake: boolean }): string {
  if (o.half) return `${sideWord(side)}: go to "${o.half}"`;
  if (o.canMake) return `${sideWord(side)}: draw ${side === 'pixel' ? 'pixels' : 'vectors'} on this layer's pair`;
  return o.top ? `${sideWord(side)}: go to "${o.top}"` : `${sideWord(side)}: no ${side} layer yet`;
}

/** The longer line under it. */
export function sideDesc(side: Side, o: { half: string; top: string; canMake: boolean; name: string }): string {
  if (o.half) return `This layer has a ${side} half. Switch to it.`;
  if (o.canMake) return `Your next stroke goes on a ${side} layer next to "${o.name}", made for you if there is not one yet.`;
  return o.top ? `Switch to the top ${side} layer.` : `Press to make a ${side} layer.`;
}

/** What pressing a side does: nothing (already there), go to a layer, or make one because there is none. */
export type PressPlan = { do: 'stay' } | { do: 'go'; layerId: string; name: string } | { do: 'make' };

export function planPress(layers: readonly Layer[], kind: LayerKind | null, side: Side): PressPlan {
  if (sideOf(kind) === side) return { do: 'stay' };
  const there = topLayerOf(layers, side);
  return there ? { do: 'go', layerId: there.id, name: there.name } : { do: 'make' };
}

/**
 * The side a tool needs when the layer you are on is the wrong one: Shade, Dither, Spray, Magic wand and Slices need
 * Pixels, Edit points and Shape hints need Vectors. Null when the tool works here, works on both kinds (so the switch
 * stays put), or belongs to tile or camera layers.
 */
export function flipSideFor(toolLayers: readonly LayerKind[], kind: LayerKind | null): Side | null {
  if (!kind || toolLayers.includes(kind)) return null;
  const wanted = SIDES.filter((s) => toolLayers.includes(s));
  return wanted.length === 1 ? wanted[0] : null;
}

/**
 * The square size for a new pixel layer: the top pixel layer's, else a tile layer's (tiles sit on a pixel grid too, so
 * the art lines up), else the preference. `from` says which, for the toast.
 */
export function sizeForNewPixelLayer(layers: readonly Layer[], preferred: number): { size: number; from: 'layer' | 'tiles' | 'prefs' } {
  const top = topLayerOf(layers, 'pixel');
  if (top && top.kind === 'pixel') return { size: top.pixelSize, from: 'layer' };
  const tiles = topLayerOf(layers, 'tilemap');
  if (tiles && tiles.kind === 'tilemap') return { size: tiles.pixelSize, from: 'tiles' };
  return { size: Math.max(1, Math.round(preferred)), from: 'prefs' };
}

// ---- When a side has no layer: asked once, then remembered.

export const MAKE_LAYER_CHOICE = 'toggle.makeLayer';

registerChoice<'make' | 'tell'>({
  id: MAKE_LAYER_CHOICE,
  title: choiceWord('choice.toggle.makeLayer.title'),
  question: choiceWord('choice.toggle.makeLayer.question'),
  category: 'Layers',
  help: 'drawing-mode',
  default: 'make',
  dismiss: 'tell',
  options: [
    { value: 'make', label: choiceWord('choice.toggle.makeLayer.make.label'), did: choiceWord('choice.toggle.makeLayer.make.did'), detail: choiceWord('choice.toggle.makeLayer.make.detail') },
    { value: 'tell', label: choiceWord('choice.toggle.makeLayer.tell.label'), did: choiceWord('choice.toggle.makeLayer.tell.did'), detail: choiceWord('choice.toggle.makeLayer.tell.detail') },
  ],
});

/** Makes a layer of a kind, above the one you are on, and says what it chose (the square size, for pixels). */
export function makeLayerFor(side: Side): void {
  const { doc } = store().get();
  if (side === 'vector') {
    const o = ops.addVectorLayer();
    const name = findLayer(store().get().doc, o.id ?? null)?.name ?? '';
    toast(`Made a vector layer${name ? ` called "${name}"` : ''} and moved you to it.`, { kind: 'success', quill: null, duration: 3200 });
    return;
  }
  const pick = sizeForNewPixelLayer(doc.layers, getPrefs().newPixelSize);
  const o = ops.addPixelLayer(undefined, pick.size);
  const name = findLayer(store().get().doc, o.id ?? null)?.name ?? '';
  const why = pick.from === 'layer' ? 'the same as your other pixel layer' : pick.from === 'tiles' ? 'the same as your tile layer' : 'from your Preferences';
  toast(`Made a pixel layer${name ? ` called "${name}"` : ''}. Its squares are ${pick.size} wide, ${why}.`, {
    kind: 'success',
    quill: null,
    duration: 5000,
    action: { label: 'Change size', run: () => openPrefs('general', undefined, 'New pixel layer size') },
  });
}

/**
 * Presses a side of the switch: goes to the top layer of that kind, or, with none, makes one (asked once, remembered).
 * `because` names the tool that sent you here. `declined` runs when no layer came of it, so the caller can step aside.
 */
export function pressSide(side: Side, opts: { because?: string; declined?: () => void } = {}): void {
  const { doc, ui } = store().get();
  const active = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const own = sideOf(active?.kind ?? null);
  if (active && own) {
    if (sideOf(drawKindNow()) === side) return;
    // Its other half, if it has one, is where you go. Otherwise nothing moves: the next stroke is what changes, and it
    // makes the other half when it lands (see drawAnywhere.ts).
    const half = pairOf(doc.layers, active);
    if (half && half.kind === side) {
      setDrawIntent(null);
      store().setUi({ activeLayerId: half.id });
      return;
    }
    if (side === own) {
      setDrawIntent(null);
      return;
    }
    if (!whyNoHalf(active)) {
      setDrawIntent(side, active.id);
      if (opts.because) toast(`${opts.because} draws ${side === 'pixel' ? 'pixels' : 'vectors'}, so your next stroke goes on a ${side} layer next to "${active.name}".`, { quill: null, duration: 3200 });
      return;
    }
  }
  goToSide(side, opts);
}

/**
 * Goes to the top layer of that kind, or, with none, makes one (asked once, remembered). The way for the layers that
 * cannot have another half (tile and camera layers, a bones layer), and for the "Go to a pixel layer" commands.
 */
export function goToSide(side: Side, opts: { because?: string; declined?: () => void } = {}): void {
  const plan = planPress(store().get().doc.layers, sideOf(activeKindNow()), side);
  if (plan.do === 'stay') return;
  if (plan.do === 'go') {
    goToLayerKind(side, opts.because);
    return;
  }
  withChoice<'make' | 'tell'>(MAKE_LAYER_CHOICE, (v) => {
    if (v === 'make') return makeLayerFor(side);
    toast(`There is no ${side} layer yet. Add one with New ${side} layer in the Layers menu, then press ${sideWord(side)}.`, { quill: null });
    opts.declined?.();
  });
}

/** The kind of the layer in use (the top one when none is picked). */
export function activeKindNow(): LayerKind | null {
  const s = store().get();
  return (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? null;
}

/** The name of the layer in use (the top one when none is picked), for the tip. */
export function activeLayerName(): string {
  const s = store().get();
  return (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.name ?? '';
}

// ---- Hide the tools that do not work here, or grey them out: asked once, when it first matters, then remembered.

export const OFF_LAYER_CHOICE = 'tools.offLayer';

registerChoice<OffLayerPref>({
  id: OFF_LAYER_CHOICE,
  title: choiceWord('choice.tools.offLayer.title'),
  question: choiceWord('choice.tools.offLayer.question'),
  category: 'Tools',
  help: 'tool-strip',
  default: 'hide',
  options: [
    { value: 'hide', label: choiceWord('choice.tools.offLayer.hide.label'), did: choiceWord('choice.tools.offLayer.hide.did'), detail: choiceWord('choice.tools.offLayer.hide.detail') },
    { value: 'grey', label: choiceWord('choice.tools.offLayer.grey.label'), did: choiceWord('choice.tools.offLayer.grey.did'), detail: choiceWord('choice.tools.offLayer.grey.detail') },
  ],
});

// ---- Similar tools share a button (a stack): the Brush and its soft cousins, the Eraser and the Soft eraser, the Retouch tools.
// Two settings more than questions, so they are never asked: the usual answer is used and Preferences > Behaviour changes it.

registerChoice<StackClick>({
  id: STACK_CLICK_CHOICE,
  title: choiceWord('choice.tools.stackClick.title'),
  question: choiceWord('choice.tools.stackClick.question'),
  category: 'Tools',
  help: 'tool-pullouts',
  default: 'last',
  silent: true,
  options: [
    { value: 'last', label: choiceWord('choice.tools.stackClick.last.label'), detail: choiceWord('choice.tools.stackClick.last.detail') },
    { value: 'first', label: choiceWord('choice.tools.stackClick.first.label'), detail: choiceWord('choice.tools.stackClick.first.detail') },
  ],
});

registerChoice<StackMode>({
  id: STACK_SHARE_CHOICE,
  title: choiceWord('choice.tools.stackShare.title'),
  question: choiceWord('choice.tools.stackShare.question'),
  category: 'Tools',
  help: 'tool-pullouts',
  default: 'share',
  silent: true,
  options: [
    { value: 'share', label: choiceWord('choice.tools.stackShare.share.label'), detail: choiceWord('choice.tools.stackShare.share.detail') },
    { value: 'apart', label: choiceWord('choice.tools.stackShare.apart.label'), detail: choiceWord('choice.tools.stackShare.apart.detail') },
  ],
});

/**
 * Called when the rail has just left tools off because of the layer. The first time, says so in a toast with a Change
 * button (the usual way, hide, is done), and remembers that it has said it. Never in the screenshot and check harness.
 */
export function tellAboutOffLayer(): void {
  if (rememberedChoice(OFF_LAYER_CHOICE) !== undefined || inHarness()) return;
  withChoice<OffLayerPref>(OFF_LAYER_CHOICE, (v) => setPrefs({ toolsOffLayer: v }), { gently: { undo: () => undefined } });
}

// The choice and the preference are one setting seen from two places: changing either changes the other. A preference
// that was already moved off the default counts as an answer, so nobody who picked greyed-out is asked.
{
  const remembered = rememberedChoice(OFF_LAYER_CHOICE) as OffLayerPref | undefined;
  if (remembered && remembered !== getPrefs().toolsOffLayer) setPrefs({ toolsOffLayer: remembered });
  else if (!remembered && getPrefs().toolsOffLayer !== 'hide') setChoice(OFF_LAYER_CHOICE, getPrefs().toolsOffLayer);
  let seen = getPrefs().toolsOffLayer;
  subscribePrefs(() => {
    const now = getPrefs().toolsOffLayer;
    if (now === seen) return;
    seen = now;
    if (rememberedChoice(OFF_LAYER_CHOICE) !== now) setChoice(OFF_LAYER_CHOICE, now);
  });
  onChoiceChange((id, value) => {
    if (id !== OFF_LAYER_CHOICE || value === undefined) return;
    if (value !== getPrefs().toolsOffLayer && (value === 'hide' || value === 'grey')) setPrefs({ toolsOffLayer: value });
  });
}
