import { describe, expect, it } from 'vitest';
import * as core from '../../src/timeline/edit-core';
import * as ops from '../../src/timeline/ops';
import { celAt, pruneDrawings } from '../../src/core/doc';
import { addCel, docWith, isTidy, shape, storeWith } from './helpers';

const L = (doc: ReturnType<typeof docWith>) => doc.layers[0];

describe('new blank key', () => {
  it('makes a one-frame key on an empty frame at the end', () => {
    const d = docWith([[0, 2]]);
    const id = core.newBlankKey(d, L(d).id, 5);
    expect(id).toBeTruthy();
    expect(shape(L(d))).toEqual([[0, 2], [5, 1]]);
  });
  it('fills an empty gap up to the next key', () => {
    const d = docWith([[0, 1], [6, 2]]);
    core.newBlankKey(d, L(d).id, 2);
    expect(shape(L(d))).toEqual([[0, 1], [2, 4], [6, 2]]);
  });
  it('splits a hold in two, the later part with a new drawing', () => {
    const d = docWith([[0, 6]]);
    const first = L(d).cels[0].drawingId;
    core.newBlankKey(d, L(d).id, 2);
    expect(shape(L(d))).toEqual([[0, 2], [2, 4]]);
    expect(L(d).cels[0].drawingId).toBe(first);
    expect(L(d).cels[1].drawingId).not.toBe(first);
    expect(Object.keys(d.drawings)).toHaveLength(2);
  });
  it('swaps in a blank drawing on the first frame of a key, and prunes the old one', () => {
    const d = docWith([[0, 3]]);
    const old = L(d).cels[0].drawingId;
    core.newBlankKey(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[0, 3]]);
    expect(L(d).cels[0].drawingId).not.toBe(old);
    expect(d.drawings[old]).toBeUndefined();
  });
  it('can start as a copy of the drawing it splits', () => {
    const d = docWith([[0, 4]]);
    const dr = d.drawings[L(d).cels[0].drawingId];
    if (dr.kind === 'vector') dr.shapes.push({ id: 's1', type: 'fill', paths: [], color: '#000000', opacity: 1 });
    core.newBlankKey(d, L(d).id, 2, true);
    const copy = d.drawings[L(d).cels[1].drawingId];
    expect(copy.kind === 'vector' && copy.shapes).toHaveLength(1);
    expect(copy.kind === 'vector' && copy.shapes[0].id).not.toBe('s1');
  });
  it('grows the document when the key lands past the end', () => {
    const d = docWith([[0, 2]], 4);
    core.newBlankKey(d, L(d).id, 9);
    expect(d.length).toBe(10);
  });
  it('makes a pixel drawing of the right size on a pixel layer', () => {
    const d = docWith([]);
    const pid = core.addPixelLayer(d, null, 'P', 16);
    core.newBlankKey(d, pid, 0);
    const layer = d.layers.find((l) => l.id === pid)!;
    const dr = d.drawings[layer.cels[0].drawingId];
    expect(dr.kind).toBe('pixel');
    if (dr.kind === 'pixel') expect([dr.width, dr.height]).toEqual([80, 45]);
  });
  it('refuses a missing layer or a negative frame', () => {
    const d = docWith([]);
    expect(core.newBlankKey(d, 'nope', 0)).toBeNull();
    expect(core.newBlankKey(d, L(d).id, -1)).toBeNull();
  });
});

describe('duplicate key', () => {
  it('copies to the next frame when it is empty', () => {
    const d = docWith([[0, 1]]);
    core.duplicateKey(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[0, 1], [1, 1]]);
    expect(L(d).cels[0].drawingId).not.toBe(L(d).cels[1].drawingId);
  });
  it('splits the hold when the next frame is part of it', () => {
    const d = docWith([[0, 4]]);
    core.duplicateKey(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[0, 1], [1, 3]]);
  });
  it('splits mid-hold', () => {
    const d = docWith([[2, 5]]);
    core.duplicateKey(d, L(d).id, 4);
    expect(shape(L(d))).toEqual([[2, 3], [5, 2]]);
  });
  it('pushes later keys right when the next frame is taken', () => {
    const d = docWith([[0, 1], [1, 2], [5, 1]]);
    core.duplicateKey(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[0, 1], [1, 1], [2, 2], [6, 1]]);
    expect(isTidy(L(d))).toBe(true);
  });
  it('deep-copies shapes with new ids', () => {
    const d = docWith([[0, 1]]);
    const src = d.drawings[L(d).cels[0].drawingId];
    if (src.kind === 'vector') src.shapes.push({ id: 'a', type: 'fill', paths: [{ points: [{ x: 1, y: 1 }], closed: true }], color: '#000000', opacity: 1 });
    core.duplicateKey(d, L(d).id, 0);
    const copy = d.drawings[L(d).cels[1].drawingId];
    if (copy.kind === 'vector' && src.kind === 'vector') {
      expect(copy.shapes[0].id).not.toBe('a');
      expect(copy.shapes[0]).not.toBe(src.shapes[0]);
    }
  });
  it('copies pixel buffers, not shares them', () => {
    const d = docWith([]);
    const pid = core.addPixelLayer(d, null, 'P', 8);
    core.newBlankKey(d, pid, 0);
    const layer = d.layers.find((l) => l.id === pid)!;
    const a = d.drawings[layer.cels[0].drawingId];
    if (a.kind === 'pixel') a.pixels[0] = 255;
    core.duplicateKey(d, pid, 0);
    const b = d.drawings[layer.cels[1].drawingId];
    if (a.kind === 'pixel' && b.kind === 'pixel') {
      expect(b.pixels[0]).toBe(255);
      expect(b.pixels).not.toBe(a.pixels);
    }
  });
  it('does nothing on an empty frame', () => {
    const d = docWith([[3, 1]]);
    expect(core.duplicateKey(d, L(d).id, 0)).toBeNull();
  });
});

describe('clear and delete key', () => {
  it('clear keeps the hold but swaps the drawing', () => {
    const d = docWith([[0, 3]]);
    const old = L(d).cels[0].drawingId;
    expect(core.clearKey(d, L(d).id, 1)).toBe(true);
    expect(shape(L(d))).toEqual([[0, 3]]);
    expect(L(d).cels[0].drawingId).not.toBe(old);
  });
  it('clear leaves a drawing shared with another cel alone', () => {
    const d = docWith([[0, 1], [2, 1]]);
    L(d).cels[1].drawingId = L(d).cels[0].drawingId;
    core.clearKey(d, L(d).id, 0);
    expect(L(d).cels[0].drawingId).not.toBe(L(d).cels[1].drawingId);
    expect(d.drawings[L(d).cels[1].drawingId]).toBeDefined();
  });
  it('delete empties the frames', () => {
    const d = docWith([[0, 3], [5, 1]]);
    expect(core.deleteKey(d, L(d).id, 2)).toBe(true);
    expect(shape(L(d))).toEqual([[5, 1]]);
    expect(Object.keys(d.drawings)).toHaveLength(1);
    expect(core.deleteKey(d, L(d).id, 2)).toBe(false);
  });
});

describe('insert and remove frame', () => {
  it('holds a drawing one longer and shifts the rest', () => {
    const d = docWith([[0, 2], [2, 1], [4, 1]]);
    core.insertFrame(d, L(d).id, 1);
    expect(shape(L(d))).toEqual([[0, 3], [3, 1], [5, 1]]);
  });
  it('on an empty frame adds an empty frame', () => {
    const d = docWith([[0, 1], [4, 2]]);
    core.insertFrame(d, L(d).id, 2);
    expect(shape(L(d))).toEqual([[0, 1], [5, 2]]);
  });
  it('at the last frame just extends the last cel and the document', () => {
    const d = docWith([[0, 4]], 4);
    core.insertFrame(d, L(d).id, 3);
    expect(shape(L(d))).toEqual([[0, 5]]);
    expect(d.length).toBe(5);
  });
  it('at frame 0 on an empty start shifts everything', () => {
    const d = docWith([[2, 2]]);
    core.insertFrame(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[3, 2]]);
  });
  it('removes a frame from a hold and closes up', () => {
    const d = docWith([[0, 3], [3, 1]]);
    core.removeFrame(d, L(d).id, 1);
    expect(shape(L(d))).toEqual([[0, 2], [2, 1]]);
  });
  it('removes a one-frame key entirely', () => {
    const d = docWith([[0, 1], [1, 1], [2, 1]]);
    core.removeFrame(d, L(d).id, 1);
    expect(shape(L(d))).toEqual([[0, 1], [1, 1]]);
    expect(Object.keys(d.drawings)).toHaveLength(2);
  });
  it('removes the very last frame', () => {
    const d = docWith([[0, 1], [1, 1]]);
    core.removeFrame(d, L(d).id, 1);
    expect(shape(L(d))).toEqual([[0, 1]]);
  });
  it('closes an empty gap frame', () => {
    const d = docWith([[0, 1], [4, 1]]);
    core.removeFrame(d, L(d).id, 2);
    expect(shape(L(d))).toEqual([[0, 1], [3, 1]]);
  });
  it('does nothing on empty frames after the last cel', () => {
    const d = docWith([[0, 1]]);
    expect(core.removeFrame(d, L(d).id, 5)).toBe(false);
  });
});

describe('exposure and resizing', () => {
  it('sets 1 to 4 frames, pushing later cels', () => {
    const d = docWith([[0, 1], [1, 1], [2, 1]]);
    core.setExposure(d, L(d).id, 0, 2);
    expect(shape(L(d))).toEqual([[0, 2], [2, 1], [3, 1]]);
    core.setExposure(d, L(d).id, 0, 4);
    expect(shape(L(d))).toEqual([[0, 4], [4, 1], [5, 1]]);
    core.setExposure(d, L(d).id, 3, 1);
    expect(shape(L(d))).toEqual([[0, 1], [4, 1], [5, 1]]);
  });
  it('uses a gap instead of pushing when there is room', () => {
    const d = docWith([[0, 1], [5, 1]]);
    core.setExposure(d, L(d).id, 0, 3);
    expect(shape(L(d))).toEqual([[0, 3], [5, 1]]);
  });
  it('trim mode cuts the next cel back, and deletes it if covered', () => {
    const d = docWith([[0, 1], [1, 3], [4, 1]]);
    core.resizeCel(d, L(d).id, L(d).cels[0].id, 3, 'trim');
    expect(shape(L(d))).toEqual([[0, 3], [3, 1], [4, 1]]);
    core.resizeCel(d, L(d).id, L(d).cels[0].id, 5, 'trim');
    expect(shape(L(d))).toEqual([[0, 5]]);
    expect(Object.keys(d.drawings)).toHaveLength(3); // pruning is the caller's job for plain resize
  });
  it('pushes the document longer when needed', () => {
    const d = docWith([[0, 1], [1, 3]], 4);
    core.resizeCel(d, L(d).id, L(d).cels[0].id, 3);
    expect(shape(L(d))).toEqual([[0, 3], [3, 3]]);
    expect(d.length).toBe(6);
  });
  it('clamps to at least one frame and reports no change', () => {
    const d = docWith([[0, 2]]);
    core.resizeCel(d, L(d).id, L(d).cels[0].id, -4);
    expect(shape(L(d))).toEqual([[0, 1]]);
    expect(core.resizeCel(d, L(d).id, L(d).cels[0].id, 1)).toBe(false);
  });
  it('refuses exposure on an empty frame', () => {
    const d = docWith([[3, 1]]);
    expect(core.setExposure(d, L(d).id, 0, 2)).toBe(false);
  });
});

describe('move cel', () => {
  it('moves into a gap', () => {
    const d = docWith([[0, 2], [5, 1]]);
    core.moveCel(d, L(d).id, L(d).cels[0].id, 2);
    expect(shape(L(d))).toEqual([[2, 2], [5, 1]]);
  });
  it('pushes cels it lands on', () => {
    const d = docWith([[0, 2], [3, 2], [5, 1]]);
    core.moveCel(d, L(d).id, L(d).cels[0].id, 3);
    expect(shape(L(d))).toEqual([[3, 2], [5, 2], [7, 1]]);
    expect(isTidy(L(d))).toBe(true);
  });
  it('cuts the tail of a cel it lands inside', () => {
    const d = docWith([[0, 5], [8, 1]]);
    core.moveCel(d, L(d).id, L(d).cels[1].id, 3);
    expect(shape(L(d))).toEqual([[0, 3], [3, 1]]);
  });
  it('trim mode overwrites', () => {
    const d = docWith([[0, 2], [3, 2], [5, 3]]);
    core.moveCel(d, L(d).id, L(d).cels[0].id, 3, 'trim');
    expect(shape(L(d))).toEqual([[3, 2], [5, 3]]);
    const e = docWith([[0, 2], [3, 4]]);
    core.moveCel(e, L(e).id, L(e).cels[0].id, 3, 'trim');
    expect(shape(e.layers[0])).toEqual([[3, 2], [5, 2]]);
  });
  it('never goes before frame 0 and ignores a no-op', () => {
    const d = docWith([[2, 2]]);
    core.moveCel(d, L(d).id, L(d).cels[0].id, -5);
    expect(shape(L(d))).toEqual([[0, 2]]);
    expect(core.moveCel(d, L(d).id, L(d).cels[0].id, 0)).toBe(false);
  });
  it('moves to another layer of the same kind but not a different kind', () => {
    const d = docWith([[0, 2]]);
    const v = core.addVectorLayer(d);
    const p = core.addPixelLayer(d);
    const cel = L(d).cels[0].id;
    expect(core.moveCel(d, L(d).id, cel, 0, 'push', p)).toBe(false);
    expect(core.moveCel(d, L(d).id, cel, 4, 'push', v)).toBe(true);
    expect(shape(d.layers.find((l) => l.id === v)!)).toEqual([[4, 2]]);
    expect(L(d).cels).toHaveLength(0);
  });
});

describe('layers', () => {
  it('adds vector and pixel layers above the active one with sensible names', () => {
    const d = docWith([]);
    const a = core.addVectorLayer(d, d.layers[0].id);
    const b = core.addPixelLayer(d, null);
    expect(d.layers.map((l) => l.id)).toEqual([d.layers[0].id, a, b]);
    expect(new Set(d.layers.map((l) => l.name)).size).toBe(3);
    const l = d.layers[2];
    expect(l.kind === 'pixel' && l.pixelSize).toBe(8);
  });
  it('takes the pixel size from another pixel layer', () => {
    const d = docWith([]);
    core.addPixelLayer(d, null, 'a', 4);
    core.addVectorLayer(d);
    const id = core.addPixelLayer(d, null);
    const l = d.layers.find((x) => x.id === id)!;
    expect(l.kind === 'pixel' && l.pixelSize).toBe(4);
  });
  it('inserts above the named layer, not at the top', () => {
    const d = docWith([]);
    const first = d.layers[0].id;
    core.addVectorLayer(d);
    const mid = core.addVectorLayer(d, first);
    expect(d.layers[1].id).toBe(mid);
  });
  it('deletes a layer and its drawings, but never the last', () => {
    const d = docWith([[0, 1]]);
    const second = core.addVectorLayer(d);
    addCel(d, d.layers[1], 0, 2);
    expect(Object.keys(d.drawings)).toHaveLength(2);
    expect(core.deleteLayer(d, second)).toEqual({ next: d.layers[0].id });
    expect(Object.keys(d.drawings)).toHaveLength(1);
    expect(core.deleteLayer(d, d.layers[0].id)).toBeNull();
    expect(d.layers).toHaveLength(1);
  });
  it('duplicates a layer with copied drawings', () => {
    const d = docWith([[0, 2], [2, 1]]);
    L(d).cels[1].drawingId = L(d).cels[0].drawingId; // shared drawing stays shared inside the copy
    pruneDrawings(d);
    const copyId = core.duplicateLayer(d, L(d).id)!;
    expect(d.layers[1].id).toBe(copyId);
    const copy = d.layers[1];
    expect(copy.name).toBe('Layer 1 copy');
    expect(shape(copy)).toEqual(shape(L(d)));
    expect(copy.cels[0].id).not.toBe(L(d).cels[0].id);
    expect(copy.cels[0].drawingId).not.toBe(L(d).cels[0].drawingId);
    expect(copy.cels[0].drawingId).toBe(copy.cels[1].drawingId);
    expect(Object.keys(d.drawings)).toHaveLength(2);
  });
  it('reorders and steps', () => {
    const d = docWith([]);
    const [a] = d.layers.map((l) => l.id);
    const b = core.addVectorLayer(d);
    const c = core.addVectorLayer(d);
    core.reorderLayer(d, a, 2);
    expect(d.layers.map((l) => l.id)).toEqual([b, c, a]);
    core.stepLayer(d, a, 'down');
    expect(d.layers.map((l) => l.id)).toEqual([b, a, c]);
    expect(core.stepLayer(d, c, 'up')).toBe(false);
    expect(core.stepLayer(d, b, 'down')).toBe(false);
    expect(core.reorderLayer(d, a, 99)).toBe(true);
    expect(d.layers[2].id).toBe(a);
  });
  it('renames, toggles and sets opacity within range', () => {
    const d = docWith([]);
    const id = d.layers[0].id;
    expect(core.renameLayer(d, id, '  Body ')).toBe(true);
    expect(d.layers[0].name).toBe('Body');
    expect(core.renameLayer(d, id, '   ')).toBe(false);
    expect(core.setLayerVisible(d, id, false)).toBe(true);
    expect(core.setLayerVisible(d, id, false)).toBe(false);
    expect(core.setLayerLocked(d, id, true)).toBe(true);
    core.setLayerOpacity(d, id, 7);
    expect(d.layers[0].opacity).toBe(1);
    core.setLayerOpacity(d, id, -1);
    expect(d.layers[0].opacity).toBe(0);
  });
});

describe('document, clips and markers', () => {
  it('sets fps and length within limits', () => {
    const d = docWith([]);
    core.setFps(d, 0);
    expect(d.fps).toBe(1);
    core.setFps(d, 9999);
    expect(d.fps).toBe(core.MAX_FPS);
    core.setDocLength(d, 0);
    expect(d.length).toBe(1);
    core.setDocLength(d, 48.4);
    expect(d.length).toBe(48);
  });
  it('adds clips in any order, kept inside the doc', () => {
    const d = docWith([], 24);
    const id = core.addClip(d, 12, 3);
    expect(d.clips[0]).toMatchObject({ id, name: 'Clip 1', start: 3, end: 12, loop: true });
    core.addClip(d, -4, 100, 'Run');
    expect(d.clips[1]).toMatchObject({ name: 'Run', start: 0, end: 23 });
    expect(core.setClipRange(d, id, 5, 5)).toBe(true);
    expect(core.setClipLoop(d, id, false)).toBe(true);
    expect(core.renameClip(d, id, 'Idle')).toBe(true);
    expect(core.removeClip(d, id)).toBe(true);
    expect(core.removeClip(d, id)).toBe(false);
    expect(d.clips).toHaveLength(1);
  });
  it('adds, renames, moves and removes markers', () => {
    const d = docWith([], 24);
    const id = core.addMarker(d, 40);
    expect(d.markers[0]).toMatchObject({ frame: 23, name: 'Marker 1' });
    core.moveMarker(d, id, 4);
    core.renameMarker(d, id, 'Footstep');
    expect(d.markers[0]).toMatchObject({ frame: 4, name: 'Footstep' });
    expect(core.removeMarker(d, id)).toBe(true);
    expect(d.markers).toHaveLength(0);
  });
});

describe('applied ops: undo, labels and locking', () => {
  it('every cel op is one undo step with a label, and undo puts it back', () => {
    const cases: [string, () => ops.Outcome, [number, number][]][] = [
      ['New blank drawing', () => ops.newBlankKey(undefined, 1), [[0, 4]]],
      ['Copy drawing to next frame', () => ops.duplicateKey(undefined, 0), [[0, 4]]],
      ['Clear drawing', () => ops.clearKey(undefined, 0), [[0, 4]]],
      ['Make frames empty', () => ops.deleteKey(undefined, 0), [[0, 4]]],
      ['Add a frame', () => ops.insertFrame(undefined, 0), [[0, 4]]],
      ['Remove a frame', () => ops.removeFrame(undefined, 0), [[0, 4]]],
      ['Hold for 2 frames (on twos)', () => ops.setExposure(2, undefined, 0), [[0, 4]]],
    ];
    for (const [label, run, start] of cases) {
      const s = storeWith(start);
      const before = s.get().doc;
      const r = run();
      expect(r.ok, label).toBe(true);
      expect(s.undoLabel()).toBe(label);
      expect(s.get().doc).not.toBe(before);
      s.undo();
      expect(shape(s.get().doc.layers[0])).toEqual(start);
      expect(Object.keys(s.get().doc.drawings)).toHaveLength(1);
      s.redo();
      expect(s.get().doc).not.toBe(before);
    }
  });
  it('moves the playhead onto a duplicate', () => {
    const s = storeWith([[0, 1]]);
    ops.duplicateKey();
    expect(s.get().ui.frame).toBe(1);
  });
  it('refuses to edit a locked layer', () => {
    const s = storeWith([[0, 2]]);
    ops.setLayerLocked(s.get().doc.layers[0].id, true);
    for (const r of [ops.newBlankKey(), ops.insertFrame(), ops.setExposure(3), ops.moveCel(s.get().doc.layers[0].id, s.get().doc.layers[0].cels[0].id, 4)]) {
      expect(r).toMatchObject({ ok: false, reason: 'locked' });
      expect(ops.whyNot(r)).toMatch(/locked/);
    }
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 2]]);
  });
  it('says so when there is nothing on the frame', () => {
    storeWith([[3, 2]]);
    expect(ops.duplicateKey()).toMatchObject({ ok: false, reason: 'nothing-here' });
    expect(ops.setExposure(2)).toMatchObject({ ok: false, reason: 'nothing-here' });
    expect(ops.clearKey()).toMatchObject({ ok: false });
  });
  it('move and resize are undoable', () => {
    const s = storeWith([[0, 2]]);
    const l = s.get().doc.layers[0];
    ops.moveCel(l.id, l.cels[0].id, 4);
    expect(shape(s.get().doc.layers[0])).toEqual([[4, 2]]);
    ops.resizeCel(l.id, l.cels[0].id, 5);
    expect(shape(s.get().doc.layers[0])).toEqual([[4, 5]]);
    s.undo();
    s.undo();
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 2]]);
  });
  it('layer ops: add, select, delete (not the last), duplicate, undo', () => {
    const s = storeWith([[0, 1]]);
    const first = s.get().doc.layers[0].id;
    const v = ops.addVectorLayer();
    expect(s.get().ui.activeLayerId).toBe(v.id);
    expect(s.undoLabel()).toBe('Add vector layer');
    const p = ops.addPixelLayer();
    expect(s.get().doc.layers.map((l) => l.kind)).toEqual(['vector', 'vector', 'pixel']);
    expect(s.get().ui.activeLayerId).toBe(p.id);
    ops.deleteLayer(p.id);
    expect(s.get().ui.activeLayerId).toBe(v.id);
    expect(s.undoLabel()).toBe('Delete layer');
    s.undo();
    expect(s.get().doc.layers).toHaveLength(3);
    ops.deleteLayer(p.id);
    ops.deleteLayer(v.id);
    expect(ops.deleteLayer(first)).toMatchObject({ ok: false, reason: 'last-layer' });
    expect(s.get().doc.layers).toHaveLength(1);
    expect(s.get().ui.activeLayerId).toBe(first);
    const dup = ops.duplicateLayer(first);
    expect(s.get().doc.layers).toHaveLength(2);
    expect(s.get().ui.activeLayerId).toBe(dup.id);
    s.undo();
    expect(s.get().doc.layers).toHaveLength(1);
    expect(Object.keys(s.get().doc.drawings)).toHaveLength(1);
  });
  it('layer toggles, rename, reorder and opacity undo; opacity drags coalesce', () => {
    const s = storeWith([]);
    const id = s.get().doc.layers[0].id;
    const other = ops.addVectorLayer().id!;
    ops.toggleLayerVisible(id);
    expect(s.get().doc.layers[0].visible).toBe(false);
    s.undo();
    expect(s.get().doc.layers[0].visible).toBe(true);
    ops.toggleLayerLocked(id);
    expect(s.get().doc.layers[0].locked).toBe(true);
    s.undo();
    ops.renameLayer(id, 'Body');
    s.undo();
    expect(s.get().doc.layers[0].name).toBe('Layer 1');
    ops.reorderLayer(id, 1);
    expect(s.get().doc.layers[1].id).toBe(id);
    s.undo();
    expect(s.get().doc.layers[0].id).toBe(id);
    ops.setLayerOpacity(other, 0.8);
    ops.setLayerOpacity(other, 0.5);
    ops.setLayerOpacity(other, 0.2);
    expect(s.get().doc.layers[1].opacity).toBe(0.2);
    s.undo();
    expect(s.get().doc.layers[1].opacity).toBe(1);
  });
  it('fps, length, clips and markers undo', () => {
    const s = storeWith([]);
    ops.setFps(24);
    expect(s.get().doc.fps).toBe(24);
    s.undo();
    expect(s.get().doc.fps).toBe(12);
    ops.setDocLength(60);
    s.undo();
    expect(s.get().doc.length).toBe(24);
    const c = ops.addClip(2, 6, 'Walk');
    ops.setClipLoop(c.id!, false);
    ops.renameClip(c.id!, 'Run');
    ops.removeClip(c.id!);
    expect(s.get().doc.clips).toHaveLength(0);
    s.undo();
    expect(s.get().doc.clips[0]).toMatchObject({ name: 'Run', loop: false });
    s.undo();
    s.undo();
    s.undo();
    expect(s.get().doc.clips).toHaveLength(0);
    const m = ops.addMarker(5, 'Hit');
    ops.moveMarker(m.id!, 9);
    expect(s.get().doc.markers[0].frame).toBe(9);
    s.undo();
    s.undo();
    expect(s.get().doc.markers).toHaveLength(0);
  });
  it('keeps every layer tidy through a random run of edits', () => {
    const d = docWith([[0, 2], [4, 3], [9, 1]], 12);
    const id = L(d).id;
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    for (let i = 0; i < 400; i++) {
      const f = rnd(16);
      switch (rnd(8)) {
        case 0: core.newBlankKey(d, id, f); break;
        case 1: core.duplicateKey(d, id, f); break;
        case 2: core.insertFrame(d, id, f); break;
        case 3: core.removeFrame(d, id, f); break;
        case 4: core.setExposure(d, id, f, 1 + rnd(4)); break;
        case 5: if (L(d).cels.length) core.moveCel(d, id, L(d).cels[rnd(L(d).cels.length)].id, rnd(16), rnd(2) ? 'push' : 'trim'); break;
        case 6: if (L(d).cels.length) core.resizeCel(d, id, L(d).cels[rnd(L(d).cels.length)].id, 1 + rnd(5), rnd(2) ? 'push' : 'trim'); break;
        default: core.deleteKey(d, id, f);
      }
      expect(isTidy(L(d))).toBe(true);
      for (const c of L(d).cels) expect(d.drawings[c.drawingId]).toBeDefined();
      expect(celAt(L(d), 0) === undefined || celAt(L(d), 0)!.start === 0).toBe(true);
    }
  });
});

describe('onion skin per layer', () => {
  it('turns a layer out of the onion skin and back, one undo step each', async () => {
    const { newDoc } = await import('../../src/core/doc');
    const { resetStore } = await import('../../src/core/store');
    const ops = await import('../../src/timeline/ops');
    const s = resetStore(newDoc());
    const id = s.get().doc.layers[0].id;
    expect(ops.setLayerOnion(id, false).ok).toBe(true);
    expect(s.get().doc.layers[0].onion).toBe(false);
    expect(ops.setLayerOnion(id, false).ok).toBe(false);
    ops.setLayerOnion(id, true);
    expect(s.get().doc.layers[0].onion).toBeUndefined();
    s.undo();
    expect(s.get().doc.layers[0].onion).toBe(false);
  });
});

describe('frames on every layer', () => {
  it('adds and removes a frame on all unlocked layers in one undo step', async () => {
    const { newDoc, newVectorDrawing, newVectorLayer } = await import('../../src/core/doc');
    const { resetStore } = await import('../../src/core/store');
    const doc = newDoc();
    doc.layers.push(newVectorLayer('B'), newVectorLayer('C'));
    doc.layers[2].locked = true;
    for (const l of doc.layers) {
      const d = newVectorDrawing();
      doc.drawings[d.id] = d;
      l.cels.push({ id: 'c' + l.id, start: 0, length: 2, drawingId: d.id });
    }
    const s = resetStore(doc);
    s.setUi({ frame: 0 });
    expect(ops.insertFrameAll().ok).toBe(true);
    expect(s.get().doc.layers.map((l) => l.cels[0].length)).toEqual([3, 3, 2]);
    expect(ops.removeFrameAll().ok).toBe(true);
    expect(s.get().doc.layers.map((l) => l.cels[0].length)).toEqual([2, 2, 2]);
    s.undo();
    expect(s.get().doc.layers.map((l) => l.cels[0].length)).toEqual([3, 3, 2]);
  });
});
