// Opening, saving and the "unsaved changes?" question, on the page side. The bytes are made and read by file.ts; the
// desktop side (src/main) does the dialogs and the disk.
import { rootDoc } from '../core/symbols';
import { store } from '../core/store';
import type { RecentFile } from '../preload/api';
import { baseName, desktop, stripExt } from './desktop';
import { FileProblem, loadFile, saveFile } from './file';
import { notify } from './notify';
import { thumbnailOf } from './thumb';

/** The name to show for the open document: its file name when it has one, else the document's own name. */
export function documentTitle(): string {
  const { doc, ui } = store().get();
  return ui.filePath ? stripExt(baseName(ui.filePath)) : doc.name || 'Untitled';
}

export async function clearAutosaveCopy(): Promise<void> {
  try {
    await desktop()?.autosave.clear();
  } catch {
    // Nothing to clear is fine.
  }
}

let lastDoc: unknown = null;

export async function autosaveNow(): Promise<void> {
  const api = desktop();
  const { doc, ui } = store().get();
  if (!api || !ui.dirty || doc === lastDoc) return;
  try {
    const bytes = saveFile(doc, api.versions.app);
    await api.autosave.write(bytes, { name: doc.name, filePath: ui.filePath, docId: doc.id });
    lastDoc = doc;
  } catch {
    // Try again at the next tick; a failed autosave should never get in the way.
  }
}

/**
 * Puts the unsaved work aside for a week (File > Recover unsaved work...) instead of throwing it away. Makes sure the
 * autosave copy is current first. Quietly does nothing when there is nothing unsaved.
 */
export async function keepUnsavedWork(): Promise<void> {
  const api = desktop();
  if (!api || !store().get().ui.dirty) return;
  try {
    await autosaveNow();
    await api.autosave.keep(await thumbnailOf(rootDoc(store().get().doc)));
  } catch {
    // Putting a copy aside is a bonus. Never stop someone from carrying on.
  }
}

/** Loads file bytes into the app, as if the person had just opened them. Says what went wrong in plain words. */
export async function loadBytes(bytes: Uint8Array, filePath: string | null, opts: { dirty?: boolean; confirm?: boolean } = {}): Promise<boolean> {
  let loaded;
  try {
    loaded = loadFile(bytes);
  } catch (e) {
    notify(e instanceof FileProblem ? e.message : 'Frameling could not open that file.', 'error');
    return false;
  }
  if (opts.confirm !== false && !(await askAboutUnsavedChanges())) return false;
  store().load(loaded.doc, filePath);
  if (opts.dirty) store().setUi({ dirty: true });
  if (loaded.warnings.length) notify(`Opened, with a few small repairs: ${[...new Set(loaded.warnings)].join(' ')}`, 'warn', undefined, 8000);
  return true;
}

/**
 * Makes it safe to replace the open document (new, open, restore): when there are unsaved changes it asks "Save
 * changes?" and saves if they say so. Resolves false when they cancel (or the save fails), so the caller stops.
 */
export async function askAboutUnsavedChanges(): Promise<boolean> {
  if (!store().get().ui.dirty) return true;
  const api = desktop();
  let choice: 'save' | 'discard' | 'cancel';
  if (api) choice = await api.app.askSaveChanges(documentTitle());
  else choice = window.confirm(`"${documentTitle()}" has changes that aren't saved. Throw them away?`) ? 'discard' : 'cancel';
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveDocument();
  // They chose to let the changes go. The work waits a week in Recover unsaved work..., then the autosave itself goes.
  await keepUnsavedWork();
  await clearAutosaveCopy();
  return true;
}

/** Open dialog, then open the file it picked. */
export async function openDocument(): Promise<void> {
  const api = desktop();
  if (!api) return notify('Opening files works in the Frameling desktop app.', 'info');
  const r = await api.files.open();
  if (!r) return;
  if ('error' in r) return notify(r.error, 'error');
  if (await loadBytes(r.bytes, r.path)) void api.recent.add(r.path);
}

/** Opens a file we already know the path of (recent files, double-click, command line). */
export async function openPath(path: string): Promise<boolean> {
  const api = desktop();
  if (!api) return false;
  const r = await api.files.read(path);
  if ('error' in r) {
    notify(r.error, 'error');
    void api.recent.remove(path);
    return false;
  }
  const ok = await loadBytes(r.bytes, r.path);
  if (ok) void api.recent.add(r.path);
  return ok;
}

/** Saves to the document's file, or asks where when it has none yet. Resolves true when it is saved. */
export async function saveDocument(): Promise<boolean> {
  return saveTo(store().get().ui.filePath);
}

/** Always asks where to save. */
export async function saveDocumentAs(): Promise<boolean> {
  return saveTo(null);
}

let saving = false;

async function saveTo(path: string | null): Promise<boolean> {
  const api = desktop();
  if (!api) {
    notify('Saving works in the Frameling desktop app.', 'info');
    return false;
  }
  if (saving) return false;
  saving = true;
  try {
    const doc = store().get().doc;
    let bytes: Uint8Array;
    try {
      bytes = saveFile(doc, api.versions.app);
    } catch {
      notify("Something went wrong while packing up your drawing, so it wasn't saved. Please try again.", 'error');
      return false;
    }
    const r = await api.files.save({ bytes, path, suggestedName: path ? stripExt(baseName(path)) : doc.name });
    if (!r) return false;
    if ('error' in r) {
      notify(r.error, 'error');
      return false;
    }
    // If they kept drawing while the file was being written, the newest changes aren't in it yet.
    if (store().get().doc === doc) store().markSaved(r.path);
    else store().setUi({ filePath: r.path });
    void clearAutosaveCopy();
    // Whatever was set aside for this drawing is in the file now.
    void api.autosave.removeKept(doc.id).catch(() => undefined);
    notify('Saved.', 'success', undefined, 1600);
    return true;
  } finally {
    saving = false;
  }
}

// ---------------------------------------------------------------- recent files

export async function listRecentFiles(): Promise<RecentFile[]> {
  try {
    return (await desktop()?.recent.list()) ?? [];
  } catch {
    return [];
  }
}

export async function clearRecentFiles(): Promise<void> {
  await desktop()?.recent.clear();
}
