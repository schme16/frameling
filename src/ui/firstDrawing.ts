// Notices the first real drawing, so the 60-second lesson stops being pinned to the top of the Welcome sheet.
import { store } from '../core/store';
import { getPrefs, setPrefs } from './prefs';
import { isBlankDoc } from './presets';

/** Starts watching (nothing to do once it has happened). Returns a way to stop. */
export function watchFirstDrawing(): () => void {
  if (getPrefs().firstDrawn) return () => {};
  const off = store().subscribe(() => {
    const s = store().get();
    // Only edits count: opening an example or a file is not drawing.
    if (!s.ui.dirty || isBlankDoc(s.doc)) return;
    setPrefs({ firstDrawn: true });
    off();
  });
  return off;
}
