// For ?debug pages: the help picture capture and the checks add, open and read notes through this.
import { store } from '../core/store';
import { findNote, goToNote, notesOnCanvas } from './ops';
import { openNote, setNotesSaved } from './state';
import type { CanvasNote } from '../core/format';

export function installNotesDebug(): void {
  (window as unknown as { __framelingNotes: unknown }).__framelingNotes = {
    /** Puts notes straight into the document (one undo step). */
    add: (list: CanvasNote[]) => store().update('Add notes', (d) => void (d.notes ??= []).push(...(list as never[]))),
    open: (id: string) => openNote(id),
    go: (id: string) => goToNote(id),
    show: (on: boolean) => setNotesSaved({ show: on }),
    find: (id: string) => findNote(id),
    onCanvas: () => notesOnCanvas().map((n) => n.id),
  };
}
