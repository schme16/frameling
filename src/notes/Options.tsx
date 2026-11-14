// The Notes tool's options: where new notes belong, whether notes show, and the name that goes on yours.
import { ActionButton, Choice, Field, Tip, Toggle } from '../canvas/controls';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { countNotes } from './model';
import { stepNote } from './ops';
import { setNotesSaved, useNotesState } from './state';
import type { PinChoice } from './choices';

/** The name box, used here and in the panel. */
export function NoteNameField() {
  const { name } = useNotesState();
  return (
    <Field label="Your name" hint="Goes on the notes and answers you write, so they read as notes from you. Leave it empty to write without one.">
      <input
        type="text"
        className="nt-input"
        value={name}
        maxLength={80}
        placeholder="Optional"
        aria-label="Your name on notes"
        onChange={(e) => setNotesSaved({ name: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </Field>
  );
}

export function NotesOptions() {
  const pin = useChoice<PinChoice>('notes.pin');
  const { show } = useNotesState();
  const notes = useStore((s) => s.doc.notes);
  const counts = countNotes(notes);
  return (
    <div className="cv-options">
      <Tip>Click the canvas to leave a note, then type. Drag a note's marker to move it. Click a marker to open it, answer it or tick it off.</Tip>
      <Choice<PinChoice>
        label="New notes belong to"
        value={pin}
        options={[
          { value: 'frame', label: 'This frame', title: 'Shows only on the frame you are on' },
          { value: 'page', label: 'The page', title: 'Shows on every frame' },
          { value: 'layer', label: 'This layer', title: 'Shows on the frames where the layer has a drawing' },
        ]}
        onChange={(v) => setChoice('notes.pin', v)}
      />
      <Toggle label="Show notes" checked={show} onChange={(v) => setNotesSaved({ show: v })} hint="One switch for every note on the canvas. Your notes stay in the file and never come out in an export." />
      <NoteNameField />
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => stepNote(-1)} disabled={!counts.all} title="Go to the note before">
          Previous note
        </ActionButton>
        <ActionButton onClick={() => stepNote(1)} disabled={!counts.all} title="Go to the next note">
          Next note
        </ActionButton>
      </div>
    </div>
  );
}
