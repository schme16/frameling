// Notices the first real drawing, so the 60-second lesson stops being pinned to the top of the Welcome sheet.
import { store } from '../core/store';
import { getPrefs, setPrefs } from './prefs';
import { isBlankDoc } from './presets';
import { toast } from './toast';

/** Starts watching (nothing to do once it has happened). Returns a way to stop. */
export function watchFirstDrawing(): () => void {
  if (getPrefs().firstDrawn) return () => {};
  const off = store().subscribe(() => {
    const s = store().get();
    // Only edits count: opening an example or a file is not drawing.
    if (!s.ui.dirty || isBlankDoc(s.doc)) return;
    setPrefs({ firstDrawn: true });
    off();
    // They have met the explanations once by now: offer to fold them away, and say how to bring them back.
    if (getPrefs().showExplanations) {
      toast('The little explanations can fold away behind the ? icons once you know your way round. Bring them back from View, Show the explanations.', {
        duration: 12000,
        action: { label: 'Tuck them away', id: 'explanations-away', run: () => setPrefs({ showExplanations: false }) },
        decline: { label: 'Keep them', id: 'explanations-keep', run: () => {} },
      });
    }
  });
  return off;
}
