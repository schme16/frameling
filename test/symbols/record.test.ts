import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PathShape, VectorDrawing } from '../../src/core/format';
import { planMove, type MovePlan, type Sample } from '../../src/core/recordMotion';
import { resetStore, store } from '../../src/core/store';
import { instanceAt, isInstance } from '../../src/core/symbols';
import { setToolSettings } from '../../src/tools/settings';
import { applyRecording, backTo, beginLive, clearTake, commitTake, getTake, historyMark, moveLive, recordAgain, retune, runsOver, takeIsLatest } from '../../src/symbols/recording';

function square(id: string, x: number, y: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

function setup(length = 24, celLength = 24): Doc {
  const doc = newDoc({ width: 400, height: 200, length, fps: 12 });
  const d = newVectorDrawing();
  d.shapes.push(square('a', 10, 10), square('b', 60, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: celLength, drawingId: d.id });
  return doc;
}

/** A hand going right and then down, over `secs`, read every 10 ms. */
function hand(secs: number, shake = 0): Sample[] {
  const out: Sample[] = [];
  for (let t = 0; t <= secs + 1e-9; t += 0.01) {
    const u = t / secs;
    const x = u < 0.5 ? 200 * u * 2 : 200;
    const y = u < 0.5 ? 0 : 100 * (u - 0.5) * 2;
    out.push({ t, x: 50 + x + Math.sin(t * 200) * shake, y: 20 + y + Math.cos(t * 170) * shake });
  }
  return out;
}

const plan = (secs: number, detail: number, keep: 'keys' | 'path' = 'keys'): MovePlan => planMove(hand(secs, 1.5), 12, detail, keep, 0.4)!;
const w = (doc: Doc, frame = 0) => ({ layerId: doc.layers[0].id, frame, selection: [] as string[] });
const firstInstance = (doc: Doc, drawingId: string) => (doc.drawings[drawingId] as VectorDrawing).shapes.find(isInstance) as InstanceShape;

describe('applying a recording', () => {
  it('makes keys with in-betweens from the playhead, relative to where the thing was', () => {
    const doc = setup(24, 24);
    const p = plan(2, 0.5);
    const out = applyRecording(doc, w(doc, 3), p);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const cels = doc.layers[0].cels;
    expect(cels[0]).toMatchObject({ start: 0, length: 3 });
    expect(cels.length).toBe(1 + p.keys.length);
    expect(cels[1].start).toBe(3);
    expect(cels[cels.length - 1].start).toBe(3 + p.frames);
    expect(cels.slice(1, -1).every((c) => !!c.tween)).toBe(true);
    expect(cels[cels.length - 1].tween).toBeUndefined();
    // No gaps, no overlaps.
    for (let i = 1; i < cels.length; i++) expect(cels[i].start).toBe(cels[i - 1].start + cels[i - 1].length);
    // The first key is where the thing was, the last is that plus the drag.
    const rest = firstInstance(doc, cels[1].drawingId).transform;
    const last = firstInstance(doc, cels[cels.length - 1].drawingId).transform;
    const k = p.keys[p.keys.length - 1];
    expect(last.x).toBeCloseTo(rest.x + k.x);
    expect(last.y).toBeCloseTo(rest.y + k.y);
    expect(k.x).toBeGreaterThan(150);
    expect(doc.length).toBeGreaterThanOrEqual(3 + p.frames + 1);
  });

  it('more detail gives more keys; every frame at the top', () => {
    const counts = [0.1, 0.5, 0.9, 1].map((d) => plan(2, d).keys.length);
    expect(counts[0]).toBeLessThanOrEqual(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
    expect(counts[3]).toBe(25);
  });

  it('path mode is two keys, a path and an easing, and the thing starts and ends where the keys say', () => {
    const doc = setup();
    const p = plan(2, 0.5, 'path');
    const out = applyRecording(doc, w(doc), p, 'replace', true);
    expect(out.ok).toBe(true);
    const cels = doc.layers[0].cels;
    expect(cels.length).toBe(2);
    expect(cels[0].tween!.path!.orient).toBe(true);
    expect(cels[0].tween!.path!.points.length).toBeGreaterThanOrEqual(2);
    const layer = doc.layers[0];
    const a = instanceAt(doc, layer, 0, firstInstance(doc, cels[0].drawingId).id)!;
    const z = firstInstance(doc, cels[1].drawingId).transform;
    expect(cels[0].tween!.path!.points[0].x).toBeCloseTo(a.transform.x);
    expect(cels[0].tween!.path!.points[cels[0].tween!.path!.points.length - 1].x).toBeCloseTo(z.x);
  });

  it('moves everything that is selected by the same drag', () => {
    const doc = setup();
    const d = doc.drawings[doc.layers[0].cels[0].drawingId] as VectorDrawing;
    const out = applyRecording(doc, { layerId: doc.layers[0].id, frame: 0, selection: ['a', 'b'] }, plan(1, 0.5));
    expect(out.ok && out.instanceIds.length).toBe(1);
    expect(d).toBeTruthy();
  });

  it('replaces keys it runs over, or pushes them along', () => {
    const base = () => {
      const doc = setup(40, 4);
      const d2 = newVectorDrawing();
      d2.shapes.push(square('z', 0, 0));
      doc.drawings[d2.id] = d2;
      doc.layers[0].cels.push({ id: 'c2', start: 6, length: 10, drawingId: d2.id });
      return { doc, d2 };
    };
    const p = plan(2, 0.5); // 24 frames
    const a = base();
    expect(runsOver(a.doc, w(a.doc), p)).toBe(true);
    expect(applyRecording(a.doc, w(a.doc), p, 'replace').ok).toBe(true);
    expect(a.doc.layers[0].cels.some((c) => c.id === 'c2')).toBe(false);
    expect(a.doc.drawings[a.d2.id]).toBeUndefined();
    const b = base();
    expect(applyRecording(b.doc, w(b.doc), p, 'push').ok).toBe(true);
    const moved = b.doc.layers[0].cels.find((c) => c.id === 'c2')!;
    expect(moved.start).toBe(p.frames + 1);
    expect(moved.length).toBe(10);
    const cels = b.doc.layers[0].cels;
    for (let i = 1; i < cels.length; i++) expect(cels[i].start).toBeGreaterThanOrEqual(cels[i - 1].start + cels[i - 1].length);
    // Nothing to ask when there is room.
    const room = setup(40, 40);
    expect(runsOver(room, w(room), p)).toBe(false);
  });

  it('records over a move that is already there, from its first key', () => {
    const doc = setup(40, 40);
    expect(applyRecording(doc, w(doc), plan(1, 0.5)).ok).toBe(true);
    expect(doc.layers[0].cels.length).toBeGreaterThan(1);
    const again = applyRecording(doc, w(doc), plan(2, 0.5), 'replace');
    expect(again.ok).toBe(true);
    const cels = doc.layers[0].cels;
    expect(cels[cels.length - 1].start).toBe(plan(2, 0.5).frames);
    for (let i = 1; i < cels.length; i++) expect(cels[i].start).toBe(cels[i - 1].start + cels[i - 1].length);
  });

  it('says so when there is nothing to move', () => {
    const doc = newDoc({ width: 100, height: 100, length: 12 });
    const out = applyRecording(doc, { layerId: doc.layers[0].id, frame: 0, selection: [] }, plan(1, 0.5));
    expect(out.ok).toBe(false);
  });
});

describe('recording live, then tidying', () => {
  beforeEach(() => {
    const doc = setup(24, 24);
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
    setToolSettings({ recordDetail: 0.5, recordKeep: 'keys', recordFace: false });
    clearTake();
  });

  it('what happens while dragging leaves no trace, and the result is one undo step', () => {
    const doc0 = store().get().doc;
    const mark = historyMark();
    const r = beginLive({ layerId: doc0.layers[0].id, frame: 0, selection: [] });
    expect('live' in r).toBe(true);
    if (!('live' in r)) return;
    for (let f = 0; f < 10; f++) moveLive(r.live, f * 10, f * 5, f);
    // Live, the held drawing follows the hand.
    const cel = store().get().doc.layers[0].cels[0];
    expect(firstInstance(store().get().doc, cel.drawingId).transform.x).toBeGreaterThan(r.live.rests[0].x + 80);
    backTo(mark);
    expect(store().get().doc).toEqual(doc0);

    const saved = { frame: 0, activeLayerId: doc0.layers[0].id, selection: [] as string[] };
    const before = store().historyIds().undo;
    commitTake(hand(2, 1), { layerId: doc0.layers[0].id, frame: 0, selection: [] }, saved);
    expect(getTake()).not.toBeNull();
    expect(takeIsLatest()).toBe(true);
    const keys = getTake()!.keys;
    expect(keys).toBeGreaterThan(2);
    store().undo();
    expect(store().historyIds().undo).toBe(before);
    expect(store().get().doc).toEqual(doc0);
  });

  it('retuning swaps the result in place, with no extra undo steps', () => {
    const doc0 = store().get().doc;
    const saved = { frame: 0, activeLayerId: doc0.layers[0].id, selection: [] as string[] };
    commitTake(hand(2, 1), { layerId: doc0.layers[0].id, frame: 0, selection: [] }, saved);
    const few = getTake()!.keys;
    setToolSettings({ recordDetail: 1 });
    retune();
    expect(getTake()!.keys).toBeGreaterThan(few);
    expect(takeIsLatest()).toBe(true);
    setToolSettings({ recordKeep: 'path' });
    retune();
    expect(getTake()!.keys).toBe(2);
    store().undo();
    expect(store().get().doc).toEqual(doc0);
    expect(takeIsLatest()).toBe(false);
  });

  it('record again takes it back', () => {
    const doc0 = store().get().doc;
    commitTake(hand(2, 1), { layerId: doc0.layers[0].id, frame: 0, selection: [] }, { frame: 0, activeLayerId: doc0.layers[0].id, selection: [] });
    recordAgain();
    expect(store().get().doc).toEqual(doc0);
    expect(getTake()).toBeNull();
  });

  it('a click, with nothing moved, makes nothing', () => {
    const doc0 = store().get().doc;
    commitTake([{ t: 0, x: 5, y: 5 }, { t: 0.1, x: 5, y: 5 }], { layerId: doc0.layers[0].id, frame: 0, selection: [] }, { frame: 0, activeLayerId: null, selection: [] });
    expect(store().get().doc).toEqual(doc0);
    expect(getTake()).toBeNull();
  });
});
