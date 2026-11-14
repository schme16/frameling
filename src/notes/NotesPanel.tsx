// The Notes panel: every note in the file in reading order. Click one to go to it (its frame, its layer, and it opens),
// tick it off when it is dealt with. The name that goes on your notes lives here too.
import { useState } from 'react';
import { useStore } from '../core/store';
import { Tip } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { byLine, countNotes, noteTitle, onOpenBoard, sortedNotes, whereText } from './model';
import { clearDoneNotes, goToNote, stepNote, tickNote } from './ops';
import { NoteNameField } from './Options';
import { setNotesSaved, useNotesState } from './state';
import './notes.css';

type Filter = 'all' | 'open' | 'done';

export function NotesPanel() {
  const doc = useStore((s) => s.doc);
  const { openId, show } = useNotesState();
  const [filter, setFilter] = useState<Filter>('all');
  const counts = countNotes(doc.notes);
  const list = sortedNotes(doc.notes ?? []).filter((n) => filter === 'all' || (filter === 'done') === !!n.done);
  return (
    <div className="nt-panel" data-testid="notes.panel">
      <Tip>Notes you leave on the canvas stay in this file and never come out in an export. Pick the Notes tool and click the canvas to leave one.</Tip>
      <div className="nt-panel-top">
        <label className="nt-done">
          <input type="checkbox" checked={show} onChange={(e) => setNotesSaved({ show: e.target.checked })} />
          <span>Show notes on the canvas</span>
        </label>
      </div>
      <NoteNameField />
      <div className="nt-filters" role="group" aria-label="Which notes to list">
        {(['all', 'open', 'done'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? `All ${counts.all}` : f === 'open' ? `To do ${counts.open}` : `Done ${counts.done}`}
          </button>
        ))}
      </div>
      <div className="nt-tools">
        <button type="button" disabled={!counts.all} onClick={() => stepNote(-1)}>
          Previous
        </button>
        <button type="button" disabled={!counts.all} onClick={() => stepNote(1)}>
          Next
        </button>
        <button type="button" disabled={!counts.done} onClick={() => clearDoneNotes()} title="Take the ticked-off notes out of the file. Undo brings them back.">
          Remove done
        </button>
      </div>
      {list.length === 0 ? (
        <p className="nt-empty">{counts.all ? 'No notes in this list.' : 'No notes yet.'}</p>
      ) : (
        <ul className="nt-list">
          {list.map((n) => {
            const other = !onOpenBoard(n, doc);
            return (
              <li key={n.id} className={`nt-row${n.done ? ' is-done' : ''}${openId === n.id ? ' is-open' : ''}`}>
                <input type="checkbox" checked={!!n.done} aria-label={`Done: ${noteTitle(n)}`} onChange={(e) => tickNote(n.id, e.target.checked)} />
                <button type="button" className="nt-row-go" onClick={() => goToNote(n.id)} title="Go to this note">
                  <span className="nt-row-text">
                    <Icon name="note" size={12} /> {noteTitle(n)}
                  </span>
                  <span className="nt-row-meta">
                    {[whereText(doc, n), other ? 'on another artboard' : '', byLine(n.by, n.at), n.replies?.length ? `${n.replies.length} answer${n.replies.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' - ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
