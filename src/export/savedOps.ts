// The saved export choices of the open drawing, read and changed through the store (the maths is in saved.ts).
import { uid } from '../core/doc';
import { store } from '../core/store';
import type { DocExports, SavedExport } from '../core/format';
import type { ExportSettings } from './types';
import { plainSettings, withLast, withRenamedWay, withWay, withoutWay } from './saved';

/** The open drawing's saved export choices. */
export const docExports = (): DocExports | undefined => store().get().doc.exports;

function put(label: string, next: DocExports | undefined): void {
  if (next === docExports()) return;
  store().update(label, (d) => {
    if (next) d.exports = next as typeof d.exports;
    else delete d.exports;
  });
}

/** Notes how this drawing was just exported, so Export again repeats it for this drawing. Nothing changes (and nothing is marked unsaved) when it is the same as before. */
export function rememberExport(settings: ExportSettings): void {
  put('Remember export choices', withLast(docExports(), plainSettings(settings)));
}

/** Keeps these choices under a name. The same name updates that way. Null when the name is empty or the drawing already has the most it keeps. */
export function saveWay(name: string, settings: ExportSettings): SavedExport | null {
  const made = withWay(docExports(), name, plainSettings(settings), () => uid('w'));
  if (!made) return null;
  put('Save export choices', made.exports);
  return made.way;
}

export function removeWay(id: string): void {
  put('Remove saved export', withoutWay(docExports(), id));
}

export function renameWay(id: string, name: string): boolean {
  const next = withRenamedWay(docExports(), id, name);
  if (!next) return false;
  put('Rename saved export', next);
  return true;
}
