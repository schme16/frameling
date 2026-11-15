// A reviewer's comments go into the drawing without a step in the sharer's Undo. The point of the inbox was that a note
// from outside must never clear the Redo stack or become the next Undo; this is the same promise, kept by the store.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newDoc } from '../../src/core/doc';
import { Store } from '../../src/core/store';
import { isQuietId, applyKeepingQuiet } from '../../src/core/quiet';
import { Inbox, keepInto } from '../../src/review/inbox';
import { landsAtOnce } from '../../src/livereview/cover';
import type { ReviewItem } from '../../src/review/wire';

const note = (id: string, text = 'hi'): ReviewItem => ({ t: 'note', id, x: 5, y: 6, text, at: 0 });
const arrive = (s: Store, items: ReviewItem[], seat = 0) => {
  const b = new Inbox();
  items.forEach((it, i) => b.add(seat, 'Sam', it, 100 + i));
  return s.updateQuiet((d) => void keepInto(d, b.entries, true));
};
const mine = (s: Store, id: string) => s.update('Add a note', (d) => void (d.notes ??= []).push({ id, x: 1, y: 1, text: 'mine' } as never), {});
const ids = (s: Store) => (s.get().doc.notes ?? []).map((n) => n.id);

describe('putting a reviewer\'s comment in without a step in Undo', () => {
  it('leaves Undo and Redo exactly as they were', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    mine(s, 'b');
    s.undo();
    const before = { undo: s.undoLabel(), redo: s.redoLabel(), ids: s.historyIds(), list: s.historyList() };
    expect(s.canRedo()).toBe(true);
    expect(arrive(s, [note('x')])).toBe(true);
    expect(s.canRedo()).toBe(true);
    expect({ undo: s.undoLabel(), redo: s.redoLabel(), ids: s.historyIds(), list: s.historyList() }).toEqual(before);
    expect(s.get().doc.notes!.map((n) => n.id)).toEqual(['a', 'rq0-x']);
    expect(s.get().ui.dirty).toBe(true);
  });
  it('makes Undo take the sharer\'s own last action, not the reviewer\'s note', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    arrive(s, [note('x')]);
    s.undo();
    // Their note stays, the sharer's own is gone.
    expect(ids(s)).toEqual(['rq0-x']);
    s.redo();
    expect(ids(s).sort()).toEqual(['a', 'rq0-x']);
  });
  it('keeps a note that arrived while the sharer was undoing and redoing their own', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    mine(s, 'b');
    arrive(s, [note('x')]);
    mine(s, 'c');
    arrive(s, [note('y')]);
    for (let i = 0; i < 3; i++) s.undo();
    expect(ids(s).sort()).toEqual(['rq0-x', 'rq0-y']);
    for (let i = 0; i < 3; i++) s.redo();
    expect(ids(s).filter((i) => !isQuietId(i)).sort()).toEqual(['a', 'b', 'c']);
    expect(ids(s).filter(isQuietId).sort()).toEqual(['rq0-x', 'rq0-y']);
  });
  it('does not bring back a reviewer\'s note the sharer deleted themselves, when Undo and Redo pass it', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    arrive(s, [note('x')]);
    s.update('Delete a note', (d) => {
      d.notes = d.notes!.filter((n) => n.id !== 'rq0-x');
    });
    expect(ids(s)).toEqual(['a']);
    s.undo();
    expect(ids(s)).toEqual(['a', 'rq0-x']);
    s.redo();
    expect(ids(s)).toEqual(['a']);
  });
  it('keeps a note that arrived between the sharer deleting a note and taking the delete back', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    mine(s, 'b');
    s.update('Delete a note', (d) => {
      d.notes = d.notes!.filter((n) => n.id !== 'a');
    });
    arrive(s, [note('x')]);
    s.undo();
    expect(ids(s).sort()).toEqual(['a', 'b', 'rq0-x']);
    s.redo();
    expect(ids(s).sort()).toEqual(['b', 'rq0-x']);
  });
  it('keeps marks the same way', () => {
    const s = new Store(newDoc({ length: 4 }));
    const m: ReviewItem = { t: 'mark', mark: { id: 'm1', kind: 'circle', pts: [1, 1, 9, 9] } };
    s.update('Add a mark', (d) => void (d.marks ??= []).push({ id: 'mine', kind: 'arrow', pts: [0, 0, 5, 5] } as never));
    arrive(s, [m]);
    s.undo();
    expect(s.get().doc.marks!.map((x) => x.id)).toEqual(['rq0-m1']);
    s.redo();
    expect(s.get().doc.marks!.map((x) => x.id).sort()).toEqual(['mine', 'rq0-m1']);
  });
  it('survives going all the way back through the history and forward again', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    arrive(s, [note('x')]);
    mine(s, 'b');
    s.jumpToStep(null);
    expect(ids(s)).toEqual(['rq0-x']);
    const last = s.historyList().undone.at(-1)!.id;
    s.jumpToStep(last);
    expect(ids(s).sort()).toEqual(['a', 'b', 'rq0-x']);
  });
  it('keeps a reviewer\'s answer when the sharer takes back their own answer on the same note', () => {
    const s = new Store(newDoc({ length: 4 }));
    mine(s, 'a');
    s.update('Reply', (d) => {
      d.notes![0].replies = [{ id: 'r1', text: 'ok', by: 'me', at: 1 }];
    });
    s.update('Reply again', (d) => void d.notes![0].replies!.push({ id: 'r2', text: 'ok2', by: 'me', at: 2 }));
    // A reviewer answers a note of theirs, then the sharer answers it, then Undo takes the sharer's answer back.
    arrive(s, [note('x'), { t: 'reply', id: 'q', to: 'x', text: 'is this ok', at: 0 }]);
    const x = s.get().doc.notes!.findIndex((n) => n.id === 'rq0-x');
    s.update('Answer', (d) => void (d.notes![x].replies ??= []).push({ id: 'mine', text: 'yes', by: 'me', at: 3 }));
    s.undo();
    expect(s.get().doc.notes![x].replies!.map((r) => r.id)).toEqual(['rq0-q']);
  });
  it('does nothing while a tile or symbol is open, so it never lands in the wrong drawing', () => {
    const s = new Store(newDoc({ length: 4 }));
    s.enterNested(newDoc({ length: 2 }), { tag: 'tile:1', merge: (p) => p });
    expect(arrive(s, [note('x')])).toBe(false);
    expect(s.get().doc.notes ?? []).toHaveLength(0);
    s.exitNested();
    expect(arrive(s, [note('x')])).toBe(true);
  });
  it('keeping twice, the old way and the quiet way, adds a note once', () => {
    const b = new Inbox();
    b.add(0, 'Sam', note('x'), 1);
    const once = produce(newDoc({ length: 4 }), (d) => void keepInto(d, b.entries));
    const twice = produce(once, (d) => void keepInto(d, b.entries, true));
    expect(twice.notes).toHaveLength(1);
    expect(once.notes![0].id).toBe('rv0-x');
  });
});

describe('the cut that Undo makes', () => {
  it('is applied as before when no quiet note is in the way', () => {
    const d = newDoc({ length: 4 });
    const added = produce(d, (x) => void (x.notes = [{ id: 'a', x: 0, y: 0, text: '' } as never]));
    expect(applyKeepingQuiet(added, [{ op: 'replace', path: ['notes', 'length'], value: 0 }]).notes).toEqual([]);
  });
});

describe('when comments go straight in', () => {
  it('is the usual answer, and unanswered counts as the usual answer', () => {
    expect(landsAtOnce('all', false)).toBe(true);
    expect(landsAtOnce(undefined, false)).toBe(true);
  });
  it('waits while the cover is on, however it was answered', () => {
    expect(landsAtOnce('all', true)).toBe(false);
    expect(landsAtOnce(undefined, true)).toBe(false);
  });
  it('keeps the old behaviour as an answer: show me first, and leave them behind, wait in the card', () => {
    expect(landsAtOnce('look', false)).toBe(false);
    expect(landsAtOnce('none', false)).toBe(false);
  });
});
