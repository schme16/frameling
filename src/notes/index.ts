// Notes on the canvas: little notes for yourself or whoever opens the file next. They are saved in the .frameling file
// and never reach an export. See model.ts (the logic, and `withoutNotes`), ops.ts (changing them), NotesLayer.tsx (the
// markers and the open card), tool.ts, NotesPanel.tsx and docs/notes.md. Marks drawn over the picture (arrows, circles,
// a sketch, a few words) are the same idea with a pen: marks.ts is their logic, MarksLayer.tsx draws them, marksTool.ts
// makes them, and `withoutNotes` takes them out of every export too.
import './choices';
import './commands';
import './tool';
import './help';
import './marksChoices';
import './marksCommands';
import './marksTool';
import './marksHelp';
import { registerPanel } from '../core/registry';
import { lazyPanel } from '../core/lazy';
import { registerQuietFamily } from '../ui/palette';

// Notes and marks are for reviewing: they say "erase", "circle" and "draw" too, but they are not what somebody means by
// "rub out" or "draw a circle". They step back for ordinary drawing words and come forward for their own.
registerQuietFamily({
  has: (c) => /^(notes|marks)\./.test(c.id) || c.id === 'tools.marks' || c.id === 'tools.notes',
  words: ['note', 'notes', 'mark', 'marks', 'markup', 'annotate', 'annotation', 'annotations', 'comment', 'comments', 'review', 'feedback', 'redline', 'highlight', 'arrow', 'arrows', 'scribble', 'sticky', 'remark'],
  quiet: () => true,
});

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
