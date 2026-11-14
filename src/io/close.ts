// Close drawing: puts the open drawing away and brings back the start screen, with everything as a new window has it.
import { newDoc } from '../core/doc';
import { store } from '../core/store';
import { resetTl } from '../timeline/state';
import { openSheet } from '../ui/overlays';
import { desktop } from './desktop';
import { askAboutUnsavedChanges, clearAutosaveCopy, forgetAutosaved } from './document';

/**
 * Asks about unsaved work the same way the window button, New and Open do (Save, Don't save, Cancel), then swaps in a
 * fresh drawing and opens the welcome sheet, whatever Show welcome says. Resolves false when they cancel.
 */
export async function closeDrawing(): Promise<boolean> {
  if (!(await askAboutUnsavedChanges())) return false;
  const path = store().get().ui.filePath;
  // The drawing waits in Open recent. A save or an open already put it there; this moves it to the top.
  if (path) void desktop()?.recent.add(path);
  // load() gives a new window's history, selection, playhead, zoom, onion skin and file; the rest lives outside the store.
  store().load(newDoc());
  resetTl();
  forgetAutosaved();
  await clearAutosaveCopy();
  openSheet('welcome');
  return true;
}
