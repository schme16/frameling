import { describe, expect, it } from 'vitest';
import { POINTER_EVERY_MS, POINTER_FADE_AFTER_MS, PointerSender, Pointers, colourOfSeat, pointerAlpha } from '../../src/review/pointer';
import { Outbox } from '../../src/review/outbox';
import { Replay } from '../../src/review/replay';
import { readFromReviewer, type ReviewItem } from '../../src/review/wire';

describe('the pointer', () => {
  it('goes at most 30 times a second, newest position first, and never the same spot twice', () => {
    const s = new PointerSender();
    expect(s.move(0, 1, 1)).toMatchObject({ n: 1, x: 1, y: 1 });
    expect(s.move(10, 2, 2)).toBeNull();
    expect(s.move(20, 3, 3)).toBeNull();
    expect(s.waitMs(20)).toBe(POINTER_EVERY_MS - 20);
    expect(s.due(POINTER_EVERY_MS)).toMatchObject({ n: 2, x: 3, y: 3 });
    expect(s.move(100, 3, 3)).toBeNull();
    expect(s.move(200, 4, 4, true)).toMatchObject({ off: true });
  });
  it('drops a pointer older than the one held, and fades one that has gone quiet', () => {
    const p = new Pointers();
    expect(p.see(1, { n: 5, x: 1, y: 1 }, 0)).toBe(true);
    expect(p.see(1, { n: 4, x: 9, y: 9 }, 1)).toBe(false);
    expect(p.visible(10)[0].dot.x).toBe(1);
    expect(p.visible(POINTER_FADE_AFTER_MS + 1000)).toHaveLength(0);
    p.forget(1);
    p.see(2, { n: 1, x: 1, y: 1, off: true }, 5);
    expect(p.visible(6)).toHaveLength(0);
    expect(pointerAlpha(0)).toBe(1);
    expect(pointerAlpha(POINTER_FADE_AFTER_MS + 200)).toBeGreaterThan(0);
    expect(colourOfSeat(0)).not.toBe(colourOfSeat(1));
  });
});

describe('the outbox', () => {
  const n: ReviewItem = { t: 'note', id: 'a', x: 0, y: 0, text: 'hi', at: 1 };
  it('keeps everything until it is acknowledged, and survives a file', () => {
    const o = new Outbox();
    o.add(n);
    o.add({ t: 'mark', mark: { id: 'm', kind: 'arrow', pts: [0, 0, 1, 1] } });
    expect(o.waiting).toBe(2);
    o.ack(['a', 'nope']);
    expect(o.pending().map((i) => (i.t === 'mark' ? i.mark.id : i.id))).toEqual(['m']);
    expect(o.sent('a')).toBe(true);
    const back = Outbox.from(JSON.parse(JSON.stringify(o)), (r) => readFromReviewer(r, 1) as ReviewItem | null);
    expect(back.waiting).toBe(1);
  });
});

describe('the replay cache', () => {
  it('catches somebody up with the drawing and what followed, and says when a fresh drawing is cheaper', () => {
    const r = new Replay();
    expect(r.ready).toBe(false);
    expect(r.catchUp()).toEqual([]);
    r.ordered('doc', new Uint8Array(100));
    expect(r.ordered('patch', new Uint8Array(40))).toBe(false);
    expect(r.ordered('patch', new Uint8Array(70))).toBe(true);
    expect(r.catchUp()).toHaveLength(3);
    r.ordered('doc', new Uint8Array(100));
    expect(r.catchUp()).toHaveLength(1);
    r.slot('look', new Uint8Array(3));
    expect(r.latestSlots().map((s) => s.lane)).toEqual(['look']);
  });
});
