// Which kind of layer you are drawing on, said where the tools are. The layer decides how drawing behaves and which tools
// work (the workspace is only a layout), so the tool rail carries a line for it, and says how many tools are off here.
// This file is the plain logic: the words, the counts, the one ask-once question about hiding or greying, and moving
// between layers. ToolStrip.tsx draws it.
import { onChoiceChange, rememberedChoice, registerChoice, setChoice, withChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import type { Layer, LayerKind } from '../core/format';
import { store } from '../core/store';
import { inHarness } from '../pixel/harness';
import { getPrefs, setPrefs, subscribePrefs, type OffLayerPref } from './prefs';
import { toast } from './toast';
import type { WaitingTool } from './toolArrange';

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
  if (!n) {
    return {
      word,
      off: '',
      needs: null,
      tip: `${word}${named}`,
      desc: greyed ? 'This is the layer you are drawing on. Press for other layers.' : 'This is the layer you are drawing on, so every tool here works on it. Press for other layers.',
      label: `You are drawing on a ${LOWER[kind]} layer${named}. Press for other layers.`,
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
    desc: `${list} ${n === 1 ? 'needs' : 'need'} a ${needs} layer. Press to go to one.`,
    label: `You are drawing on a ${LOWER[kind]} layer${named}. ${n} tool${n === 1 ? ' is' : 's are'} ${greyed ? 'greyed out' : 'off the rail'} because they need a ${needs} layer: ${list}. Press to go to one.`,
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
 * a layer you did not ask for would be an odd surprise). True when it went.
 */
export function goToLayerKind(kind: 'vector' | 'pixel'): boolean {
  const layer = topLayerOf(store().get().doc.layers, kind);
  if (!layer) {
    toast(`There is no ${kind} layer yet. Add one with New ${kind} layer in the Layers menu, then go to it.`, { quill: null });
    return false;
  }
  store().setUi({ activeLayerId: layer.id });
  toast(`Now on the ${kind} layer "${layer.name}".`, { kind: 'success', quill: null, duration: 2200 });
  return true;
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
  title: 'Tools that do not work on this layer',
  question: 'Some tools only work on one kind of layer. Hide the ones that do not work here, or keep them on the rail, greyed out?',
  category: 'Tools',
  help: 'tool-strip',
  default: 'hide',
  options: [
    { value: 'hide', label: 'Hide them', did: 'Tools that do not work on this layer are hidden. The line at the top of the rail says what is off.', detail: 'A shorter rail. The line at the top says which layer you are on and how many tools are off.' },
    { value: 'grey', label: 'Grey them out', did: 'Tools that do not work on this layer are greyed out, in their usual places.', detail: 'Every tool stays where it is. The ones that cannot be used here are dimmed, and say why when you point at them.' },
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
