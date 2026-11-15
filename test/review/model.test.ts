import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasMark, CanvasNote, Doc } from '../../src/core/format';
import { driftOf, isEmptyReview, mergeReview, momentWords, readReview, reviewFileName, reviewItems, structureSig, summaryWords, MAX_REVIEW_REPLIES, type ReviewFile } from '../../src/review/model';

const doc = (): Doc => {
  const d = newDoc({ name: 'Sunny day', width: 200, height: 100 });
  d.id = 'doc1';
  d.length = 12;
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c1', start: 2, length: 4, drawingId: 'dx' }];
  d.layers = [l];
  return d;
};

const mine: CanvasNote[] = [
  { id: 'a', x: 10, y: 10, text: 'the elbow pops', pin: 'frame', frame: 3, by: 'Shane', at: 1000 },
  { id: 'b', x: 50, y: 20, text: 'colour?', replies: [{ id: 'r0', text: 'blue', by: 'Shane', at: 1100 }] },
];

const review = (over: Record<string, unknown> = {}) => ({
  format: 'frameling-review',
  doc: 'doc1',
  from: 'Anna',
  sent: 5000,
  made: 6000,
  length: 12,
  notes: [{ id: 'n1', x: 5, y: 6, text: 'too dark', pin: 'frame', frame: 2 }],
  replies: [{ note: 'b', id: 'r1', text: 'I like it' }],
  marks: [{ id: 'm1', kind: 'arrow', pts: [1, 2, 30, 40] }],
  done: ['a'],
  ...over,
});
const ok = (raw: unknown): ReviewFile => {
  const r = readReview(raw);
  if (!r.ok) throw new Error(r.why);
  return r.review;
};

describe('reading a comments file', () => {
  it('round trips what the review page writes, through text and through bytes', () => {
    const text = JSON.stringify(review());
    const a = ok(text);
    expect(a.from).toBe('Anna');
    expect(a.doc).toBe('doc1');
    expect(a.notes).toHaveLength(1);
    expect(a.replies[0]).toMatchObject({ note: 'b', id: 'r1', text: 'I like it', by: 'Anna', at: 6000 });
    expect(a.marks[0]).toMatchObject({ id: 'm1', kind: 'arrow', by: 'Anna', at: 6000 });
    expect(a.done).toEqual(['a']);
    expect(a.sent).toBe(5000);
    expect(ok(new TextEncoder().encode(text))).toEqual(a);
    expect(ok(JSON.parse(text))).toEqual(a);
  });
  it('puts the reviewer on what has no name or time, and keeps what does', () => {
    const a = ok(review({ notes: [{ id: 'n1', x: 1, y: 1, text: 'a' }, { id: 'n2', x: 1, y: 1, text: 'b', by: 'Bo', at: 77 }] }));
    expect(a.notes[0]).toMatchObject({ by: 'Anna', at: 6000 });
    expect(a.notes[1]).toMatchObject({ by: 'Bo', at: 77 });
  });
  it('copes with pasted text: a sentence round it, a code fence, curly quotes', () => {
    const text = JSON.stringify(review());
    expect(ok('Here are my comments!\n```\n' + text + '\n```\nThanks').notes).toHaveLength(1);
    expect(ok(text.replace(/"/g, '“')).notes).toHaveLength(1);
  });
  it('refuses junk with a reason and never throws', () => {
    for (const bad of [undefined, null, 4, '', 'hello', '{', '[]', '{"format":"other"}', { format: 'frameling-review' }, { format: 'frameling-review', doc: 4 }, new Uint8Array([1, 2, 3]), { format: 'x', doc: 'doc1' }]) {
      const r = readReview(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.why.length).toBeGreaterThan(10);
    }
  });
  it('drops malformed notes, marks and answers instead of failing', () => {
    const a = ok(review({ notes: [{ id: 'x', text: 'no place' }, 7, null, { id: 'ok', x: 1, y: 1, text: 'fine' }, { id: 'e', x: 1, y: 1, text: '  ' }], marks: [{ id: 'q', kind: 'laser', pts: [1, 2, 3, 4] }, { id: 'p', kind: 'arrow', pts: ['a'] }, 'junk'], replies: [{ id: 'r', text: 'no target' }, { note: 'b', text: '' }, 'x', { note: 'b', id: 'g', text: 'good' }], done: ['a', 4, null, ''] }));
    expect(a.notes.map((n) => n.id)).toEqual(['ok']);
    expect(a.marks).toEqual([]);
    expect(a.replies.map((r) => r.id)).toEqual(['g']);
    expect(a.done).toEqual(['a']);
  });
  it('caps what a hand-made file can hold', () => {
    const many = Array.from({ length: MAX_REVIEW_REPLIES + 500 }, (_, i) => ({ note: 'n' + (i % 20), id: 'r' + i, text: 'x' }));
    expect(ok(review({ replies: many })).replies.length).toBeLessThanOrEqual(MAX_REVIEW_REPLIES);
    expect(ok(review({ from: 'x'.repeat(500) })).from.length).toBeLessThanOrEqual(80);
    expect(readReview('{"format":"frameling-review","doc":"d","pad":"' + 'x'.repeat(4_100_000) + '"}').ok).toBe(false);
  });
  it('knows an empty file, and gives a name to a reviewer who left it out', () => {
    const e = ok(review({ notes: [], replies: [], marks: [], done: [], from: '  ' }));
    expect(isEmptyReview(e)).toBe(true);
    expect(e.from).toBe('A reviewer');
  });
});

describe('merging by id', () => {
  const have = () => ({ notes: structuredClone(mine), marks: [] as CanvasMark[] });
  it('adds notes, answers and marks, with who and when, and ticks off what was ticked', () => {
    const m = mergeReview(have(), ok(review()));
    expect(m.notes.map((n) => n.id)).toEqual(['a', 'b', 'n1']);
    expect(m.notes[1].replies!.map((r) => r.id)).toEqual(['r0', 'r1']);
    expect(m.notes[1].replies![1]).toMatchObject({ by: 'Anna', at: 6000 });
    expect(m.notes[0].done).toBe(true);
    expect(m.marks[0]).toMatchObject({ id: 'm1', by: 'Anna' });
    expect(m.summary).toEqual({ notes: 1, replies: 1, marks: 1, ticked: 1, orphans: 0 });
  });
  it('does not change what it was given', () => {
    const h = have();
    const before = JSON.stringify(h);
    mergeReview(h, ok(review()));
    expect(JSON.stringify(h)).toBe(before);
  });
  it('changes nothing the second time, and never replaces what is already here', () => {
    const once = mergeReview(have(), ok(review()));
    const twice = mergeReview(once, ok(review({ notes: [{ id: 'a', x: 99, y: 99, text: 'overwritten?' }, { id: 'n1', x: 5, y: 6, text: 'edited' }] })));
    expect(twice.summary).toEqual({ notes: 0, replies: 0, marks: 0, ticked: 0, orphans: 0 });
    expect(twice.notes.find((n) => n.id === 'a')!.text).toBe('the elbow pops');
    expect(twice.notes.find((n) => n.id === 'n1')!.text).toBe('too dark');
  });
  it('takes two reviewers at once with nothing clashing', () => {
    const anna = ok(review());
    const bo = ok(review({ from: 'Bo', notes: [{ id: 'n2', x: 1, y: 1, text: 'love it' }], replies: [{ note: 'b', id: 'r2', text: 'agree' }], marks: [{ id: 'm2', kind: 'circle', pts: [1, 1, 9, 9] }], done: ['b'] }));
    const m = mergeReview(mergeReview(have(), anna), bo);
    const final = mergeReview(mergeReview(have(), bo), anna);
    const ids = (x: typeof m) => [x.notes.map((n) => n.id).sort(), x.notes.flatMap((n) => (n.replies ?? []).map((r) => r.id)).sort(), x.marks.map((k) => k.id).sort()];
    expect(ids(m)).toEqual(ids(final));
    expect(ids(m)).toEqual([['a', 'b', 'n1', 'n2'], ['r0', 'r1', 'r2'], ['m1', 'm2']]);
    expect(m.notes.find((n) => n.id === 'b')!.replies!.map((r) => r.by)).toEqual(['Shane', 'Anna', 'Bo']);
    expect(m.notes.filter((n) => n.done).map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
  it('a later page can carry an earlier reviewer\'s notes, and a second reviewer answers them', () => {
    const first = mergeReview(have(), ok(review()));
    const second = mergeReview(first, ok(review({ from: 'Bo', notes: [], replies: [{ note: 'n1', id: 'r9', text: 'agreed' }], marks: [], done: [] })));
    expect(second.notes.find((n) => n.id === 'n1')!.replies).toMatchObject([{ id: 'r9', by: 'Bo' }]);
  });
  it('done is ticked if either side ticked it, and the owner can untick afterwards', () => {
    const h = have();
    h.notes[1].done = true;
    const m = mergeReview(h, ok(review({ done: ['a'] })));
    expect(m.notes.map((n) => !!n.done)).toEqual([true, true, false]);
    // The reviewer's file saying nothing about "b" never unticks it.
    expect(mergeReview(m, ok(review({ done: [] }))).notes.find((n) => n.id === 'b')!.done).toBe(true);
    // The owner unticks: a normal edit, and bringing in nothing new leaves it so.
    const unticked = m.notes.map((n) => (n.id === 'a' ? { ...n, done: undefined } : n));
    expect(mergeReview({ notes: unticked }, ok(review({ done: [], notes: [], marks: [], replies: [{ note: 'b', id: 'rz', text: 'hm' }] }))).notes.find((n) => n.id === 'a')!.done).toBeUndefined();
  });
  it('leaves out answers to notes that are gone, and says how many', () => {
    const m = mergeReview(have(), ok(review({ replies: [{ note: 'gone', id: 'x', text: 'hello?' }] })));
    expect(m.summary.orphans).toBe(1);
    expect(m.summary.replies).toBe(0);
  });
  it('plain words for what came in', () => {
    expect(summaryWords({ notes: 3, replies: 2, marks: 1, ticked: 0, orphans: 0 })).toBe('3 notes, 2 answers and 1 mark');
    expect(summaryWords({ notes: 1, replies: 0, marks: 0, ticked: 0, orphans: 0 })).toBe('1 note');
    expect(summaryWords({ notes: 0, replies: 0, marks: 0, ticked: 2, orphans: 0 })).toBe('2 ticked off');
    expect(summaryWords({ notes: 0, replies: 0, marks: 0, ticked: 0, orphans: 0 })).toBe('nothing new');
  });
});

describe('which version was reviewed', () => {
  it('the fingerprint changes when frames move, not when you draw', () => {
    const d = doc();
    const sig = structureSig(d);
    expect(structureSig(doc())).toBe(sig);
    const moved = doc();
    moved.layers[0].cels[0].start = 3;
    expect(structureSig(moved)).not.toBe(sig);
    const longer = doc();
    longer.length = 13;
    expect(structureSig(longer)).not.toBe(sig);
    const drew = doc();
    drew.layers[0].cels[0].drawingId = 'other';
    expect(structureSig(drew)).toBe(sig);
  });
  it('says so when frames moved, and when it is another drawing', () => {
    const d = doc();
    const r = ok(review({ sig: structureSig(d) }));
    expect(driftOf(d, r)).toMatchObject({ otherDoc: false, drifted: false, sent: 5000, was: 12, now: 12 });
    const moved = doc();
    moved.layers[0].cels[0].start = 5;
    expect(driftOf(moved, r).drifted).toBe(true);
    expect(driftOf({ ...d, id: 'else' }, r).otherDoc).toBe(true);
  });
  it('without a fingerprint it falls back to the frame count, and without either it stays quiet', () => {
    const d = doc();
    expect(driftOf(d, ok(review({ length: 10 }))).drifted).toBe(true);
    expect(driftOf(d, ok(review({ length: undefined }))).drifted).toBe(false);
  });
  it('plain words for a moment and a file name', () => {
    expect(momentWords(new Date(2026, 10, 12, 15, 4).getTime())).toBe('12 Nov, 3:04 pm');
    expect(momentWords(new Date(2026, 0, 2, 0, 9).getTime())).toBe('2 Jan, 12:09 am');
    expect(reviewFileName('Sunny / day: 2')).toBe('Sunny day 2 review.html');
    expect(reviewFileName('///')).toBe('Drawing review.html');
  });
});

describe('what goes on the page', () => {
  it('keeps the notes and marks, takes layer ids out, and says which frames a layer note shows on', () => {
    const d = doc();
    d.notes = [...mine, { id: 'l', x: 1, y: 1, text: 'on the lines', pin: 'layer', layer: 'L1' }];
    d.marks = [{ id: 'k', kind: 'arrow', pts: [1, 2, 3, 4], pin: 'layer', layer: 'L1', by: 'Me', at: 9 }];
    const { notes, marks } = reviewItems(d);
    expect(notes.map((n) => n.id)).toEqual(['a', 'b', 'l']);
    expect(notes[2]).not.toHaveProperty('layer');
    expect(notes[2].f).toEqual([2, 3, 4, 5]);
    expect(marks[0].f).toEqual([2, 3, 4, 5]);
    expect(JSON.stringify([notes, marks])).not.toContain('"layer"');
  });
  it('shows nothing while a symbol is open', () => {
    const d = doc();
    d.notes = mine;
    d.editing = ['sym'] as never;
    expect(reviewItems(d)).toEqual({ notes: [], marks: [] });
  });
});
