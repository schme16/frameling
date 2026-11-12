// Autosave: every minute, when there are unsaved changes, a copy goes to the app's own folder (never over the
// person's file). If the app is closed the hard way, the next start offers to bring that copy back.
import { store } from '../core/store';
import { isWeb } from '../platform';
import { desktop } from './desktop';
import { autosaveNow, clearAutosaveCopy, documentTitle, keepUnsavedWork, loadBytes, openPath, saveDocument } from './document';
import { loadFile } from './file';
import { notify } from './notify';
import { closeSheet, overlays } from '../ui/overlays';
import { recovery, restorePending } from './recovery';

export { autosaveNow };

export const AUTOSAVE_EVERY_MS = 60_000;
/** A browser tab is closed more easily than an app, so the web build keeps its copy fresher. */
export const WEB_AUTOSAVE_EVERY_MS = 15_000;

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
  const restore = () => {
    // The welcome sheet may be up on start; get it out of the way so the work is right there.
    closeSheet();
    void loadBytes(found.bytes, found.meta.filePath, { dirty: true });
  };
  recovery.set({ name: found.meta.name || 'Untitled', savedAt: found.savedAt, restore });
  // The welcome sheet shows it as a card. Without the sheet, a toast asks.
  if (overlays.get().sheet) return;
  notify(
    'We kept a copy of your unsaved work. Restore it?',
    'info',
    {
      label: 'Restore',
      id: 'restore',
      run: restorePending,
    },
    30_000,
  );
}

/** Wires everything that runs for the life of the app: autosave, the title bar, opening files from outside, closing. */
export function startFileServices(): void {
  const api = desktop();
  if (!api) return;

  setInterval(() => void autosaveNow(), isWeb() ? WEB_AUTOSAVE_EVERY_MS : AUTOSAVE_EVERY_MS);
  // Also when the window is hidden (another tab, minimised), as a browser tab can be closed without asking.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosaveNow();
  });

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
  api.app.onKeepUnsaved(() => keepUnsavedWork());

  void (async () => {
    const file = await api.app.getLaunchFile();
    if (file) await openPath(file);
    await offerRecovery();
  })();
}
