// The scheduler on a fake slow link: a pointer never waits for a whole drawing, a slot holds only the latest, the drawing goes
// in order, and a reviewer who falls behind is caught up instead of sent the backlog.
import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, Lanes, Reassembler, chunkFromBytes, chunkToBytes, type Chunk } from '../../src/review/lanes';

const bytes = (n: number, v = 1) => new Uint8Array(n).fill(v);
function drain(l: Lanes, max = 10_000): Chunk[] {
  const out: Chunk[] = [];
  for (let c = l.next(); c && out.length < max; c = l.next()) out.push(c);
  return out;
}

describe('lanes', () => {
  it('cuts a big message into chunks and puts it back together', () => {
    const l = new Lanes();
    const big = Uint8Array.from({ length: CHUNK_BYTES * 3 + 10 }, (_, i) => i & 255);
    l.sendOrdered(big);
    const chunks = drain(l);
    expect(chunks).toHaveLength(4);
    expect(chunks[0].first).toBe(true);
    expect(chunks[3].last).toBe(true);
    const r = new Reassembler(1e9);
    let whole: Uint8Array | null = null;
    for (const c of chunks) whole = r.push(chunkFromBytes(chunkToBytes(c))!)?.bytes ?? whole;
    expect([...whole!]).toEqual([...big]);
  });

  it('lets a pointer through between two chunks of a big drawing', () => {
    const l = new Lanes();
    l.sendOrdered(bytes(CHUNK_BYTES * 5));
    l.next();
    l.next();
    l.setPointer(bytes(12, 9));
    const next = l.next()!;
    expect(next.lane).toBe('pointer');
  });

  it('keeps only the newest pointer', () => {
    const l = new Lanes();
    l.setPointer(bytes(12, 1));
    l.setPointer(bytes(12, 2));
    l.setPointer(bytes(12, 3));
    const c = drain(l);
    expect(c).toHaveLength(1);
    expect(c[0].data[0]).toBe(3);
  });

  it('keeps the latest of a slot, and urgent things go first', () => {
    const l = new Lanes();
    l.setSlot('ink', bytes(50, 1));
    l.setSlot('ink', bytes(50, 2));
    l.sendUrgent(bytes(5, 7));
    const c = drain(l);
    expect(c.map((x) => x.lane)).toEqual(['urgent', 'ink']);
    expect(c[1].data[0]).toBe(2);
  });

  it('sends the drawing in order, one message after another', () => {
    const l = new Lanes();
    for (let i = 1; i <= 5; i++) l.sendOrdered(bytes(100, i));
    expect(drain(l).map((c) => c.data[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not let a stream of strokes starve the drawing, or the drawing starve the strokes', () => {
    const l = new Lanes();
    l.sendOrdered(bytes(100, 1));
    l.sendOrdered(bytes(100, 2));
    l.setSlot('ink', bytes(100, 9));
    const lanes = drain(l).map((c) => c.lane);
    expect(lanes).toContain('ink');
    expect(lanes.filter((x) => x === 'ordered')).toHaveLength(2);
    // The slot did not have to wait for both drawing messages.
    expect(lanes.indexOf('ink')).toBeLessThan(2);
  });

  it('catches a reviewer up: the backlog is dropped for a whole drawing and what followed it', () => {
    const l = new Lanes();
    for (let i = 0; i < 20; i++) l.sendOrdered(bytes(1000, i));
    l.next();
    expect(l.orderedBytes).toBeGreaterThan(10_000);
    l.catchUp([bytes(500, 100), bytes(50, 101)]);
    expect(l.orderedBytes).toBe(550);
    expect(drain(l).map((c) => c.data[0])).toEqual([100, 101]);
  });

  it('a half message whose start was replaced is dropped by the receiver, not mixed', () => {
    const l = new Lanes();
    l.sendOrdered(bytes(CHUNK_BYTES * 2, 1));
    const a = l.next()!;
    l.catchUp([bytes(20, 2)]);
    const r = new Reassembler(1e9);
    expect(r.push(a)).toBeNull();
    const got = drain(l).map((c) => r.push(c)).filter(Boolean);
    expect(got).toHaveLength(1);
    expect(got[0]!.bytes[0]).toBe(2);
  });

  it('refuses a message that grows past the cap', () => {
    const r = new Reassembler(100);
    r.push({ lane: 'ordered', id: 1, first: true, last: false, data: bytes(60) });
    expect(() => r.push({ lane: 'ordered', id: 1, first: false, last: false, data: bytes(60) })).toThrow();
  });

  it('is idle when everything has gone', () => {
    const l = new Lanes();
    expect(l.idle).toBe(true);
    l.setSlot('look', bytes(3));
    expect(l.idle).toBe(false);
    drain(l);
    expect(l.idle).toBe(true);
  });
});
