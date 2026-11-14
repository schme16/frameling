// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';
import { store } from '../../src/core/store';
import '../../src/notes/choices';
import { answerNote, changeNote, clearDoneNotes, closeNote, goToNote, leaveNoteAt, moveNote, removeNote, repinNote, stepNote, tickNote, writeNote } from '../../src/notes/ops';
import { _resetNotesState, getNotesState, setNotesSaved } from '../../src/notes/state';

function fresh() {
  const d = newDoc({ name: 'T', width: 200, height: 200 });
  d.length = 12;
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c1', start: 6, length: 2, drawingId: 'dx' }];
  d.layers = [l];
  store().load(d, null);
  store().setUi({ frame: 2, activeLayerId: 'L1' });
  _resetNotesState();
  setChoice('notes.pin', undefined);
}
beforeEach(fresh);

const notes = () => store().get().doc.notes;
/** Leaves a note and types into it, as the tool and the card do. */
function leave(text: string, x = 10, y = 20): string {
  leaveNoteAt(x, y);
  const id = getNotesState().openId!;
  writeNote(id, text);
  return id;
}

describe('leaving a note', () => {
  it('starts as a draft that is in no document until it has words', () => {
    leaveNoteAt(10, 20);
    expect(getNotesState().draft).toMatchObject({ x: 10, y: 20, text: '', pin: 'frame', frame: 2 });
    expect(notes()).toBeUndefined();
    expect(store().canUndo()).toBe(false);
    closeNote();
    expect(getNotesState().draft).toBeNull();
    expect(notes()).toBeUndefined();
  });
  it('joins the file on the first words, as one undo step', () => {
    const id = leave('the elbow pops');
    expect(notes()).toEqual([expect.objectContaining({ id, text: 'the elbow pops', pin: 'frame', frame: 2 })]);
    expect(getNotesState().draft).toBeNull();
    expect(store().undoLabel()).toBe('Add note');
    store().undo();
    expect(notes()).toBeUndefined();
  });
  it('belongs where the remembered choice says', () => {
    setChoice('notes.pin', 'page');
    const a = leave('page note');
    expect(notes()!.find((n) => n.id === a)!.pin).toBeUndefined();
    setChoice('notes.pin', 'layer');
    const b = leave('layer note');
    expect(notes()!.find((n) => n.id === b)).toMatchObject({ pin: 'layer', layer: 'L1' });
  });
  it('a layer note with no layer to belong to goes on the page', () => {
    setChoice('notes.pin', 'layer');
    store().setUi({ activeLayerId: null });
    const id = leave('hm');
    expect(notes()!.find((n) => n.id === id)!.pin).toBeUndefined();
  });
  it('turns the notes on if they were hidden', () => {
    setNotesSaved({ show: false });
    leaveNoteAt(1, 1);
    expect(getNotesState().show).toBe(true);
  });
});

describe('changing notes', () => {
  it('typing merges into one undo step; moving too', () => {
    const id = leave('a');
    writeNote(id, 'ab');
    writeNote(id, 'abc');
    moveNote(id, 30, 40);
    moveNote(id, 31, 41);
    expect(notes()![0]).toMatchObject({ text: 'abc', x: 31, y: 41 });
    store().undo();
    expect(notes()![0]).toMatchObject({ text: 'abc', x: 10, y: 20 });
    store().undo();
    expect(notes()![0].text).toBe('a');
  });
  it('ticks off and reopens', () => {
    const id = leave('x');
    tickNote(id, true);
    expect(notes()![0].done).toBe(true);
    expect(store().undoLabel()).toBe('Tick off note');
    tickNote(id, false);
    expect('done' in notes()![0]).toBe(false);
  });
  it('answers, with the name and the time', () => {
    setNotesSaved({ name: 'Sam' });
    const id = leave('x');
    expect(answerNote(id, '   ')).toBe(false);
    expect(answerNote(id, ' done it ')).toBe(true);
    expect(notes()![0].replies).toEqual([expect.objectContaining({ text: 'done it', by: 'Sam', at: expect.any(Number) })]);
  });
  it('puts your name on a new note when you have one, and none when you do not', () => {
    setNotesSaved({ name: 'Sam' });
    expect(notes()?.length).toBeUndefined();
    const a = leave('one');
    expect(notes()!.find((n) => n.id === a)!.by).toBe('Sam');
    setNotesSaved({ name: '' });
    const b = leave('two');
    expect(notes()!.find((n) => n.id === b)!.by).toBeUndefined();
    expect(notes()!.find((n) => n.id === b)!.at).toBeGreaterThan(0);
  });
  it('re-pins to the frame or layer you are on, or the page', () => {
    const id = leave('x');
    store().setUi({ frame: 7 });
    repinNote(id, 'frame');
    expect(notes()![0]).toMatchObject({ pin: 'frame', frame: 7 });
    repinNote(id, 'layer');
    expect(notes()![0]).toMatchObject({ pin: 'layer', layer: 'L1' });
    expect(notes()![0].frame).toBeUndefined();
    repinNote(id, 'page');
    expect(notes()![0].pin).toBeUndefined();
    expect(notes()![0].layer).toBeUndefined();
  });
  it('ignores changes to a note that is not there', () => {
    changeNote('ghost', { text: 'x' }, 'Edit note');
    expect(notes()).toBeUndefined();
    expect(store().canUndo()).toBe(false);
  });
});

describe('taking notes away', () => {
  it('removes one, and the list goes when it is empty', () => {
    const a = leave('a');
    const b = leave('b');
    removeNote(a);
    expect(notes()!.map((n) => n.id)).toEqual([b]);
    removeNote(b);
    expect('notes' in store().get().doc).toBe(false);
    store().undo();
    expect(notes()!.map((n) => n.id)).toEqual([b]);
  });
  it('closing a card whose words were all deleted removes the note', () => {
    const id = leave('a');
    writeNote(id, '  ');
    closeNote();
    expect(notes()?.some((n) => n.id === id)).toBeFalsy();
  });
  it('removes the done ones in one step', () => {
    const a = leave('a');
    leave('b');
    const c = leave('c');
    tickNote(a, true);
    tickNote(c, true);
    expect(clearDoneNotes()).toBe(2);
    expect(notes()!.map((n) => n.text)).toEqual(['b']);
    expect(store().undoLabel()).toBe('Remove finished notes');
    expect(clearDoneNotes()).toBe(0);
  });
});

describe('going to notes', () => {
  it('takes the playhead and the layer to a note and opens it', () => {
    const id = leave('x');
    store().setUi({ frame: 0, activeLayerId: null });
    changeNote(id, { pin: 'frame', frame: 9 }, 'Pin note');
    goToNote(id);
    expect(store().get().ui.frame).toBe(9);
    expect(getNotesState().openId).toBe(id);
    changeNote(id, { pin: 'layer', frame: undefined, layer: 'L1' }, 'Pin note');
    goToNote(id);
    expect(store().get().ui.frame).toBe(6);
    expect(store().get().ui.activeLayerId).toBe('L1');
  });
  it('shows a hidden note that you go to', () => {
    const id = leave('x');
    tickNote(id, true);
    setNotesSaved({ show: false, hideDone: true });
    goToNote(id);
    expect(getNotesState()).toMatchObject({ show: true, hideDone: false, openId: id });
  });
  it('steps through them in reading order, round and round', () => {
    store().setUi({ frame: 5 });
    const f5 = leave('f5');
    store().setUi({ frame: 1 });
    const f1 = leave('f1');
    setChoice('notes.pin', 'page');
    const pg = leave('page');
    store().setUi({ frame: 0 });
    expect(stepNote(1)!.id).toBe(f1);
    expect(stepNote(1)!.id).toBe(f5);
    expect(stepNote(1)!.id).toBe(pg);
    expect(stepNote(-1)!.id).toBe(f5);
    expect(getNotesState().openId).toBe(f5);
  });
  it('has nowhere to go with no notes', () => {
    expect(stepNote(1)).toBeNull();
  });
});
