// The brushes you have saved: where they live, and everything you can do to them. The rules are in model.ts. Yours are
// kept in the browser's storage under `frameling.brushPresets`, so the settings backup carries them too.
import { useSyncExternalStore } from 'react';
import { currentChoice, registerChoice, withChoice } from '../core/choices';
import { DEFAULT_BRUSH, findLayer, uid } from '../core/doc';
import type { BrushSettings } from '../core/format';
import { registerCommand, unregisterCommand } from '../core/registry';
import { store } from '../core/store';
import { download, pickUpload } from '../platform';
import { pickTool } from '../tools/pick';
import { applySpec, currentSpec, isApplying, isPixelBrushTool, liveBrushTool, subscribeSpecs } from '../dab/live';
import { toast } from '../ui/toast';
import type { DabBrush } from '../dab/maths';
import { movePencil, OLD_BRUSH_DEFAULT, type PencilMoved } from '../dab/pencil';
import { hadSavedDab, setWholeDab } from '../dab/settings';
import { getToolSettings } from '../tools/settings';
import { IMPORT_EXTS } from './import';
import { cleanGroup } from './library';
import { sameSpec as sameSpecFor, specTool } from '../dab/spec';
import {
  addShared,
  allPresets,
  BRUSHES_EXT,
  brushesFileName,
  brushesToText,
  deletePreset,
  MAX_BRUSHES_BYTES,
  movePreset,
  MAX_PRESETS,
  onSide,
  parseBrushesText,
  pixelHalf,
  pixelPresetState,
  presetBody,
  presetState,
  renamePreset,
  sameBrush,
  sanitizeList,
  savePixelPreset,
  savePreset,
  stepPreset,
  updatePixelPreset,
  updatePreset,
  vectorHalf,
  madeOn,
  type BrushPreset,
  type PresetState,
} from './model';
import { bigLoss, keptOnPixels, keptOnVectors, type Kept } from './translate';
import { canonicalId } from './pairs';
import { noteRecent, requestPicker, toggleFavourite } from './picker';
import { readPicked } from './parts';
import { startBrushFlash } from './flash';
import './help';
import { choiceWord } from '../words/choices';

const KEY = 'frameling.brushPresets';
/** Which brush was picked, kept so a brush you changed still says so after a restart (and not "Custom brush"). */
const PICKED_KEY = 'frameling.brushPicked';

export type BrushEdits = 'keep' | 'follow';

registerChoice<BrushEdits>({
  id: 'brushes.edits',
  title: choiceWord('choice.brushes.edits.title'),
  question: choiceWord('choice.brushes.edits.question'),
  options: [
    { value: 'keep', label: choiceWord('choice.brushes.edits.keep.label'), detail: choiceWord('choice.brushes.edits.keep.detail') },
    { value: 'follow', label: choiceWord('choice.brushes.edits.follow.label'), detail: choiceWord('choice.brushes.edits.follow.detail') },
  ],
  default: 'keep',
  category: 'Drawing',
  help: 'brush-presets',
  silent: true,
});

/** What to do when a brush made for the other kind of layer would look quite different here: draw it as close as this kind can, or pick another. */
export type SwapAnswer = 'close' | 'pick';
export const SWAP_PIXELS = 'brushes.swap.pixels';
export const SWAP_VECTORS = 'brushes.swap.vectors';
const SWAP_OPTIONS = {
  pixels: [
    { value: 'close' as const, label: choiceWord('choice.brushes.swap.pixels.close.label'), detail: choiceWord('choice.brushes.swap.pixels.close.detail'), did: choiceWord('choice.brushes.swap.pixels.close.did') },
    { value: 'pick' as const, label: choiceWord('choice.brushes.swap.pixels.pick.label'), detail: choiceWord('choice.brushes.swap.pixels.pick.detail'), did: choiceWord('choice.brushes.swap.pixels.pick.did') },
  ],
  vectors: [
    { value: 'close' as const, label: choiceWord('choice.brushes.swap.vectors.close.label'), detail: choiceWord('choice.brushes.swap.vectors.close.detail'), did: choiceWord('choice.brushes.swap.vectors.close.did') },
    { value: 'pick' as const, label: choiceWord('choice.brushes.swap.vectors.pick.label'), detail: choiceWord('choice.brushes.swap.vectors.pick.detail'), did: choiceWord('choice.brushes.swap.vectors.pick.did') },
  ],
};

registerChoice<SwapAnswer>({
  id: SWAP_PIXELS,
  title: choiceWord('choice.brushes.swap.pixels.title'),
  question: choiceWord('choice.brushes.swap.pixels.question'),
  options: SWAP_OPTIONS.pixels,
  default: 'close',
  category: 'Drawing',
  help: 'brush-presets',
});
registerChoice<SwapAnswer>({
  id: SWAP_VECTORS,
  title: choiceWord('choice.brushes.swap.vectors.title'),
  question: choiceWord('choice.brushes.swap.vectors.question'),
  options: SWAP_OPTIONS.vectors,
  default: 'close',
  category: 'Drawing',
  help: 'brush-presets',
});

let mine: BrushPreset[] = [];
let pickedId: string | null = null;
let naming: 'save' | 'rename' | null = null;
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    mine = sanitizeList(saved && typeof saved === 'object' ? (saved as { presets?: unknown }).presets : null);
  }
} catch {
  // unreadable saved brushes: start with none of your own
}

function setPicked(id: string | null): void {
  pickedId = id;
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(PICKED_KEY, JSON.stringify(id));
      else localStorage.removeItem(PICKED_KEY);
    }
  } catch {
    // not remembered this time
  }
}

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(PICKED_KEY) ?? 'null');
    pickedId = readPicked(typeof saved === 'string' ? canonicalId(saved) : saved, allPresets(mine).map((p) => p.id));
  }
} catch {
  // unreadable: nothing was picked
}

/** Says why nothing happened, and answers false. */
function warn(message: string): false {
  toast(message, { kind: 'warn' });
  return false;
}

let version = 0;
export const brushesVersion = (): number => version;

function emit(): void {
  version++;
  for (const fn of listeners) fn();
}

function setMine(list: BrushPreset[]): void {
  mine = list;
  try {
    if (typeof localStorage !== 'undefined') {
      const kept = mine.map((p) => presetBody(p, true));
      localStorage.setItem(KEY, JSON.stringify({ version: 1, presets: kept }));
    }
  } catch {
    // not saved this time
  }
  syncPickCommands();
  emit();
}

/** Your brushes, in the order you made them. */
export const myBrushes = (): readonly BrushPreset[] => mine;
let everyCache: { from: BrushPreset[]; all: BrushPreset[] } | null = null;
/** The starters and yours, the same array until your list changes (so a component can watch it). */
export function everyBrush(): BrushPreset[] {
  if (!everyCache || everyCache.from !== mine) everyCache = { from: mine, all: allPresets(mine) };
  return everyCache.all;
}
export const namingMode = (): 'save' | 'rename' | null => naming;
export const pickedBrushId = (): string | null => pickedId;
export const currentBrushState = (): PresetState => presetState(store().get().ui.brush, mine, pickedId);

/**
 * The two kinds of layer a brush is drawn on. The brush list is one list; a brush made for one kind is drawn on the other
 * through its translation. Which kind the row, the picker and the commands mean is the layer you are drawing on, or the
 * pixel brush tool you hold (which draws pixels wherever you are: see ui/drawAnywhere.ts).
 */
export type Side = 'vector' | 'pixel';
export const sideOfTool = (tool: string): Side => (isPixelBrushTool(tool) ? 'pixel' : 'vector');
/** The kind of the layer in use: pixel only for a pixel layer, so a tile or camera layer counts as vector, as the panel does. */
export function layerSide(): Side {
  const { ui, doc } = store().get();
  return (findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1])?.kind === 'pixel' ? 'pixel' : 'vector';
}
export const currentSide = (): Side => (isPixelBrushTool(liveBrushTool()) ? 'pixel' : layerSide());
export const currentPixelState = (): PresetState => pixelPresetState(currentSpec(), mine, pickedId);
/** Which brush is lit on a side, and whether it has been changed. */
export const stateFor = (side: Side): PresetState => (side === 'pixel' ? currentPixelState() : currentBrushState());
/** The brushes a kind of layer lists: the starters and yours, the same list for both. */
export const brushesOnSide = (side: Side): BrushPreset[] => onSide(everyBrush(), side);

/** What the picked brush has that this kind of layer cannot draw, when its half for this kind is worked out and not made. Empty when nothing is lost. */
export function keptFor(p: BrushPreset | undefined, side: Side): Kept[] {
  if (!p || madeOn(p, side)) return [];
  return side === 'pixel' ? keptOnPixels(p.brush) : p.pixel ? keptOnVectors(p.pixel) : [];
}
export const pickedBrush = (): BrushPreset | undefined => (pickedId ? everyBrush().find((p) => p.id === pickedId) : undefined);

export function subscribeBrushes(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useBrushPresets<T>(selector: () => T): T {
  return useSyncExternalStore(subscribeBrushes, selector);
}

export function startNaming(mode: 'save' | 'rename' | null): void {
  naming = mode;
  emit();
}

/** The saved brush now lit that you can change (not a starter). */
export function activeOwn(side: Side = currentSide()): BrushPreset | undefined {
  const { activeId } = stateFor(side);
  return mine.find((p) => p.id === activeId);
}

// Which brush each kind of layer last had put in it. A kind that already has the picked brush keeps what it has (so a brush
// you changed is still changed when you hop to the other kind and back); a kind that has another brush gets this one's half.
const appliedOn: Record<Side, string | null> = { vector: pickedId, pixel: pickedId };
let swapping = false;
/** The tool that was changed for you when a swap went to a pixel layer, so a swap back puts it right. */
let swapTool: { from: string; to: string } | null = null;
/** True while a swap is putting the picked brush's other half in, so a flash or a follow knows it was not you. */
export const isSwapping = (): boolean => swapping;
const whileSwapping = (fn: () => void): void => {
  const was = swapping;
  swapping = true;
  try {
    fn();
  } finally {
    swapping = was;
  }
};

/** Puts one half of a brush in the settings that kind of layer draws with. `pick` lets a brush of another kind (soft paint, charcoal) take its tool. */
function putHalf(p: BrushPreset, side: Side, pick: boolean, onSwap = false): void {
  if (side === 'pixel') {
    const before = store().get().ui.tool;
    applySpec(pixelHalf(p), pick);
    const after = store().get().ui.tool;
    // Only a swap puts the tool back on the way out; picking a brush yourself on a pixel layer is you choosing to paint with it.
    if (onSwap && after !== before) swapTool = { from: before, to: after };
  } else store().setUi({ brush: { ...vectorHalf(p) } });
  appliedOn[side] = p.id;
}

/** No brush is picked: what each kind of layer has stays as it is, and nothing follows the layer until one is picked. */
export function pickNone(): void {
  setPicked(null);
  appliedOn.vector = null;
  appliedOn.pixel = null;
  swapTool = null;
  emit();
}

/** Uses a brush: its half for the kind of layer you are on goes to the brush in use. */
export function applyPreset(id: string): boolean {
  const p = everyBrush().find((x) => x.id === canonicalId(id));
  if (!p) return false;
  setPicked(p.id);
  swapTool = null;
  putHalf(p, currentSide(), true);
  noteRecent(p.id);
  emit();
  return true;
}

/** The brush stays picked and its half for the new kind of layer is put in: the layer decides the side. */
export function followLayer(kind: Side): void {
  const p = pickedBrush();
  if (!p) return;
  if (kind === 'vector' && swapTool) {
    // A swap to pixels changed the tool for the brush's sake: a swap back puts it as it was.
    const { from, to } = swapTool;
    swapTool = null;
    if (store().get().ui.tool === to) pickTool(from);
  }
  if (appliedOn[kind] === p.id) return;
  const tool = store().get().ui.tool;
  const pick = tool === 'brush' || isPixelBrushTool(tool);
  const put = () => {
    whileSwapping(() => putHalf(p, kind, pick, true));
    emit();
  };
  const kept = keptFor(p, kind);
  if (!bigLoss(kept)) return put();
  withChoice<SwapAnswer>(kind === 'pixel' ? SWAP_PIXELS : SWAP_VECTORS, (answer) => {
    if (answer === 'close') return put();
    // Not this brush on this kind: the layer keeps the brush it has, and the picker opens to pick one for it.
    pickNone();
    requestPicker();
  });
}

/** Saves the brush in use under a name. Returns the brush saved, or null if the name was empty or the list was full. */
export function saveCurrentAs(name: string, group?: string): BrushPreset | null {
  const spec = currentSide() === 'pixel' ? currentSpec() : null;
  const r = spec ? savePixelPreset(mine, name, spec, uid('b'), group) : savePreset(mine, name, store().get().ui.brush, uid('b'), group);
  if (!r) {
    toast(name.trim() ? `You have ${MAX_PRESETS} saved brushes already. Delete one to make room.` : 'Give the brush a name first.', { kind: 'warn' });
    return null;
  }
  setMine(r.list);
  setPicked(r.preset.id);
  noteRecent(r.preset.id);
  naming = null;
  toast(r.replaced ? `Updated "${r.preset.name}" with this brush.` : `Saved "${r.preset.name}". Find it in the brush picker, under the preview.`, { kind: 'success' });
  emit();
  return r.preset;
}

/** Puts the brush in use into the lit saved brush. */
export function updateActive(): boolean {
  const own = activeOwn();
  if (!own) return false;
  // The half for the kind of layer you are on is what gets kept; on a brush made for the other kind it is now a half of its own.
  const spec = currentSide() === 'pixel' ? currentSpec() : null;
  setMine(spec ? updatePixelPreset(mine, own.id, spec) : updatePreset(mine, own.id, store().get().ui.brush));
  toast(`Updated "${own.name}".`, { kind: 'success' });
  return true;
}

/** Back to how the lit brush was saved, undoing the changes since. */
export function revertActive(): boolean {
  const p = everyBrush().find((x) => x.id === stateFor(currentSide()).activeId);
  if (!p) return false;
  return applyPreset(p.id);
}

/** Gives the lit saved brush a new name and, when `group` is given, moves it there (empty: back to "My brushes"). */
export function renameActive(name: string, group?: string): boolean {
  const own = activeOwn();
  naming = null;
  if (!own || !name.trim()) {
    emit();
    return false;
  }
  let list = renamePreset(mine, own.id, name);
  if (group !== undefined) list = movePreset(list, own.id, group);
  setMine(list);
  return true;
}

/** Deletes the lit saved brush, with an Undo on the toast. */
export function deleteActive(): boolean {
  const own = activeOwn();
  if (!own) return false;
  const at = mine.findIndex((p) => p.id === own.id);
  setMine(deletePreset(mine, own.id));
  if (pickedId === own.id) setPicked(null);
  toast(`Deleted "${own.name}".`, {
    action: {
      label: 'Undo',
      run: () => {
        if (mine.some((p) => p.id === own.id)) return;
        const list = [...mine];
        list.splice(Math.min(at, list.length), 0, own);
        setMine(list);
        setPicked(own.id);
        emit();
      },
    },
  });
  return true;
}

/** Stars the lit brush, or takes the star off. Says what happened. */
export function toggleActiveFavourite(): boolean {
  const p = everyBrush().find((x) => x.id === stateFor(currentSide()).activeId);
  if (!p) return warn('Pick or save a brush first, then star it.');
  const on = toggleFavourite(p.id);
  toast(on ? `"${p.name}" is in your Favourites.` : `"${p.name}" is out of your Favourites.`, { duration: 1600 });
  return on;
}

/** Moves to the next (or previous) brush in the row. */
export function stepBrush(by: 1 | -1): void {
  const side = currentSide();
  const p = stepPreset(brushesOnSide(side), stateFor(side).activeId, by);
  if (p && applyPreset(p.id)) toast(p.name, { duration: 1400 });
}

/** The pure part of "save every change": the brush a saved brush should become, or null to leave it. */
export function followTarget(edits: BrushEdits, own: BrushPreset | undefined, brush: BrushSettings): BrushSettings | null {
  if (edits !== 'follow' || !own || sameBrush(vectorHalf(own), brush)) return null;
  return { ...brush };
}

/** Starts saving changes into the picked brush when "Changing a saved brush" says so. Called once, at launch. */
/** The name the Brush's old size, shape and picture are saved under, in Pixel basics. */
export const MY_PENCIL = 'My pixel pencil';
const MOVED_KEY = 'frameling.pixelPencilMoved.v1';

/**
 * The one time move of the plain Brush's own size, shape and picture into the shared pixel brush (see dab/pencil.ts).
 * The old settings stay in the tool settings, since Pencil, Shade, Dither and Spray still use them; this only reads them.
 */
export function movePencilOnce(): PencilMoved | null {
  let done = false;
  try {
    done = typeof localStorage !== 'undefined' && localStorage.getItem(MOVED_KEY) === '1';
  } catch {
    // unreadable: counts as not done, and the move is harmless to repeat
  }
  const t = getToolSettings();
  const r = movePencil({ done, old: { size: t.pixelBrushSize ?? OLD_BRUSH_DEFAULT.size, shape: t.pixelBrushShape ?? OLD_BRUSH_DEFAULT.shape, stamp: t.pixelStamp }, hadBrush: hadSavedDab() });
  if (done) return null;
  if (r.use) setWholeDab(r.use);
  if (r.keep) {
    const saved = savePixelPreset(mine, MY_PENCIL, { kind: 'dab', dab: r.keep }, uid('b'), 'Pixel basics');
    if (saved) setMine(saved.list);
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MOVED_KEY, '1');
  } catch {
    // not remembered this time
  }
  // A person with a Pixel brush of their own keeps it, so say where the Brush's old settings went.
  if (r.keep && !r.use) toast(`The Brush on a pixel layer now uses the pixel brush list. Your old size and shape are saved as "${MY_PENCIL}".`, { duration: 9000 });
  return r;
}

export function startBrushPresets(): () => void {
  syncPickCommands();
  const s = store();
  let last = s.get().ui.brush;
  let lastKind = layerSide();
  const offVector = s.subscribe(() => {
    // The layer changed kind: the brush stays picked, and its half for the new kind goes in.
    const kind = layerSide();
    if (kind !== lastKind) {
      lastKind = kind;
      followLayer(kind);
    }
    const now = s.get().ui.brush;
    if (now === last) return;
    last = now;
    if (swapping) return emit();
    const own = mine.find((p) => p.id === pickedId);
    const to = currentSide() === 'vector' ? followTarget(currentChoice<BrushEdits>('brushes.edits'), own, now) : null;
    if (own && to) setMine(updatePreset(mine, own.id, to));
    else emit();
  });
  // The pixel brush tools: the same, when any of their settings change or you move between them.
  let lastTool = liveBrushTool();
  const onPixel = () => {
    if (isApplying() || swapping) return;
    const own = mine.find((p) => p.id === pickedId);
    const spec = currentSide() === 'pixel' ? currentSpec() : null;
    const to = own && spec ? followPixelTarget(currentChoice<BrushEdits>('brushes.edits'), own, spec) : null;
    if (own && to) setMine(updatePixelPreset(mine, own.id, to));
    else emit();
  };
  const offSpecs = subscribeSpecs(onPixel);
  const offTool = s.subscribe(() => {
    const t = liveBrushTool();
    if (t === lastTool) return;
    lastTool = t;
    if (isPixelBrushTool(t)) emit();
  });
  const offFlash = startBrushFlash();
  return () => {
    offVector();
    offSpecs();
    offTool();
    offFlash();
  };
}

/** The pixel version of followTarget: the pixel brush a saved one should become, or null to leave it. */
export function followPixelTarget(edits: BrushEdits, own: BrushPreset | undefined, spec: NonNullable<ReturnType<typeof currentSpec>>): NonNullable<ReturnType<typeof currentSpec>> | null {
  if (edits !== 'follow' || !own) return null;
  const half = pixelHalf(own);
  if (specTool(half) !== specTool(spec)) return null;
  return sameSpecFor(half, spec) ? null : spec;
}

// ---------------------------------------------------------------- sharing

export async function saveBrushesFile(): Promise<boolean> {
  if (!mine.length) return warn('You have not saved any brushes of your own yet. Save one first.');
  download(brushesFileName(), new TextEncoder().encode(brushesToText(mine)));
  toast(`Saved your brushes as a file you can share (${BRUSHES_EXT}).`, { kind: 'success' });
  return true;
}

export async function copyBrushesText(): Promise<boolean> {
  if (!mine.length) return warn('You have not saved any brushes of your own yet. Save one first.');
  try {
    await navigator.clipboard.writeText(brushesToText(mine));
    toast('Copied your brushes as text. Paste it into a message to share it.', { kind: 'success' });
    return true;
  } catch {
    toast('Could not reach the clipboard. Save a file instead.', { kind: 'warn' });
    return false;
  }
}

/** Adds the brushes in some text (a file's or pasted). Says what happened. */
export function addBrushesFromText(text: string): boolean {
  const r = parseBrushesText(text);
  if (!r.ok) return warn(r.error);
  const { list, added } = addShared(mine, r.presets, () => uid('b'));
  if (!added) return warn(`You have ${MAX_PRESETS} saved brushes already. Delete some to make room.`);
  setMine(list);
  const left = r.skipped ? ` ${r.skipped} could not be read and ${r.skipped === 1 ? 'was' : 'were'} left out.` : '';
  toast(`Added ${added} brush${added === 1 ? '' : 'es'}.${left}`, { kind: 'success' });
  return true;
}

/** Adds brushes that were read from another program's file (GIMP, Photoshop, Krita, Procreate...), in a group of their own. Says how many went in. */
export function addImportedBrushes(items: readonly { name: string; dab: DabBrush }[], group: string): number {
  const incoming = items.map((it) => ({ name: it.name, brush: DEFAULT_BRUSH, pixel: { kind: 'dab' as const, dab: it.dab }, group: cleanGroup(group) }));
  const { list, added } = addShared(mine, incoming, () => uid('b'));
  if (!added) {
    warn(`You have ${MAX_PRESETS} saved brushes already. Delete some to make room.`);
    return 0;
  }
  setMine(list);
  if (added < items.length) toast(`Only ${added} of ${items.length} fitted: you can keep ${MAX_PRESETS} brushes.`, { kind: 'warn' });
  return added;
}

/** What the picker offers: Frameling's own brush files, and the ones other programs make. */
export const BRUSH_FILE_ACCEPT = `.json,application/json,${IMPORT_EXTS.join(',')}`;

export async function addBrushesFromFile(): Promise<boolean> {
  const file = await pickUpload(BRUSH_FILE_ACCEPT);
  if (!file) return false;
  // Frameling's own files are JSON. Anything else is a brush file from another program (or something that isn't a brush).
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    if (file.size > MAX_BRUSHES_BYTES) return warn('That file is too big to be a set of brushes.');
    let text = '';
    try {
      text = await file.text();
    } catch {
      return warn('That file could not be opened.');
    }
    return addBrushesFromText(text);
  }
  const { importBrushFile } = await import('./import/run');
  return importBrushFile(file, addImportedBrushes);
}

export async function addBrushesFromClipboard(): Promise<boolean> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return warn('Could not reach the clipboard. Add a file instead.');
  }
  return addBrushesFromText(text);
}

// ---------------------------------------------------------------- one command per brush

const registered = new Set<string>();
let syncedFor = '';

/** Picking a brush from the palette: use it, and move to the brush tool when the layer can take it. */
export function pickBrushCommand(id: string): void {
  if (!applyPreset(id)) return;
  // A pixel layer's tool was picked for it (see applySpec); on any other layer the Brush is the tool.
  if (currentSide() === 'vector' && store().get().ui.tool !== 'brush') pickTool('brush');
}

/** One palette command per brush ("Brush: Ink"), kept in step with the list. */
export function syncPickCommands(): void {
  const all = everyBrush();
  // A slider drag with "save every change" on saves the brush on every tick; the commands only change with names.
  const signature = all.map((p) => `${p.id}\u0000${p.name}`).join('\u0001');
  if (signature === syncedFor) return;
  syncedFor = signature;
  const keep = new Set(all.map((p) => `brush.pick.${p.id}`));
  for (const id of [...registered]) {
    if (!keep.has(id)) {
      unregisterCommand(id);
      registered.delete(id);
    }
  }
  // The two sides now share some names (Mechanical pencil, Leaves...): the pixel one says so, so the palette never lists two the same.
  const vectorNames = new Set(all.filter((p) => p.tool !== 'pixel').map((p) => p.name.toLowerCase()));
  for (const p of all) {
    const id = `brush.pick.${p.id}`;
    registerCommand({
      id,
      label: `Brush: ${p.name}${p.tool === 'pixel' && vectorNames.has(p.name.toLowerCase()) ? ' (pixels)' : ''}`,
      category: 'Draw',
      description: `Draw with the ${p.name} brush${p.builtin ? ' that comes with Frameling' : ' you saved'}.`,
      help: 'brush-presets',
      keywords: ['brush', 'preset', 'saved brush', 'pen', 'ink', 'marker', 'pencil'],
      run: () => pickBrushCommand(p.id),
    });
    registered.add(id);
  }
}
