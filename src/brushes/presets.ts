// The brushes you have saved: where they live, and everything you can do to them. The rules are in model.ts. Yours are
// kept in the browser's storage under `frameling.brushPresets`, so the settings backup carries them too.
import { useSyncExternalStore } from 'react';
import { currentChoice, registerChoice } from '../core/choices';
import { findLayer, uid } from '../core/doc';
import type { BrushSettings } from '../core/format';
import { registerCommand, unregisterCommand } from '../core/registry';
import { store } from '../core/store';
import { download, pickUpload } from '../platform';
import { pickTool } from '../tools/pick';
import { toast } from '../ui/toast';
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
  parseBrushesText,
  presetState,
  renamePreset,
  sameBrush,
  sanitizeList,
  savePreset,
  stepPreset,
  updatePreset,
  type BrushPreset,
  type PresetState,
} from './model';
import { noteRecent, toggleFavourite } from './picker';
import './help';
import { choiceWord } from '../words/choices';

const KEY = 'frameling.brushPresets';

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
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify({ version: 1, presets: mine.map((p) => (p.group ? { id: p.id, name: p.name, tool: p.tool, brush: p.brush, group: p.group } : { id: p.id, name: p.name, tool: p.tool, brush: p.brush })) }));
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
export function activeOwn(): BrushPreset | undefined {
  const { activeId } = currentBrushState();
  return mine.find((p) => p.id === activeId);
}

/** Uses a brush: its settings go to the brush in use. */
export function applyPreset(id: string): boolean {
  const p = everyBrush().find((x) => x.id === id);
  if (!p) return false;
  pickedId = p.id;
  store().setUi({ brush: { ...p.brush } });
  noteRecent(p.id);
  emit();
  return true;
}

/** Saves the brush in use under a name. Returns the brush saved, or null if the name was empty or the list was full. */
export function saveCurrentAs(name: string, group?: string): BrushPreset | null {
  const r = savePreset(mine, name, store().get().ui.brush, uid('b'), group);
  if (!r) {
    toast(name.trim() ? `You have ${MAX_PRESETS} saved brushes already. Delete one to make room.` : 'Give the brush a name first.', { kind: 'warn' });
    return null;
  }
  setMine(r.list);
  pickedId = r.preset.id;
  noteRecent(r.preset.id);
  naming = null;
  toast(r.replaced ? `Updated "${r.preset.name}" with this brush.` : `Saved "${r.preset.name}". Find it in the brush picker at the top of the brush options.`, { kind: 'success' });
  emit();
  return r.preset;
}

/** Puts the brush in use into the lit saved brush. */
export function updateActive(): boolean {
  const own = activeOwn();
  if (!own) return false;
  setMine(updatePreset(mine, own.id, store().get().ui.brush));
  toast(`Updated "${own.name}".`, { kind: 'success' });
  return true;
}

/** Back to how the lit brush was saved, undoing the changes since. */
export function revertActive(): boolean {
  const p = everyBrush().find((x) => x.id === currentBrushState().activeId);
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
  if (pickedId === own.id) pickedId = null;
  toast(`Deleted "${own.name}".`, {
    action: {
      label: 'Undo',
      run: () => {
        if (mine.some((p) => p.id === own.id)) return;
        const list = [...mine];
        list.splice(Math.min(at, list.length), 0, own);
        setMine(list);
        pickedId = own.id;
        emit();
      },
    },
  });
  return true;
}

/** Stars the lit brush, or takes the star off. Says what happened. */
export function toggleActiveFavourite(): boolean {
  const p = everyBrush().find((x) => x.id === currentBrushState().activeId);
  if (!p) return warn('Pick or save a brush first, then star it.');
  const on = toggleFavourite(p.id);
  toast(on ? `"${p.name}" is in your Favourites.` : `"${p.name}" is out of your Favourites.`, { duration: 1600 });
  return on;
}

/** Moves to the next (or previous) brush in the row. */
export function stepBrush(by: 1 | -1): void {
  const p = stepPreset(everyBrush(), currentBrushState().activeId, by);
  if (p && applyPreset(p.id)) toast(p.name, { duration: 1400 });
}

/** The pure part of "save every change": the brush a saved brush should become, or null to leave it. */
export function followTarget(edits: BrushEdits, own: BrushPreset | undefined, brush: BrushSettings): BrushSettings | null {
  if (edits !== 'follow' || !own || sameBrush(own.brush, brush)) return null;
  return { ...brush };
}

/** Starts saving changes into the picked brush when "Changing a saved brush" says so. Called once, at launch. */
export function startBrushPresets(): () => void {
  syncPickCommands();
  const s = store();
  let last = s.get().ui.brush;
  return s.subscribe(() => {
    const now = s.get().ui.brush;
    if (now === last) return;
    last = now;
    const own = mine.find((p) => p.id === pickedId);
    const to = followTarget(currentChoice<BrushEdits>('brushes.edits'), own, now);
    if (own && to) setMine(updatePreset(mine, own.id, to));
    else emit();
  });
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

export async function addBrushesFromFile(): Promise<boolean> {
  const file = await pickUpload('.json,application/json');
  if (!file) return false;
  if (file.size > MAX_BRUSHES_BYTES) return warn('That file is too big to be a set of brushes.');
  let text = '';
  try {
    text = await file.text();
  } catch {
    return warn('That file could not be opened.');
  }
  return addBrushesFromText(text);
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
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (ui.tool !== 'brush' && (!layer || layer.kind === 'vector')) pickTool('brush');
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
  for (const p of all) {
    const id = `brush.pick.${p.id}`;
    registerCommand({
      id,
      label: `Brush: ${p.name}`,
      category: 'Draw',
      description: `Draw with the ${p.name} brush${p.builtin ? ' that comes with Frameling' : ' you saved'}.`,
      help: 'brush-presets',
      keywords: ['brush', 'preset', 'saved brush', 'pen', 'ink', 'marker', 'pencil'],
      run: () => pickBrushCommand(p.id),
    });
    registered.add(id);
  }
}
