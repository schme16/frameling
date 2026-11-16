import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newDoc } from '../../src/core/doc';
import { DRIFT_NOTE, Inbox, MAX_INBOX, driftOf, keepInto, structureSig } from '../../src/review/inbox';
import type { ReviewItem } from '../../src/review/wire';

const note = (id: string, text = 'hi', frame?: number): ReviewItem => ({ t: 'note', id, x: 5, y: 6, text, at: 0, ...(frame === undefined ? {} : { frame }) });

describe('the inbox', () => {
  it('takes what arrives, once, and acknowledges it each time it is sent', () => {
    const b = new Inbox();
    expect(b.add(0, 'Sam', note('a'), 100)).toBe('a');
    expect(b.add(0, 'Sam', note('a'), 200)).toBe('a');
    expect(b.entries).toHaveLength(1);
    expect(b.unread).toBe(1);
    b.markRead();
    expect(b.unread).toBe(0);
  });
  it('keeps two reviewers\' ids apart, and stamps their name and time', () => {
    const b = new Inbox();
    b.add(0, 'Sam', note('a'), 100);
    b.add(1, 'Alex', note('a'), 101);
    expect(b.entries.map((e) => e.by)).toEqual(['Sam', 'Alex']);
    expect(b.add(2, 'Kit', { t: 'mark', mark: { id: 'm', kind: 'arrow', pts: [0, 0, 1, 1] } }, 5)).toBe('m');
    expect(b.entries[2].item).toMatchObject({ mark: { by: 'Kit', at: 5 } });
  });
  it('lets a reviewer answer or tick only a note of their own', () => {
    const b = new Inbox();
    b.add(0, 'Sam', note('a'), 1);
    expect(b.add(1, 'Alex', { t: 'reply', id: 'r', to: 'a', text: 'no', at: 0 }, 2)).toBeNull();
    expect(b.add(0, 'Sam', { t: 'reply', id: 'r', to: 'a', text: 'yes', at: 0 }, 2)).toBe('r');
    expect(b.add(0, 'Sam', { t: 'tick', id: 't', to: 'zzz', done: true }, 2)).toBeNull();
  });
  it('is full at a cap, so a reviewer cannot fill the memory', () => {
    const b = new Inbox();
    for (let i = 0; i < MAX_INBOX; i++) b.add(0, 'S', note('n' + i), i);
    expect(b.add(0, 'S', note('over'), 1)).toBeNull();
  });
});

describe('keeping the inbox into the drawing', () => {
  const doc = () => newDoc({ length: 10 });
  const ready = () => {
    const b = new Inbox();
    b.add(0, 'Sam', note('a', 'elbow', 3), 100);
    b.add(0, 'Sam', { t: 'reply', id: 'r', to: 'a', text: 'also the hand', at: 0 }, 101);
    b.add(0, 'Sam', { t: 'tick', id: 't', to: 'a', done: true }, 102);
    b.add(1, 'Alex', { t: 'mark', mark: { id: 'm', kind: 'circle', pts: [1, 1, 9, 9], pin: 'frame', frame: 99 } }, 103);
    return b;
  };
  it('writes notes, answers, ticks and marks with who and when, and clamps a frame', () => {
    const out = produce(doc(), (d) => void keepInto(d, ready().entries));
    expect(out.notes).toHaveLength(1);
    expect(out.notes![0]).toMatchObject({ text: 'elbow', by: 'Sam', at: 100, pin: 'frame', frame: 3, done: true });
    expect(out.notes![0].replies).toEqual([{ id: 'rv0-r', text: 'also the hand', by: 'Sam', at: 101 }]);
    expect(out.marks![0]).toMatchObject({ kind: 'circle', by: 'Alex', at: 103, frame: 9 });
  });
  it('is harmless to keep twice (merging is by id)', () => {
    const once = produce(doc(), (d) => void keepInto(d, ready().entries));
    const twice = produce(once, (d) => void keepInto(d, ready().entries));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe('did the drawing move under the note', () => {
  it('changes with frames and layers, not with drawing', () => {
    const d = newDoc({ length: 10 });
    const sig = structureSig(d);
    expect(driftOf(sig, d)).toBe(false);
    expect(driftOf(undefined, d)).toBe(false);
    expect(driftOf(sig, { ...d, length: 11 })).toBe(true);
    expect(driftOf(sig, { ...d, layers: [...d.layers, { ...d.layers[0], id: 'zz' }] })).toBe(true);
    expect(DRIFT_NOTE).toMatch(/frame off/);
  });
});

import { COMMENTS_FORMAT, MAX_COMMENTS, readComments, writeComments } from '../../src/review/commentsFile';

describe('the comments file', () => {
  const items: ReviewItem[] = [note('a', 'elbow', 2), { t: 'mark', mark: { id: 'm', kind: 'arrow', pts: [0, 0, 9, 9] } }];
  it('writes what a reviewer wrote and reads it back through the same closed list', () => {
    const back = readComments(writeComments('Sam', items, 5), 99)!;
    expect(back.from).toBe('Sam');
    expect(back.items).toHaveLength(2);
    expect(back.items[0]).toMatchObject({ t: 'note', id: 'a', text: 'elbow', frame: 2, at: 99 });
  });
  it('is not fooled by a file that is not one, or that carries more than a reviewer can say', () => {
    expect(readComments('not json', 1)).toBeNull();
    expect(readComments(JSON.stringify({ format: 'other', version: 1, items: [] }), 1)).toBeNull();
    expect(readComments(JSON.stringify({ format: COMMENTS_FORMAT, version: 2, items: [] }), 1)).toBeNull();
    const sneaky = readComments(JSON.stringify({ format: COMMENTS_FORMAT, version: 1, from: '‮Eve', items: [{ t: 'patch', patches: [] }, { t: 'doc', doc: {} }, { t: 'done' }, note('b', 'ok'), { t: 'note', id: 'x', x: 0, y: 0, text: 'p\u0000q' }] }), 1)!;
    expect(sneaky.items.map((i) => i.t)).toEqual(['note', 'note']);
    expect((sneaky.items[1] as { text: string }).text).toBe('pq');
    expect(sneaky.from).toBe('Eve');
  });
  it('caps how much it reads', () => {
    const many = Array.from({ length: MAX_COMMENTS + 50 }, (_, i) => note('n' + i));
    expect(readComments(writeComments('S', many, 1), 1)!.items).toHaveLength(MAX_COMMENTS);
  });
});
