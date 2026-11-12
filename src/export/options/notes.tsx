// The notes of the layered formats (what PSD, PDF, Illustrator and ProRes keep), and Illustrator's choice of what a
// several-frame animation becomes.
import type { ComponentType } from 'react';
import { LayeredNotes } from '../LayeredNotes';
import type { ExportUiProps } from '../registry';
import { aiFramesOf, type AiFrames } from '../types';

const made = new Map<string, ComponentType<ExportUiProps>>();

/** The note box for a format (see LayeredNotes). */
export function NoteFor(format: string): ComponentType<ExportUiProps> {
  let c = made.get(format);
  if (!c) {
    const Note = ({ doc }: ExportUiProps) => <LayeredNotes format={format} doc={doc} />;
    made.set(format, (c = Note));
  }
  return c;
}

/** The ways an Illustrator file can hold an animation's frames. */
const AI_FRAMES: { id: AiFrames; label: string; title: string; note: string }[] = [
  { id: 'one', label: 'This frame', title: 'Only the frame you are looking at', note: 'Illustrator opens the frame you are looking at, with your layers and folders as real Illustrator layers.' },
  { id: 'files', label: 'One file per frame', title: 'A zip with a .ai file for every frame', note: 'A zip with a .ai file for every frame, each with real layers.' },
  { id: 'artboards', label: 'One artboard per frame', title: 'Every frame side by side as an artboard in one file', note: 'Every frame sits side by side as an artboard in one Illustrator file, with the same layers all the way through.' },
  { id: 'pages', label: 'Pages', title: 'One PDF page per frame', note: 'One PDF page per frame in a single file. Illustrator asks which page to open and brings it in as groups, without the layer names.' },
];

export function IllustratorFrames({ s, set, doc }: ExportUiProps) {
  if (doc.length <= 1) return null;
  return (
    <fieldset>
      <legend>Several frames in Illustrator</legend>
      <div className="ex-seg">
        {AI_FRAMES.map((o) => (
          <button key={o.id} type="button" className={aiFramesOf(s) === o.id ? 'ex-on' : ''} aria-pressed={aiFramesOf(s) === o.id} title={o.title} onClick={() => set({ aiFrames: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="ex-note">{AI_FRAMES.find((o) => o.id === aiFramesOf(s))?.note}</p>
    </fieldset>
  );
}
