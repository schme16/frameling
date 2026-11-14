import { describe, expect, it } from 'vitest';
import type { Doc, Easing, InstanceShape, Layer } from '../../src/core/format';
import { cameraViewOn } from '../../src/core/camera';
import { cutSlice, tweenEase, ease } from '../../src/core/ease';
import { resetStore, store } from '../../src/core/store';
import { poseAt } from '../../src/core/symbols';
import { rigPoseAt } from '../../src/rig/pose';
import { findTemplate } from '../../src/templates';
import { deleteKeys, moveKeys, removeKeys, retimeKeys, scaleKeys } from '../../src/timeline/keys';
import { layerTracks, parseRef, type KeyRef } from '../../src/timeline/tracks';

const tpl = (id: string): Doc => findTemplate(id)!.make();
// Tracks are cached per layer object and drawings object, so edited-in-place docs are read from a copy.
const framesOf = (d: Doc, layerName: string, id: string) => {
  const c = structuredClone(d);
  return layerTracks(c, c.layers.find((l) => l.name === layerName)!).find((t) => t.id === id)?.keys.map((k) => k.frame);
};
const keyAt = (d: Doc, layerName: string, id: string, frame: number): KeyRef => {
  const c = structuredClone(d);
  return layerTracks(c, c.layers.find((l) => l.name === layerName)!).find((t) => t.id === id)!.keys.find((k) => k.frame === frame)!.ref;
};
const layerOf = (d: Doc, name: string) => d.layers.find((l) => l.name === name)!;

// ---------------------------------------------------------------- the easing split
describe('cutting an easing curve in two', () => {
  const eases: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'elasticOut', 'bounceOut', [0.2, 0.8, 0.7, 0.1]];
  it('plays the same motion as the one span, for every kind of easing', () => {
    for (const e of eases) {
      for (const at of [0.25, 0.5, 0.8]) {
        const [first, second] = cutSlice({}, at);
        // The value at the cut is the curve's value there; each half runs from there, normalised.
        const v = ease(e, at);
        for (const u of [0, 0.2, 0.5, 0.9, 1]) {
          const a = tweenEase({ ease: e, slice: first }, u) * v;
          expect(a).toBeCloseTo(ease(e, at * u), 6);
          const b = v + tweenEase({ ease: e, slice: second }, u) * (1 - v);
          expect(b).toBeCloseTo(ease(e, at + (1 - at) * u), 6);
        }
      }
    }
  });
  it('cuts a cut span again and still lines up with the original curve', () => {
    const [a, b] = cutSlice({}, 0.5);
    const [b1, b2] = cutSlice({ slice: b }, 0.5);
    expect(a).toEqual([0, 0.5]);
    expect(b1).toEqual([0.5, 0.75]);
    expect(b2).toEqual([0.75, 1]);
    expect(cutSlice({ slice: [0.5, 1] }, 0)[1]).toEqual([0.5, 1]);
  });
  it('leaves a whole-curve span without a slice', () => {
    expect(cutSlice({}, 0.5)[0]).toEqual([0, 0.5]);
    expect(tweenEase({ ease: 'easeIn' }, 0.4)).toBe(ease('easeIn', 0.4));
  });
});

// ---------------------------------------------------------------- the logo: the tween keeps its easing
describe('retiming a symbol key inside a tween', () => {
  const logo = (d: Doc) => layerOf(d, 'Logo');
  const sample = (d: Doc) => {
    const l = logo(d);
    const out: number[][] = [];
    for (let f = 0; f < 50; f++) {
      const s = (poseAt(d, l, f) as { shapes: InstanceShape[] } | undefined)?.shapes[0];
      out.push(s ? [s.transform.scaleX, s.transform.scaleY, s.transform.rotation, s.opacity] : []);
    }
    return out;
  };
  it('does not change how size, turn and see-through move through the span', () => {
    for (const e of ['easeInOut', 'elasticOut', [0.1, 0.9, 0.3, 1.2]] as Easing[]) {
      const d = tpl('bouncing-logo');
      for (const c of logo(d).cels) if (c.tween) c.tween.ease = e;
      const before = sample(d);
      // Position key at 30 moves to 33: inside the tween that runs 30 to 36. Frame 33 is cut out of it.
      expect(retimeKeys(d, [keyAt(d, 'Logo', 'position', 30)], (f) => f + 3)).not.toBeNull();
      const after = sample(d);
      for (let f = 0; f < 50; f++) {
        // Position moved on purpose; the other rows match to the last decimal.
        for (let k = 0; k < before[f].length; k++) expect(after[f][k]).toBeCloseTo(before[f][k], 5);
      }
      // The two halves play parts of one curve.
      const cels = logo(d).cels.filter((c) => c.start >= 30 && c.start <= 36);
      expect(cels.map((c) => c.start)).toEqual([30, 33, 36]);
      expect(cels[0].tween?.slice).toBeDefined();
      expect(cels[1].tween?.slice?.[1]).toBeCloseTo(1, 9);
      expect(cels[0].tween?.slice?.[1]).toBeCloseTo(cels[1].tween!.slice![0], 9);
    }
  });
  it('holds through a second cut in the same span', () => {
    const d = tpl('bouncing-logo');
    for (const c of logo(d).cels) if (c.tween) c.tween.ease = 'easeOut';
    const before = sample(d);
    retimeKeys(d, [keyAt(d, 'Logo', 'position', 30)], (f) => f + 2);
    retimeKeys(d, [keyAt(d, 'Logo', 'position', 32)], (f) => f + 2);
    const after = sample(d);
    for (let f = 0; f < 50; f++) for (let k = 0; k < before[f].length; k++) expect(after[f][k]).toBeCloseTo(before[f][k], 5);
  });
  it('shows the cut span as one curve on the other rows', () => {
    const d = tpl('bouncing-logo');
    retimeKeys(d, [keyAt(d, 'Logo', 'position', 30)], (f) => f + 3);
    const c = structuredClone(d);
    const rot = layerTracks(c, logo(c)).find((t) => t.id === 'scale')!;
    // Size 20 to 30 is untouched; no span claims a part of a curve for it.
    expect(rot.spans.find((s) => s.from === 20)?.slice).toBeUndefined();
  });
  it('shows a diamond at the cut only on the row that was edited', () => {
    for (const e of ['easeInOut', 'elasticOut', [0.1, 0.9, 0.3, 1.2]] as Easing[]) {
      const d = tpl('bouncing-logo');
      for (const c of logo(d).cels) if (c.tween) c.tween.ease = e;
      const rows = (doc: Doc) => layerTracks(structuredClone(doc), logo(doc)).map((t) => [t.id, t.keys.map((k) => k.frame)] as const);
      const was = new Map(rows(d));
      retimeKeys(d, [keyAt(d, 'Logo', 'position', 30)], (f) => f + 3);
      const now = new Map(rows(d));
      // Position has its key at 33; no other row gets one there, and the other rows keep the keys they had.
      expect(now.get('position')).toContain(33);
      for (const [id, frames] of now) {
        if (id === 'position') continue;
        expect(frames, id).not.toContain(33);
        expect(frames, id).toEqual(was.get(id));
      }
      // The two halves still show as one span from key to key on the quiet rows.
      const scale = layerTracks(structuredClone(d), logo(d)).find((t) => t.id === 'scale');
      if (scale) expect(scale.spans.some((s) => s.from <= 30 && s.to >= 36)).toBe(true);
    }
  });
  it('keeps a diamond where the value was set at the cut, or the easing differs', () => {
    const d = tpl('bouncing-logo');
    retimeKeys(d, [keyAt(d, 'Logo', 'position', 30)], (f) => f + 3);
    const cel = logo(d).cels.find((c) => c.start === 33)!;
    // Change the size on the cut key by hand: it is now a real key of the size row.
    const dr = d.drawings[cel.drawingId];
    if (dr.kind === 'vector') for (const sh of dr.shapes) if (sh.type === 'instance') sh.transform.scaleX += 0.5;
    expect(layerTracks(structuredClone(d), logo(d)).find((t) => t.id === 'scale')!.keys.map((k) => k.frame)).toContain(33);
    // A different easing on the second half means the halves are not one curve: show everything that differs.
    const e = tpl('bouncing-logo');
    retimeKeys(e, [keyAt(e, 'Logo', 'position', 30)], (f) => f + 3);
    logo(e).cels.find((c) => c.start === 33)!.tween!.ease = 'bounceOut';
    expect(layerTracks(structuredClone(e), logo(e)).some((t) => t.id !== 'position' && t.keys.some((k) => k.frame === 33))).toBe(true);
  });
});

// ---------------------------------------------------------------- bones
describe('bone rows', () => {
  const rigName = 'Bones';
  const rig = (d: Doc) => layerOf(d, rigName);
  const boneRows = (d: Doc) => layerTracks(structuredClone(d), rig(d)).map((t) => t.id);
  const poseOf = (d: Doc, f: number) => JSON.parse(JSON.stringify(rigPoseAt(d, rig(d), f)));
  const eased = (): Doc => {
    const d = tpl('puppet');
    for (const c of rig(d).cels) if (c.tween) c.tween.ease = 'easeInOut';
    return d;
  };

  it('keys are keys of the bone, not of the drawing', () => {
    const d = tpl('puppet');
    const [row] = boneRows(d);
    const ref = keyAt(d, rigName, row, 12);
    expect(parseRef(ref)).toMatchObject({ kind: 'prop', propId: row });
  });

  it('moving one bone key moves only that bone and leaves every other bone moving as before', () => {
    const d = eased();
    const rows = boneRows(d);
    const id = rows[3].slice('bone-'.length);
    const before = Array.from({ length: 24 }, (_, f) => poseOf(d, f));
    const out = retimeKeys(d, [keyAt(d, rigName, rows[3], 12)], (f) => f + 2);
    expect(out).toHaveLength(1);
    expect(framesOf(d, rigName, rows[3])).toEqual([0, 6, 14, 18, 23]);
    // Other bones' own keys are where they were.
    expect(framesOf(d, rigName, rows[0])).toEqual(expect.arrayContaining([0, 6, 12, 18, 23]));
    for (let f = 0; f < 24; f++) {
      const p = poseOf(d, f);
      for (const k of Object.keys(before[f])) {
        if (k === id) continue;
        expect(p[k]?.r ?? 0).toBeCloseTo(before[f][k]?.r ?? 0, 5);
        expect(p[k]?.x ?? 0).toBeCloseTo(before[f][k]?.x ?? 0, 5);
      }
    }
    // The bone itself now takes its pose at 14, and has the earlier pose at 12.
    expect(poseOf(d, 12)[id]?.r ?? 0).toBeCloseTo(poseOf(d, 6)[id]?.r ?? 0, 5);
    expect(poseOf(d, 14)[id]?.r ?? 0).toBeCloseTo(before[12][id]?.r ?? 0, 5);
  });

  it('landing on another drawing key gives that key the pose, with no new key', () => {
    const d = tpl('puppet');
    const rows = boneRows(d);
    const starts = rig(d).cels.map((c) => c.start);
    const id = rows[1].slice('bone-'.length);
    const r12 = poseOf(d, 12)[id]?.r ?? 0;
    // 12 -> 18 would collide with this bone's own key there.
    expect(retimeKeys(d, [keyAt(d, rigName, rows[1], 12)], () => 18)).toBeNull();
    expect(removeKeys(d, [keyAt(d, rigName, rows[1], 12)])).toBe(true);
    expect(rig(d).cels.map((c) => c.start)).toEqual(starts);
    // At 12 it now holds the pose of 6, which is also the pose at 18, so 18 no longer shows as a key.
    expect(framesOf(d, rigName, rows[1])).toEqual([0, 6, 23]);
    expect(poseOf(d, 12)[id]?.r ?? 0).toBeCloseTo(poseOf(d, 6)[id]?.r ?? 0, 5);
    expect(r12).not.toBeCloseTo(poseOf(d, 12)[id]?.r ?? 0, 3);
    // The first key of a row can't be deleted.
    expect(removeKeys(d, [keyAt(d, rigName, rows[1], 0)])).toBe(false);
  });

  it('stretches bone keys without touching other rows, and is one undo step on the store', () => {
    resetStore(tpl('puppet'));
    const doc = () => store().get().doc;
    const before = JSON.stringify(doc());
    const rows = boneRows(doc());
    const refs = [6, 12, 18].map((f) => keyAt(doc(), rigName, rows[2], f));
    expect(scaleKeys(refs, 0.5).ok).toBe(true);
    expect(framesOf(doc(), rigName, rows[2])).toEqual([0, 6, 9, 12, 23]);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
    expect(moveKeys([keyAt(doc(), rigName, rows[2], 12)], 3).ok).toBe(true);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
    expect(deleteKeys([keyAt(doc(), rigName, rows[2], 12)]).ok).toBe(true);
    store().undo();
    expect(JSON.stringify(doc())).toBe(before);
  });

  it('refuses on a locked layer, and says why when keys collide', () => {
    resetStore(tpl('puppet'));
    const rows = boneRows(store().get().doc);
    const ref = keyAt(store().get().doc, rigName, rows[0], 12);
    const hit = moveKeys([ref], 6);
    expect(hit.ok).toBe(false);
    if (!hit.ok) expect(hit.why).toMatch(/other keys/);
    store().update('lock', (d) => void (rig(d as Doc).locked = true));
    const locked = moveKeys([ref], 2);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.why).toMatch(/locked/);
  });
});

// ---------------------------------------------------------------- camera
describe('camera rows', () => {
  const cam = (d: Doc) => layerOf(d, 'Camera');
  const view = (d: Doc, f: number) => cameraViewOn(d, cam(d), f)!;

  it('keys are keys of one row; moving the zoom key leaves where it looks and the turn as they were', () => {
    const d = tpl('camera-parallax');
    const before = Array.from({ length: 72 }, (_, f) => view(d, f));
    const ref = keyAt(d, 'Camera', 'cam-zoom', 60);
    expect(parseRef(ref)).toMatchObject({ kind: 'prop', propId: 'cam-zoom' });
    // 48 is inside the 36 to 60 in-between, which eases in and out.
    expect(retimeKeys(d, [ref], () => 48)).not.toBeNull();
    expect(framesOf(d, 'Camera', 'cam-zoom')).toEqual([0, 48]);
    for (let f = 0; f < 72; f++) {
      const v = view(d, f);
      expect(v.x).toBeCloseTo(before[f].x, 5);
      expect(v.y).toBeCloseTo(before[f].y, 5);
      expect(v.rotation).toBeCloseTo(before[f].rotation, 5);
    }
    expect(framesOf(d, 'Camera', 'cam-position')).toEqual(expect.arrayContaining([0, 36, 60]));
    expect(cam(d).cels.map((c) => c.start)).toContain(48);
    // Zoom itself now reaches its end value at 48 and stays there.
    expect(view(d, 48).zoom).toBeCloseTo(before[60].zoom, 5);
    expect(view(d, 40).zoom).not.toBeCloseTo(before[40].zoom, 3);
  });

  it('delete resets only that row to the key before', () => {
    const d = tpl('camera-parallax');
    const before = view(d, 60);
    expect(removeKeys(d, [keyAt(d, 'Camera', 'cam-rotation', 60)])).toBe(true);
    expect(framesOf(d, 'Camera', 'cam-rotation')).toBeUndefined();
    expect(view(d, 60).rotation).toBeCloseTo(view(d, 0).rotation, 5);
    expect(view(d, 60).x).toBeCloseTo(before.x, 5);
  });

  it('refuses frames with no camera key, and locked layers', () => {
    const d = tpl('camera-parallax');
    const snap = JSON.stringify(d);
    expect(retimeKeys(d, [keyAt(d, 'Camera', 'cam-zoom', 60)], () => 90)).toBeNull();
    expect(JSON.stringify(d)).toBe(snap);
    resetStore(tpl('camera-parallax'));
    store().update('lock', (x) => void (cam(x as Doc).locked = true));
    const o = moveKeys([keyAt(store().get().doc, 'Camera', 'cam-zoom', 60)], -3);
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.why).toMatch(/locked/);
  });
});

// ---------------------------------------------------------------- morph rows stay with the drawing
describe('morph rows', () => {
  it('keys belong to the drawing: moving one moves the whole key', () => {
    const d = tpl('morphing-shapes');
    const l = d.layers.find((x) => layerTracks(structuredClone(d), x).some((t) => t.id === 'shape'))!;
    const t = layerTracks(structuredClone(d), l).find((x) => x.id === 'shape')!;
    expect(t.keys.every((k) => k.ref.startsWith('c:'))).toBe(true);
  });
});
