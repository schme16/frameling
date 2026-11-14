// The commands for notes on the canvas: leave one, show or hide them all, step through them, tick them off.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { getView, getViewport } from '../canvas/controller';
import { notify } from '../io/notify';
import { clearDoneNotes, findNote, leaveNoteAt, stepNote, tickNote } from './ops';
import { getNotesState, setNotesSaved } from './state';

const HELP = 'canvas-notes';
const anyNotes = (s: ReturnType<ReturnType<typeof store>['get']>) => !!s.doc.notes?.length;

registerCommands([
  {
    id: 'notes.add',
    label: 'Add a note in the middle of the view',
    category: 'View',
    description: 'Leaves a note in the middle of what you can see, ready to type in. The Notes tool does the same where you click.',
    help: HELP,
    keywords: ['note', 'notes', 'comment', 'annotation', 'remark', 'sticky', 'review', 'feedback', 'leave a note'],
    run: () => {
      const v = getView();
      const vp = getViewport();
      leaveNoteAt((vp.w / 2 - v.panX) / v.zoom, (vp.h / 2 - v.panY) / v.zoom);
    },
  },
  {
    id: 'notes.toggleShow',
    label: 'Notes',
    category: 'View',
    keys: ['Mod+Alt+N'],
    description: 'Show or hide every note on the canvas. They stay in the file, and are never in an export either way.',
    help: HELP,
    keywords: ['notes', 'show notes', 'hide notes', 'comments', 'annotations', 'markers'],
    checked: () => getNotesState().show,
    run: () => {
      setNotesSaved({ show: !getNotesState().show });
      store().setUi({});
    },
  },
  {
    id: 'notes.hideDone',
    label: 'Hide notes that are done',
    category: 'View',
    description: 'Keeps ticked-off notes out of sight on the canvas, so only what is left to do shows. They stay in the file and in the Notes panel.',
    help: HELP,
    keywords: ['notes', 'done', 'finished', 'resolved', 'hide done'],
    checked: () => getNotesState().hideDone,
    run: () => {
      setNotesSaved({ hideDone: !getNotesState().hideDone });
      store().setUi({});
    },
  },
  {
    id: 'notes.next',
    label: 'Next note',
    category: 'View',
    description: 'Goes to the next note: its frame, its layer, and opens it. Keeps going round.',
    help: HELP,
    keywords: ['notes', 'next', 'go to note', 'review', 'work through'],
    enabled: anyNotes,
    run: () => void stepNote(1),
  },
  {
    id: 'notes.previous',
    label: 'Previous note',
    category: 'View',
    description: 'Goes back to the note before this one.',
    help: HELP,
    keywords: ['notes', 'previous', 'back', 'go to note', 'review'],
    enabled: anyNotes,
    run: () => void stepNote(-1),
  },
  {
    id: 'notes.toggleDone',
    label: 'Tick off the open note',
    category: 'View',
    description: 'Marks the note you have open as done, or brings it back if it already was.',
    help: HELP,
    keywords: ['notes', 'done', 'tick', 'resolve', 'finished', 'complete'],
    enabled: () => !!findNote(getNotesState().openId)?.text,
    run: () => {
      const n = findNote(getNotesState().openId);
      if (n) tickNote(n.id, !n.done);
    },
  },
  {
    id: 'notes.clearDone',
    label: 'Remove the notes that are done',
    category: 'View',
    description: 'Takes every ticked-off note out of the file, once the pass is finished. Undo brings them back.',
    help: HELP,
    keywords: ['notes', 'clear', 'delete', 'remove', 'done', 'tidy'],
    enabled: (s) => !!s.doc.notes?.some((n) => n.done),
    run: () => {
      const n = clearDoneNotes();
      if (n) notify(`Removed ${n} finished note${n === 1 ? '' : 's'}. Undo brings them back.`, 'info');
    },
  },
]);
