/**
 * Saved selections, the doing side: keep the selection under a name, bring it back (instead of, added to, or taken from
 * the one there now), rename and delete. Each is an undo step on the document, since the list is saved in the file.
 * The pure side (the file form, names) is in saved.ts; the list you see is SavedDialog.tsx.
 */
import type { Id, SavedSelection } from '../core/format';
import { findLayer, uid } from '../core/doc';
import { registerCommands, registerHelp } from '../core/registry';
import { say } from '../core/reasons';
import { store, type State } from '../core/store';
import { existingSelection } from '../core/followSelection';
import { toast } from '../ui/toast';
import { activeLayer } from '../tools/edit';
import { combineMasks, maskCount, resizeMask, type SelectOp } from './mask';
import { activePixelGrid, isFloating, dropFloating, pixelSelection, setPixelSelection } from './pixel-state';
import { cleanName, freeName, maskOf, MAX_SAVED, savePixels, saveShapes } from './saved';

export const savedList = (s: State = store().get()): readonly SavedSelection[] => s.doc.selections ?? [];

const hasPixels = (): boolean => !!activePixelGrid() && !!pixelSelection();
const hasShapes = (s: State): boolean => activeLayer().layer?.kind === 'vector' && s.ui.selection.length > 0;
export const canSave = (s: State): boolean => hasPixels() || hasShapes(s);

/** Keeps what is selected now. Returns the new entry, or null (with a word) when there is nothing to keep. */
export function saveSelection(name: string): SavedSelection | null {
  const s = store().get();
  const list = savedList(s);
  if (list.length >= MAX_SAVED) {
    toast(`A document keeps up to ${MAX_SAVED} saved selections. Delete one you don't need first.`);
    return null;
  }
  const taken = list.map((x) => x.name);
  const nm = freeName(taken, name.trim() ? name : '');
  const grid = activePixelGrid();
  let entry: SavedSelection | null = null;
  if (grid) {
    const m = pixelSelection();
    if (m) entry = savePixels(uid('sel'), nm, m);
  } else if (hasShapes(s)) entry = saveShapes(uid('sel'), nm, s.ui.activeLayerId, s.ui.selection);
  if (!entry) {
    toast('Select something first (pixels with the Select tool, or shapes on a vector layer), then save it.');
    return null;
  }
  const made = entry;
  store().update('Save selection', (d) => {
    (d.selections ??= []).push(made as never);
  });
  toast(`Saved the selection as "${made.name}".`, { kind: 'success' });
  return made;
}

/** What a load did, in words the card can show. */
export type LoadResult = { ok: true; note?: string } | { ok: false; why: string };

/** Brings a saved selection back. `how` is what it does to the selection already there (pixels only). */
export function loadSelection(id: Id, how: SelectOp = 'replace'): LoadResult {
  const s = store().get();
  const saved = savedList(s).find((x) => x.id === id);
  if (!saved) return { ok: false, why: 'That selection is not in this document any more.' };
  if (saved.kind === 'shapes') {
    const layer = saved.layerId ? findLayer(s.doc, saved.layerId) : null;
    if (!layer || layer.kind !== 'vector') return { ok: false, why: 'The layer those shapes were on is gone.' };
    const keep = existingSelection(s.doc, layer.id, s.ui.frame, saved.ids);
    if (!keep.length) return { ok: false, why: 'Those shapes are not on this frame any more.' };
    const have = s.ui.activeLayerId === layer.id ? s.ui.selection : [];
    const next = how === 'add' ? [...new Set([...have, ...keep])] : how === 'subtract' ? have.filter((x) => !keep.includes(x)) : how === 'intersect' ? have.filter((x) => keep.includes(x)) : keep;
    store().setUi({ activeLayerId: layer.id, selection: next });
    return { ok: true, ...(keep.length < saved.ids.length ? { note: `${saved.ids.length - keep.length} of the shapes are gone, so the rest came back.` } : {}) };
  }
  const grid = activePixelGrid();
  if (!grid) return { ok: false, why: 'Pick a pixel layer first: this selection is made of pixels.' };
  const m = maskOf(saved);
  if (!m) return { ok: false, why: 'That saved selection could not be read.' };
  const fitted = resizeMask(m, grid.width, grid.height);
  if (isFloating()) dropFloating();
  const next = combineMasks(pixelSelection(), fitted, how);
  if (!maskCount(next)) {
    setPixelSelection(null);
    return { ok: true, note: 'Nothing is left selected.' };
  }
  setPixelSelection(next);
  const sized = saved.width !== grid.width || saved.height !== grid.height;
  return { ok: true, ...(sized ? { note: `It was saved on a ${saved.width} x ${saved.height} drawing and this one is ${grid.width} x ${grid.height}, so it sits at the top left.` } : {}) };
}

export function renameSelection(id: Id, name: string): void {
  const nm = cleanName(name);
  if (!nm) return;
  store().update('Rename saved selection', (d) => {
    const e = d.selections?.find((x) => x.id === id);
    if (e) e.name = nm;
  });
}

export function deleteSelection(id: Id): void {
  store().update('Delete saved selection', (d) => {
    if (!d.selections) return;
    d.selections = d.selections.filter((x) => x.id !== id);
    if (!d.selections.length) delete d.selections;
  });
}

const needSomething = say('Select something first: pixels with the Select tool, or shapes on a vector layer.');

registerCommands([
  {
    id: 'select.save',
    label: 'Save the selection...',
    category: 'Edit',
    description: 'Give what is selected a name, so you can bring it back later, even after you have picked something else or reopened the file.',
    help: 'saved-selections',
    keywords: ['save selection', 'name selection', 'keep selection', 'remember selection', 'store selection', 'alpha channel', 'selection set'],
    enabled: canSave,
    reason: needSomething,
    run: () => void import('./SavedDialog').then((m) => m.openSavedDialog(true)),
  },
  {
    id: 'select.saved',
    label: 'Saved selections...',
    category: 'Edit',
    description: 'The selections you have named in this document: bring one back, add it to the current selection, take it away, rename it or delete it.',
    help: 'saved-selections',
    keywords: ['load selection', 'saved selection', 'restore selection', 'selection list', 'recall selection', 'selection set', 'channels'],
    run: () => void import('./SavedDialog').then((m) => m.openSavedDialog(false)),
  },
]);

registerHelp({
  id: 'saved-selections',
  title: 'Name a selection and bring it back',
  section: 'Drawing',
  media: 'saved-selections.png',
  summary: 'Give a selection a name, then bring it back whenever you like: a character\'s hair, the sky, three shapes you keep picking.',
  keywords: ['name selection', 'keep selection', 'remember selection', 'restore selection', 'recall selection', 'selection set', 'channel', 'alpha channel', 'store selection'],
});
