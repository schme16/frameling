// Opening, saving and the "unsaved changes?" question, on the page side. The bytes are made and read by file.ts; the
// desktop side (src/main) does the dialogs and the disk.
import { ownedUndo } from '../core/owners';
import { rootDoc } from '../core/symbols';
import { uid } from '../core/doc';
import { store } from '../core/store';
import type { RecentFile } from '../preload/api';
import { baseName, desktop, stripExt } from './desktop';
import { FileProblem, loadFileAsync, saveFileAsync } from './file';
import { notify } from './notify';
import { askSaveInPage, saveAskAvailable } from './saveAsk';
import { thumbnailOf } from './thumb';
import { previewBytes } from './preview';
import { handoverFits } from '../shared/handover';

/** The name to show for the open document: its file name when it has one, else the document's own name. */
export function documentTitle(): string {
  const { ui } = store().get();
  const doc = store().rootDoc();
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

/** Lets go of the drawing the autosave last wrote, so a closed drawing isn't held in memory. */
export function forgetAutosaved(): void {
  lastDoc = null;
}

export async function autosaveNow(): Promise<void> {
  const api = desktop();
  const { ui } = store().get();
  const doc = store().rootDoc();
  if (!api || !ui.dirty || doc === lastDoc) return;
  try {
    const bytes = await saveFileAsync(doc, api.versions.app, new Date(), { reuse: true });
    await api.autosave.write(bytes, { name: doc.name, filePath: ui.filePath, docId: doc.id });
    lastDoc = doc;
  } catch {
    // Try again at the next tick; a failed autosave should never get in the way.
  }
}

export type Handover = { ok: true } | { ok: false; why: 'big' | 'failed' };

/**
 * Writes the unsaved work to the autosave copy right now (whatever the clock says), for a restart to carry across, and
 * says whether it is really there. `big`: too large to hand over as a copy. `failed`: it could not be written.
 */
export async function handOverUnsavedWork(): Promise<Handover> {
  const api = desktop();
  if (!api) return { ok: false, why: 'failed' };
  const { ui } = store().get();
  const doc = store().rootDoc();
  try {
    const bytes = await saveFileAsync(doc, api.versions.app, new Date(), { reuse: true });
    if (!handoverFits(bytes.length)) return { ok: false, why: 'big' };
    if ((await api.autosave.write(bytes, { name: doc.name, filePath: ui.filePath, docId: doc.id })) === false) return { ok: false, why: 'failed' };
    lastDoc = doc;
    return { ok: true };
  } catch {
    return { ok: false, why: 'failed' };
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
    await api.autosave.keep(await thumbnailOf(rootDoc(store().rootDoc())));
  } catch {
    // Putting a copy aside is a bonus. Never stop someone from carrying on.
  }
}

/** Loads file bytes into the app, as if the person had just opened them. Says what went wrong in plain words. */
export async function loadBytes(bytes: Uint8Array, filePath: string | null, opts: { dirty?: boolean; confirm?: boolean } = {}): Promise<boolean> {
  let loaded;
  try {
    loaded = await loadFileAsync(bytes);
  } catch (e) {
    notify(e instanceof FileProblem ? e.message : 'Frameling could not open that file.', 'error');
    return false;
  }
  if (opts.confirm !== false && !(await askAboutUnsavedChanges())) return false;
  store().load(loaded.doc, filePath);
  if (opts.dirty) store().setUi({ dirty: true });
  if (loaded.warnings.length) notify(`Opened, with a few small repairs: ${[...new Set(loaded.warnings)].join(' ')}`, 'warn', undefined, 8000);
  // A drawing that uses a feature that is turned off offers to turn it on (it opens and keeps its data either way).
  void import('../features/prompt').then((m) => m.offerTurnOn(loaded.doc)).catch(() => {});
  // Shapes from a plugin that is off or not installed still show; say so, and offer to turn the plugin on.
  void import('../plugins/docPrompt').then((m) => m.offerPluginsForDoc(loaded.doc)).catch(() => {});
  return true;
}

/**
 * Makes it safe to replace the open document (new, open, restore): when there are unsaved changes it asks "Save
 * changes?" and saves if they say so. Resolves false when they cancel (or the save fails), so the caller stops.
 */
export async function askAboutUnsavedChanges(): Promise<boolean> {
  if (!store().get().ui.dirty) return true;
  const api = desktop();
  const neverSaved = !store().get().ui.filePath;
  let choice: 'save' | 'discard' | 'cancel';
  // Quill's dialog; the system's box only when the page has nowhere to show it.
  if (saveAskAvailable()) choice = await askSaveInPage(documentTitle(), neverSaved);
  else if (api) choice = await api.app.askSaveChanges(documentTitle(), neverSaved);
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
  // Other kinds of file (Aseprite) open through their own opener.
  const other = openers.find((o) => o.test(r.path));
  if (other) {
    await other.open(r.bytes, r.path);
    return;
  }
  if (await loadBytes(r.bytes, r.path)) {
    void api.recent.add(r.path);
    keepPictureIfMissing(r.path);
  }
}

// Other kinds of file that open into a drawing (an Interactives package with its drawing inside), by path.
const openers: { test: (path: string) => boolean; open: (bytes: Uint8Array, path: string) => Promise<boolean> }[] = [];

export function registerOpener(test: (path: string) => boolean, open: (bytes: Uint8Array, path: string) => Promise<boolean>): void {
  const o = { test, open };
  openers.push(o);
  ownedUndo(() => {
    const i = openers.indexOf(o);
    if (i >= 0) openers.splice(i, 1);
  });
}

/** Ways to take over Save: `instead` runs when the drawing has no file yet (resolve null to carry on as usual); `after` runs once a save worked. */
export interface SaveHook {
  instead?: () => Promise<boolean | null>;
  after?: (doc: import('../core/format').Doc, path: string) => Promise<void>;
}
const saveHooks: SaveHook[] = [];

export function registerSaveHook(h: SaveHook): void {
  saveHooks.push(h);
  ownedUndo(() => {
    const i = saveHooks.indexOf(h);
    if (i >= 0) saveHooks.splice(i, 1);
  });
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
  let other = openers.find((o) => o.test(r.path));
  if (!other) {
    // A kind of file that belongs to a feature kept out of sight for now: say so plainly instead of failing oddly.
    const { explainHiddenFile } = await import('../features/prompt');
    if (explainHiddenFile(r.path, baseName(r.path))) return false;
    // A kind of file that needs a feature that is turned off: offer to turn it on, then open it.
    const [{ offFeatureOpening }, { offerTurnOnForFile }] = await Promise.all([import('../features/host'), import('../features/prompt')]);
    const feature = offFeatureOpening(r.path);
    if (feature && (await offerTurnOnForFile(feature, baseName(r.path)))) other = openers.find((o) => o.test(r.path));
  }
  if (other) return other.open(r.bytes, r.path);
  const ok = await loadBytes(r.bytes, r.path);
  if (ok) {
    void api.recent.add(r.path);
    keepPictureIfMissing(r.path);
  }
  return ok;
}

/**
 * A file saved by an older Frameling has no little picture inside. Now that it is open there is one to make, kept in
 * the app's own folder (the file itself is never changed by opening it), so Open recent can show it from now on.
 */
export function keepPictureIfMissing(path: string): void {
  const api = desktop();
  if (!api?.recent.preview || !api.recent.keepPreview) return;
  const doc = store().rootDoc();
  // After a pause, so opening is never slowed by it.
  window.setTimeout(() => {
    void (async () => {
      try {
        const had = await api.recent.preview!(path);
        if (had.state !== 'none' || store().get().ui.filePath !== path) return;
        const png = await previewBytes(rootDoc(doc));
        if (png) await api.recent.keepPreview!(path, png);
      } catch {
        // A picture is a bonus.
      }
    })();
  }, 1500);
}

/** Saves to the document's file, or asks where when it has none yet. Resolves true when it is saved. */
export async function saveDocument(): Promise<boolean> {
  if (!store().get().ui.filePath) {
    for (const h of saveHooks) {
      const r = await h.instead?.();
      if (r !== null && r !== undefined) return r;
    }
  }
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
    // While a tile is open for editing, the file gets the whole document with the tile as it is now.
    const doc = store().rootDoc();
    // Save as on a drawing that already has a file makes a separate copy, so the copy gets its own id (and its own
    // version history). The original keeps its id and history.
    const oldPath = store().get().ui.filePath;
    const copyId = path === null && oldPath ? uid('d') : null;
    let bytes: Uint8Array;
    // The little picture that goes inside the file, for Open recent. Never a reason not to save.
    const preview = await previewBytes(rootDoc(doc), store().get().ui.frame);
    try {
      bytes = await saveFileAsync(copyId ? { ...doc, id: copyId } : doc, api.versions.app, new Date(), { preview });
    } catch {
      notify("Something went wrong while packing up your drawing, so it wasn't saved. Please try again.", 'error');
      return false;
    }
    let r = await api.files.save({ bytes, path, suggestedName: path ? stripExt(baseName(path)) : doc.name });
    if (!r) return false;
    // Saved as over the same file after all: that's a plain save, so it keeps the drawing's own id.
    if (copyId && !('error' in r) && r.path === oldPath) r = await api.files.save({ bytes: await saveFileAsync(doc, api.versions.app, new Date(), { preview }), path: r.path, suggestedName: doc.name });
    if (!r) return false;
    if ('error' in r) {
      notify(r.error, 'error');
      return false;
    }
    // If they kept drawing while the file was being written, the newest changes aren't in it yet.
    const unchanged = store().rootDoc() === doc;
    if (copyId && r.path !== oldPath) store().setDocId(copyId);
    if (unchanged) store().markSaved(r.path);
    else store().setUi({ filePath: r.path });
    void clearAutosaveCopy();
    // Whatever was set aside for this drawing is in the file now.
    void api.autosave.removeKept(doc.id).catch(() => undefined);
    notify('Saved.', 'success', undefined, 1600);
    const saved = copyId && r.path !== oldPath ? store().rootDoc() : doc;
    for (const h of saveHooks) void h.after?.(saved, r.path)?.catch(() => undefined);
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
