import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape, Layer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isInstance, poseAt } from '../../src/core/symbols';
import { findTemplate } from '../../src/templates';
import { deleteKeys, moveKeys, removeKeys, retimeKeys, scaleKeys } from '../../src/timeline/keys';
import { layerTracks, parseRef } from '../../src/timeline/tracks';

const logoDoc = (): Doc => findTemplate('bouncing-logo')!.make();
const logoOf = (d: Doc): Layer => d.layers.find((l) => l.name === 'Logo')!;
// Tracks are cached per layer object and drawings object, so edited-in-place docs are read from a copy.
const tracksOf = (d: Doc) => {
  const c = structuredClone(d);
  return layerTracks(c, logoOf(c));
};
const frames = (d: Doc, id: string) => tracksOf(d).find((t) => t.id === id)?.keys.map((k) => k.frame);
const keyAt = (d: Doc, id: string, frame: number) => tracksOf(d).find((t) => t.id === id)!.keys.find((k) => k.frame === frame)!.ref;
const inst = (d: Doc, frame: number): InstanceShape => {
  const l = logoOf(d);
  const c = l.cels.find((x) => x.start === frame)!;
  const dr = d.drawings[c.drawingId];
  if (dr.kind !== 'vector') throw new Error('not vector');
  return dr.shapes.find(isInstance)!;
};
const starts = (d: Doc) => logoOf(d).cels.map((c) => c.start);

// The logo has drawing keys at 0, 20, 30, 36 and 47. Position keys sit at 0, 20, 30 and 47 (36 holds 30's spot),
// size keys at 0, 20, 30, 47.
describe('property-row keys on a symbol', () => {
  it('start out as keys of their own, one per row', () => {
    const d = logoDoc();
    expect(starts(d)).toEqual([0, 20, 30, 36, 47]);
    expect(frames(d, 'position')).toEqual([0, 20, 30, 47]);
    expect(frames(d, 'scale')).toEqual([0, 20, 30, 47]);
    expect(keyAt(d, 'position', 30)).not.toBe(keyAt(d, 'scale', 30));
    expect(parseRef(keyAt(d, 'position', 30))).toMatchObject({ kind: 'prop', propId: 'position' });
  });

  it('retiming a position key moves only the position, not the drawing or the other rows', () => {
    const d = logoDoc();
    const scale30 = inst(d, 30).transform.scaleX;
    const rot47 = inst(d, 47).transform.rotation;
    const out = retimeKeys(d, [keyAt(d, 'position', 30)], (f) => f + 3);
    expect(out).toHaveLength(1);
    expect(frames(d, 'position')).toEqual([0, 20, 33, 47]);
    // Size, turn and see-through keys stay where they were.
    expect(frames(d, 'scale')).toEqual([0, 20, 30, 47]);
    expect(inst(d, 30).transform.scaleX).toBe(scale30);
    expect(inst(d, 47).transform.rotation).toBe(rot47);
    // The key now at 30 holds the position of the key before it; the new key at 33 carries the old value.
    expect(inst(d, 30).transform.y).toBe(inst(d, 20).transform.y);
    expect(inst(d, 33).transform.y).toBe(320);
    // The result names the moved key on its new frame.
    expect(parseRef(out![0])).toMatchObject({ kind: 'prop', propId: 'position' });
    expect(tracksOf(d).find((t) => t.id === 'position')!.keys.map((k) => k.ref)).toContain(out![0]);
  });

  it('a new key made mid-tween keeps the picture the same on every other row', () => {
    const d = logoDoc();
    const l = logoOf(d);
    const before = poseAt(d, l, 33) as { shapes: InstanceShape[] };
    const scaleBefore = before.shapes[0].transform.scaleX;
    retimeKeys(d, [keyAt(d, 'position', 30)], (f) => f + 3);
    // Size at frame 33 is still the in-between it was, now a key of the drawing there.
    expect(inst(d, 33).transform.scaleX).toBeCloseTo(scaleBefore, 6);
    expect(frames(d, 'scale')).toEqual([0, 20, 30, 47]);
  });

  it('lands on a drawing key that is not a position key by giving it the position', () => {
    const d = logoDoc();
    const y = inst(d, 30).transform.y;
    retimeKeys(d, [keyAt(d, 'position', 30)], () => 36);
    expect(starts(d)).toEqual([0, 20, 30, 36, 47]);
    expect(frames(d, 'position')).toEqual([0, 20, 36, 47]);
    expect(inst(d, 36).transform.y).toBe(y);
    expect(frames(d, 'scale')).toEqual([0, 20, 30, 47]);
  });

  it('refuses to land on another key of the same row, or on a frame with no drawing', () => {
    const d = logoDoc();
    const snap = JSON.stringify(d);
    expect(retimeKeys(d, [keyAt(d, 'position', 30)], () => 47)).toBeNull();
    expect(retimeKeys(d, [keyAt(d, 'position', 30)], () => 60)).toBeNull();
    // The first key can't slide later: the layer starts there.
    expect(retimeKeys(d, [keyAt(d, 'position', 0)], () => 5)).toBeNull();
    expect(JSON.stringify(d)).toBe(snap);
  });

  it('moves a drawing key as before (the whole drawing, with every property on it)', () => {
    const d = logoDoc();
    const ref = `c:${logoOf(d).id}:${logoOf(d).cels[2].id}`;
    retimeKeys(d, [ref], (f) => f + 2);
    expect(frames(d, 'position')).toEqual([0, 20, 32, 47]);
    expect(frames(d, 'scale')).toEqual([0, 20, 32, 47]);
  });

  it('moves several rows at once, each on its own', () => {
    const d = logoDoc();
    retimeKeys(d, [keyAt(d, 'position', 30), keyAt(d, 'scale', 30)], (f) => f + 3);
    expect(frames(d, 'position')).toEqual([0, 20, 33, 47]);
    expect(frames(d, 'scale')).toEqual([0, 20, 33, 47]);
    expect(frames(d, 'rotation')).toEqual([0, 20]);
  });

  it('squeezes position keys together without touching other rows', () => {
    const d = logoDoc();
    const refs = tracksOf(d).find((t) => t.id === 'position')!.keys.map((k) => k.ref);
    expect(retimeKeys(d, refs, (f) => Math.round(f * 0.5))).toHaveLength(4);
    expect(frames(d, 'position')).toEqual([0, 10, 15, 24]);
    // Size still has its own keys where it had them. Keys cut out of the tweens carry its in-between values, so they
    // show on that row too, but the picture at every one of those frames is the same.
    expect(frames(d, 'scale')).toEqual(expect.arrayContaining([0, 20, 30, 47]));
    expect(inst(d, 20).transform.scaleX).toBe(1);
    // Spreading them past the last drawing is refused.
    const e = logoDoc();
    const all = tracksOf(e).find((t) => t.id === 'position')!.keys.map((k) => k.ref);
    expect(retimeKeys(e, all, (f) => f * 2)).toBeNull();
  });

  it('deleting a position key only resets that position to the key before', () => {
    const d = logoDoc();
    expect(removeKeys(d, [keyAt(d, 'position', 20)])).toBe(true);
    expect(starts(d)).toEqual([0, 20, 30, 36, 47]);
    expect(frames(d, 'position')).toEqual([0, 30, 47]);
    expect(frames(d, 'scale')).toEqual([0, 20, 30, 47]);
    expect(inst(d, 20).transform.y).toBe(inst(d, 0).transform.y);
    // The first key can't be taken away: the layer needs a start.
    expect(removeKeys(d, [keyAt(d, 'position', 0)])).toBe(false);
  });

  it('opacity and tint keys work the same way', () => {
    const d = logoDoc();
    const o = keyAt(d, 'opacity', 47);
    retimeKeys(d, [o], () => 36);
    expect(frames(d, 'opacity')).toEqual([0, 36]);
    expect(inst(d, 47).opacity).toBe(inst(d, 36).opacity);
    expect(frames(d, 'position')).toEqual([0, 20, 30, 47]);
  });
});

describe('property-row key edits on the store', () => {
  it('are one undo step each, and undo puts everything back', () => {
    resetStore(logoDoc());
    const doc = () => store().get().doc;
    const before = JSON.stringify(doc());
    const o = moveKeys([keyAt(doc(), 'position', 30)], 3);
    expect(o.ok).toBe(true);
    expect(frames(doc(), 'position')).toEqual([0, 20, 33, 47]);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
    expect(deleteKeys([keyAt(doc(), 'position', 20)]).ok).toBe(true);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
    const refs = tracksOf(doc()).find((t) => t.id === 'position')!.keys.map((k) => k.ref);
    const sq = scaleKeys(refs, 0.6);
    expect(sq.ok).toBe(true);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
  });

  it('refuses a locked layer', () => {
    resetStore(logoDoc());
    store().update('lock', (d) => void (logoOf(d as Doc).locked = true));
    expect(moveKeys([keyAt(store().get().doc, 'position', 30)], 3).ok).toBe(false);
  });
});
