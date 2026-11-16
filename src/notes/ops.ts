// Changing notes: leaving one, writing in it, moving it, answering it, ticking it off, and going to it. Every change to
// the file is one undo step with a plain name. A new note is not in the file until it has words (see state.ts).
import { uid } from '../core/doc';
import type { CanvasNote, Id } from '../core/format';
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { goToArtboard } from '../artboards/ops';
import { getView, getViewport, setView } from '../canvas/controller';
import { goTo } from '../timeline/playback';
import { boardOf, jumpTarget, makeNote, MAX_NOTES, MAX_REPLIES, MAX_TEXT, onOpenBoard, repinned, sortedNotes, visibleNotes, type NotePin } from './model';
import { getNotesState, noteName, openNote, setNotesLive, setNotesSaved } from './state';
import type { PinChoice } from './choices';

/** The note with this id: the one in the file, or the one being started. */
export function findNote(id: Id | null): CanvasNote | undefined {
  if (!id) return undefined;
  return store().get().doc.notes?.find((n) => n.id === id) ?? (getNotesState().draft?.id === id ? getNotesState().draft! : undefined);
}

/** Starts a note at a stage point, belonging where `pin` says. It joins the file when it gets its first words. */
export function startNote(x: number, y: number, pin: NotePin): string {
  const { doc, ui } = store().get();
  const where = pin === 'layer' && !ui.activeLayerId ? 'page' : pin;
  const note = makeNote({ id: uid('n'), x, y, pin: where, frame: ui.frame, layer: ui.activeLayerId ?? undefined, board: boardOf(doc), by: noteName(), at: Date.now() });
  setNotesLive({ openId: note.id, draft: note });
  if (!getNotesState().show) setNotesSaved({ show: true });
  return note.id;
}

/** Leaves a note where the person clicked, asking the first time whether it belongs to the frame or the page. */
export function leaveNoteAt(x: number, y: number): void {
  const { doc } = store().get();
  const discard = () => setNotesLive({ openId: null, draft: null });
  withChoice<PinChoice>('notes.pin', (pin) => void startNote(x, y, pin), { matters: doc.length > 1 || doc.layers.length > 1, gently: { undo: discard } });
}

/** Changes a note: in the file with one undo step, or (not written to yet) just the one being started. */
export function changeNote(id: Id, patch: Partial<CanvasNote>, label: string, coalesce?: string): void {
  const draft = getNotesState().draft;
  if (draft && draft.id === id) {
    const next = { ...draft, ...patch };
    // Its first words put it in the file.
    if (next.text.trim()) {
      setNotesLive({ draft: null });
      store().update('Add note', (d) => void (d.notes ??= []).push(next as never));
    } else setNotesLive({ draft: next });
    return;
  }
  if (!store().get().doc.notes?.some((n) => n.id === id)) return;
  store().update(
    label,
    (d) => {
      const n = d.notes?.find((x) => x.id === id);
      if (!n) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (n as Record<string, unknown>)[k];
        else (n as Record<string, unknown>)[k] = v;
      }
    },
    coalesce ? { coalesce } : {},
  );
}

export function writeNote(id: Id, text: string): void {
  changeNote(id, { text: text.slice(0, MAX_TEXT) }, 'Edit note', `note-text:${id}`);
}

export function moveNote(id: Id, x: number, y: number): void {
  changeNote(id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }, 'Move note', `note-move:${id}`);
}

export function tickNote(id: Id, done: boolean): void {
  changeNote(id, { done: done ? true : undefined }, done ? 'Tick off note' : 'Reopen note');
}

/** Moves a note to the page, this frame or this layer. */
export function repinNote(id: Id, pin: NotePin): void {
  const n = findNote(id);
  if (!n) return;
  const { ui } = store().get();
  const next = repinned(n, pin, { frame: ui.frame, layer: ui.activeLayerId ?? undefined });
  changeNote(id, { pin: next.pin, frame: next.frame, layer: next.layer }, 'Pin note');
}

/** Adds an answer to a note. Empty answers are ignored. */
export function answerNote(id: Id, text: string): boolean {
  const t = text.trim().slice(0, MAX_TEXT);
  const n = findNote(id);
  if (!t || !n || (n.replies?.length ?? 0) >= MAX_REPLIES) return false;
  const reply = { id: uid('r'), text: t, ...(noteName() ? { by: noteName() } : {}), at: Date.now() };
  changeNote(id, { replies: [...(n.replies ?? []), reply] }, 'Answer note');
  return true;
}

export function removeNote(id: Id): void {
  if (getNotesState().draft?.id === id) {
    setNotesLive({ openId: null, draft: null });
    return;
  }
  if (getNotesState().openId === id) openNote(null);
  store().update('Remove note', (d) => {
    if (!d.notes) return;
    d.notes = d.notes.filter((n) => n.id !== id);
    if (!d.notes.length) delete d.notes;
  });
}

/** Removes every note that is ticked off. Returns how many went. */
export function clearDoneNotes(): number {
  const n = store().get().doc.notes?.filter((x) => x.done).length ?? 0;
  if (!n) return 0;
  const open = getNotesState().openId;
  if (open && findNote(open)?.done) openNote(null);
  store().update('Remove finished notes', (d) => {
    d.notes = d.notes?.filter((x) => !x.done);
    if (!d.notes?.length) delete d.notes;
  });
  return n;
}

/** Shuts the card. A note that was never given words is dropped; one whose words were all deleted goes too. */
export function closeNote(): void {
  const id = getNotesState().openId;
  if (!id) return;
  const n = store().get().doc.notes?.find((x) => x.id === id);
  openNote(null);
  if (n && !n.text.trim() && !n.replies?.length) removeNote(id);
}

/** Whether the file has room for another note (it takes a couple of thousand). */
export const noteRoom = (): boolean => (store().get().doc.notes?.length ?? 0) < MAX_NOTES;

/** Takes the playhead, the layer and the view to a note and opens it. */
export function goToNote(id: Id): void {
  const { doc } = store().get();
  const n = doc.notes?.find((x) => x.id === id);
  if (!n) return;
  if (n.board && !onOpenBoard(n, doc)) {
    goToArtboard(n.board, true);
    finishGo(id);
    return;
  }
  finishGo(id);
}

function finishGo(id: Id): void {
  const { doc, ui } = store().get();
  const n = doc.notes?.find((x) => x.id === id);
  if (!n) return;
  const t = jumpTarget(doc, n, ui.frame);
  if (t.frame !== ui.frame) goTo(t.frame);
  if (t.layer && t.layer !== ui.activeLayerId) store().setUi({ activeLayerId: t.layer, selection: [] });
  if (!getNotesState().show) setNotesSaved({ show: true });
  if (n.done && getNotesState().hideDone) setNotesSaved({ hideDone: false });
  // Bring it into view if it is off the screen.
  const v = getView();
  const vp = getViewport();
  const sx = n.x * v.zoom + v.panX;
  const sy = n.y * v.zoom + v.panY;
  if (sx < 24 || sy < 24 || sx > vp.w - 24 || sy > vp.h - 24) setView({ zoom: v.zoom, panX: vp.w / 2 - n.x * v.zoom, panY: vp.h / 2 - n.y * v.zoom });
  openNote(id);
}

/** The notes you can step through, in reading order: the ones on the open artboard, finished ones only while they show. */
export function stepList(): CanvasNote[] {
  const { doc } = store().get();
  const hide = getNotesState().hideDone;
  return sortedNotes((doc.notes ?? []).filter((n) => onOpenBoard(n, doc) && !(hide && n.done)));
}

/** Goes to the next (1) or previous (-1) note after the one open, or after where you are, wrapping round. */
export function stepNote(dir: 1 | -1): CanvasNote | null {
  const list = stepList();
  if (!list.length) return null;
  const open = getNotesState().openId;
  const at = list.findIndex((n) => n.id === open);
  let next: CanvasNote;
  if (at >= 0) next = list[(at + dir + list.length) % list.length];
  else {
    // Not on a note: the first one after this frame (or the last one before it).
    const frame = store().get().ui.frame;
    const rank = (n: CanvasNote) => (n.pin === 'frame' && n.frame !== undefined ? n.frame : -1);
    const ahead = dir === 1 ? list.find((n) => rank(n) > frame) : [...list].reverse().find((n) => rank(n) < frame);
    next = ahead ?? (dir === 1 ? list[0] : list[list.length - 1]);
  }
  goToNote(next.id);
  return next;
}

/** The notes on the canvas right now (for the layer drawing them). */
export function notesOnCanvas(): CanvasNote[] {
  const { doc, ui } = store().get();
  return visibleNotes(doc, ui.frame, { hideDone: getNotesState().hideDone });
}
