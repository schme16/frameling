// Notes on the canvas: little notes for yourself or whoever opens the file next. They are saved in the .frameling file
// and never reach an export. See model.ts (the logic, and `withoutNotes`), ops.ts (changing them), NotesLayer.tsx (the
// markers and the open card), tool.ts, NotesPanel.tsx and docs/notes.md.
import './choices';
import './commands';
import './tool';
import './help';
import { registerPanel } from '../core/registry';
import { lazyPanel } from '../core/lazy';

registerPanel({
  id: 'notes',
  title: 'Notes',
  icon: 'note',
  component: lazyPanel(() => import('./NotesPanel').then((m) => m.NotesPanel)),
  zone: 'right',
  order: 45,
  help: 'canvas-notes',
});

// With ?debug in the page address, notes can be added and opened from the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  void import('./debug').then((m) => m.installNotesDebug());
}
