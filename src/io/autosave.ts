// Autosave: every minute, when there are unsaved changes, a copy goes to the app's own folder (never over the
// person's file). If the app is closed the hard way, the next start offers to bring that copy back.
import { store } from '../core/store';
import { desktop } from './desktop';
import { clearAutosaveCopy, documentTitle, loadBytes, openPath, saveDocument } from './document';
import { loadFile, saveFile } from './file';
import { notify } from './notify';

export const AUTOSAVE_EVERY_MS = 60_000;

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

/** Offers the autosaved copy back when it is newer than the saved file (or the work was never saved). */
export async function offerRecovery(): Promise<void> {
  const api = desktop();
  if (!api) return;
  const found = await api.autosave.read();
  if (!found) return;
  // The saved file was changed after the copy was made, so the copy is old news.
  if (found.fileModifiedAt !== null && found.fileModifiedAt >= found.savedAt) {
    await clearAutosaveCopy();
    return;
  }
  try {
    loadFile(found.bytes);
  } catch {
    await clearAutosaveCopy();
    return;
  }
  notify(
    'We kept a copy of your unsaved work. Restore it?',
    'info',
    {
      label: 'Restore',
      run: () => {
        void loadBytes(found.bytes, found.meta.filePath, { dirty: true });
      },
    },
    30_000,
  );
}

/** Wires everything that runs for the life of the app: autosave, the title bar, opening files from outside, closing. */
export function startFileServices(): void {
  const api = desktop();
  if (!api) return;

  setInterval(() => void autosaveNow(), AUTOSAVE_EVERY_MS);

  // Title bar and the desktop side's idea of "is there anything unsaved".
  let last = '';
  const sync = () => {
    const { ui } = store().get();
    const name = documentTitle();
    document.title = `${ui.dirty ? '● ' : ''}${name} - Frameling`;
    const key = `${ui.dirty}|${name}|${ui.filePath}`;
    if (key === last) return;
    last = key;
    api.app.setDocumentState({ dirty: ui.dirty, name, filePath: ui.filePath });
  };
  sync();
  // The store swaps its whole object when the document changes, so subscribing is cheap to filter.
  store().subscribe(sync);

  api.app.onOpenFile((p) => void openPath(p));
  api.app.onSaveBeforeClose(() => saveDocument());

  void (async () => {
    const file = await api.app.getLaunchFile();
    if (file) await openPath(file);
    await offerRecovery();
  })();
}
