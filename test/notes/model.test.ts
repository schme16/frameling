import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasNote, Doc } from '../../src/core/format';
import { boardOf, byLine, countNotes, framesWithNotes, jumpTarget, makeNote, noteTitle, onOpenBoard, pinOf, readNotes, repinned, sortedNotes, visibleNotes, whenText, whereText, withoutNotes, MAX_NOTES, MAX_TEXT } from '../../src/notes/model';

const note = (id: string, extra: Partial<CanvasNote> = {}): CanvasNote => ({ id, x: 10, y: 20, text: id, ...extra });

function docWith(notes: CanvasNote[]): Doc {
  const d = newDoc({ width: 100, height: 100 });
  d.length = 20;
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c1', start: 4, length: 3, drawingId: 'dx' }];
  d.layers = [l];
  d.notes = notes;
  return d;
}

describe('reading notes from a file', () => {
  it('keeps well-formed notes, with their extras', () => {
    const out = readNotes([{ id: 'a', x: 1, y: 2, text: 'hi', pin: 'frame', frame: 3, by: 'Sam', at: 5, done: true, replies: [{ id: 'r', text: 'ok', by: 'Al', at: 9 }] }]);
    expect(out).toEqual([{ id: 'a', x: 1, y: 2, text: 'hi', pin: 'frame', frame: 3, by: 'Sam', at: 5, done: true, replies: [{ id: 'r', text: 'ok', by: 'Al', at: 9 }] }]);
  });
  it('is undefined when there is nothing usable', () => {
    expect(readNotes(undefined)).toBeUndefined();
    expect(readNotes('x')).toBeUndefined();
    expect(readNotes([])).toBeUndefined();
    expect(readNotes([{ id: 'a', text: 'no place' }, null, 4, { x: 'a', y: 1 }])).toBeUndefined();
  });
  it('makes up what is missing and drops what is wrong', () => {
    const out = readNotes([{ x: 1, y: 2 }, { id: 'b', x: 3, y: 4, text: 7, pin: 'frame' }, { id: 'c', x: 0, y: 0, text: 'x', pin: 'layer' }, { id: 'd', x: 0, y: 0, text: 'x', done: 'yes', replies: [{ text: '' }, { text: 'a' }] }])!;
    expect(out).toHaveLength(4);
    expect(out[0].id).toBeTruthy();
    expect(out[0].text).toBe('');
    // A frame note with no frame, and a layer note with no layer, fall back to the page.
    expect(out[1].pin).toBeUndefined();
    expect(out[2].pin).toBeUndefined();
    expect(out[3].done).toBeUndefined();
    expect(out[3].replies).toHaveLength(1);
  });
  it('gives clashing ids new ones, and holds the limits', () => {
    const out = readNotes([note('a'), note('a')])!;
    expect(new Set(out.map((n) => n.id)).size).toBe(2);
    expect(readNotes([note('a', { text: 'x'.repeat(MAX_TEXT + 10) })])![0].text).toHaveLength(MAX_TEXT);
    expect(readNotes(Array.from({ length: MAX_NOTES + 5 }, (_, i) => note('n' + i)))).toHaveLength(MAX_NOTES);
  });
});

describe('which notes show', () => {
  const d = docWith([note('page'), note('f5', { pin: 'frame', frame: 5 }), note('f6', { pin: 'frame', frame: 6, done: true }), note('lay', { pin: 'layer', layer: 'L1' }), note('gone', { pin: 'layer', layer: 'nope' })]);
  const ids = (frame: number, o = {}) => visibleNotes(d, frame, o).map((n) => n.id);
  it('page notes always; frame notes on their frame; layer notes while the layer has a drawing', () => {
    expect(ids(0)).toEqual(['page', 'gone']);
    expect(ids(5)).toEqual(['page', 'f5', 'lay', 'gone']);
    expect(ids(6)).toEqual(['page', 'f6', 'lay', 'gone']);
    expect(ids(7)).toEqual(['page', 'gone']);
  });
  it('can leave out the ones that are done', () => {
    expect(ids(6, { hideDone: true })).toEqual(['page', 'lay', 'gone']);
  });
  it('shows nothing while a symbol is open', () => {
    expect(visibleNotes({ ...d, editing: [{ symbolId: 's', layers: [], length: 1, frame: 0 } as never] }, 5)).toEqual([]);
  });
  it('marks the frames that have notes, and how many are still open', () => {
    const m = framesWithNotes(d);
    expect([...m.keys()].sort()).toEqual([5, 6]);
    expect(m.get(5)).toEqual({ total: 1, open: 1 });
    expect(m.get(6)).toEqual({ total: 1, open: 0 });
  });
  it('belongs to its artboard', () => {
    const boards = docWith([note('a', { board: 'b1' }), note('b', { board: 'b2' }), note('c'), note('old', { board: 'deleted' })]);
    boards.artboards = [{ id: 'b1', name: 'One', x: 0, y: 0 }, { id: 'b2', name: 'Two', x: 200, y: 0, content: {} as never }] as never;
    boards.activeArtboard = 'b1';
    expect(boardOf(boards)).toBe('b1');
    expect(visibleNotes(boards, 0).map((n) => n.id)).toEqual(['a', 'c', 'old']);
    expect(onOpenBoard(boards.notes![1], boards)).toBe(false);
    expect(boardOf(docWith([]))).toBeUndefined();
  });
});

describe('pinning, finding and listing', () => {
  it('pinOf says the page for anything incomplete', () => {
    expect(pinOf(note('a'))).toBe('page');
    expect(pinOf(note('a', { pin: 'frame' }))).toBe('page');
    expect(pinOf(note('a', { pin: 'frame', frame: 0 }))).toBe('frame');
    expect(pinOf(note('a', { pin: 'layer', layer: 'L1' }))).toBe('layer');
  });
  it('makes and re-pins notes', () => {
    const n = makeNote({ id: 'n', x: 1.234, y: 2, pin: 'frame', frame: 7, board: 'b', by: ' Sam ', at: 9 });
    expect(n).toEqual({ id: 'n', x: 1.2, y: 2, text: '', pin: 'frame', frame: 7, board: 'b', by: 'Sam', at: 9 });
    expect(makeNote({ id: 'n', x: 0, y: 0, pin: 'layer', frame: 1 }).pin).toBeUndefined();
    const moved = repinned(n, 'layer', { frame: 3, layer: 'L1' });
    expect(moved).toMatchObject({ pin: 'layer', layer: 'L1', text: '', by: 'Sam' });
    expect(moved.frame).toBeUndefined();
    expect(repinned(n, 'page', { frame: 3 }).pin).toBeUndefined();
  });
  it('lists page notes first, then layers, then frames in order', () => {
    const list = sortedNotes([note('f9', { pin: 'frame', frame: 9 }), note('f2', { pin: 'frame', frame: 2 }), note('lay', { pin: 'layer', layer: 'L' }), note('page')]);
    expect(list.map((n) => n.id)).toEqual(['page', 'lay', 'f2', 'f9']);
  });
  it('knows where to take you', () => {
    const d = docWith([]);
    expect(jumpTarget(d, note('a', { pin: 'frame', frame: 9 }), 0)).toEqual({ frame: 9 });
    expect(jumpTarget(d, note('a', { pin: 'frame', frame: 99 }), 0)).toEqual({ frame: 19 });
    expect(jumpTarget(d, note('a', { pin: 'layer', layer: 'L1' }), 0)).toEqual({ frame: 4, layer: 'L1' });
    expect(jumpTarget(d, note('a', { pin: 'layer', layer: 'L1' }), 5)).toEqual({ frame: 5, layer: 'L1' });
    expect(jumpTarget(d, note('a'), 3)).toEqual({ frame: 3 });
  });
  it('says where a note belongs in plain words', () => {
    const d = docWith([]);
    expect(whereText(d, note('a'))).toBe('The page');
    expect(whereText(d, note('a', { pin: 'frame', frame: 4 }))).toBe('Frame 5');
    expect(whereText(d, note('a', { pin: 'frame', frame: 40 }))).toBe('Frame 41 (past the end)');
    expect(whereText(d, note('a', { pin: 'layer', layer: 'L1' }))).toBe('Layer Lines');
  });
  it('counts and titles', () => {
    expect(countNotes(undefined)).toEqual({ all: 0, open: 0, done: 0 });
    expect(countNotes([note('a'), note('b', { done: true })])).toEqual({ all: 2, open: 1, done: 1 });
    expect(noteTitle(note('a', { text: '\n  first line  \nsecond' }))).toBe('first line');
    expect(noteTitle(note('a', { text: '' }))).toBe('Empty note');
    expect(noteTitle(note('a', { text: 'x'.repeat(100) }), 10)).toHaveLength(10);
  });
});

describe('who and when', () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);
  it('says it the way a person would', () => {
    expect(whenText(undefined, now)).toBe('');
    expect(whenText(now - 10_000, now)).toBe('just now');
    expect(whenText(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(whenText(now - 60_000, now)).toBe('1 minute ago');
    expect(whenText(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(whenText(Date.UTC(2026, 10, 13, 1), now)).toBe('yesterday');
    expect(whenText(Date.UTC(2026, 10, 10, 1), now)).toBe('4 days ago');
    expect(whenText(Date.UTC(2026, 9, 3, 12), now)).toBe('3 Oct');
    expect(whenText(Date.UTC(2025, 9, 3, 12), now)).toBe('3 Oct 2025');
  });
  it('joins the name and the time, whichever are known', () => {
    expect(byLine('Sam', now - 120_000, now)).toBe('Sam, 2 minutes ago');
    expect(byLine('Sam', undefined, now)).toBe('Sam');
    expect(byLine(undefined, now - 120_000, now)).toBe('2 minutes ago');
    expect(byLine('  ', undefined, now)).toBe('');
  });
});

describe('withoutNotes', () => {
  it('takes the notes out, leaves the rest, and keeps the original whole', () => {
    const d = docWith([note('a')]);
    const bare = withoutNotes(d);
    expect(bare.notes).toBeUndefined();
    expect('notes' in bare).toBe(false);
    expect(bare.layers).toBe(d.layers);
    expect(d.notes).toHaveLength(1);
  });
  it('hands back the same object when there are none, and the same copy each time', () => {
    const d = docWith([]);
    delete d.notes;
    expect(withoutNotes(d)).toBe(d);
    const n = docWith([note('a')]);
    expect(withoutNotes(n)).toBe(withoutNotes(n));
  });
});
