import { describe, expect, it } from 'vitest';
import * as core from '../../src/timeline/offset-core';
import * as edit from '../../src/timeline/edit-core';
import * as ops from '../../src/timeline/ops';
import { store, resetStore } from '../../src/core/store';
import { celAt, newDoc, newPixelLayer } from '../../src/core/doc';
import { celOffsetAt } from '../../src/core/symbols';
import { addCel, docWith, isTidy, shape } from '../timeline/helpers';

describe('moving a key', () => {
  it('moves the key under the frame, and a second nudge adds on', () => {
    const d = docWith([[0, 4]]);
    const l = d.layers[0];
    expect(core.nudge(d, l.id, 0, 2, -1)).toBe(true);
    expect(l.cels[0].offset).toEqual({ x: 2, y: -1 });
    core.nudge(d, l.id, 0, 1, 1);
    expect(l.cels[0].offset).toEqual({ x: 3, y: 0 });
    expect(shape(l)).toEqual([[0, 4]]);
  });

  it('moving back to where it was drawn clears the field', () => {
    const d = docWith([[0, 4]]);
    const l = d.layers[0];
    core.nudge(d, l.id, 0, 1, 0);
    core.nudge(d, l.id, 0, -1, 0);
    expect('offset' in l.cels[0]).toBe(false);
    expect(core.nudge(d, l.id, 0, 0, 0)).toBe(false);
  });

  it('on a later frame of a hold, cuts the hold and shares the one drawing', () => {
    const d = docWith([[0, 6]]);
    const l = d.layers[0];
    const drawing = l.cels[0].drawingId;
    const before = Object.keys(d.drawings).length;
    core.nudge(d, l.id, 2, 0, 1);
    expect(shape(l)).toEqual([[0, 2], [2, 4]]);
    expect(l.cels[1].drawingId).toBe(drawing);
    expect(Object.keys(d.drawings)).toHaveLength(before);
    expect(l.cels[0].offset).toBeUndefined();
    expect(l.cels[1].offset).toEqual({ x: 0, y: 1 });
    expect(isTidy(l)).toBe(true);
    // A bob: every frame moves on its own, still no new drawing.
    core.nudge(d, l.id, 3, 0, 1);
    core.nudge(d, l.id, 4, 0, -1);
    expect(l.cels[3].offset).toEqual({ x: 0, y: 1 });
    expect(shape(l)).toEqual([[0, 2], [2, 1], [3, 1], [4, 2]]);
    expect(l.cels.map((c) => c.offset?.y)).toEqual([undefined, 1, 2, 1]);
    expect(new Set(l.cels.map((c) => c.drawingId)).size).toBe(1);
  });

  it('keeps a hold\'s own move on the part it cuts off', () => {
    const d = docWith([[0, 6]]);
    const l = d.layers[0];
    l.cels[0].offset = { x: 4, y: 0 };
    core.nudge(d, l.id, 3, 1, 0);
    expect(l.cels.map((c) => c.offset)).toEqual([{ x: 4, y: 0 }, { x: 5, y: 0 }]);
  });

  it('an automatic hold stays automatic on the new key', () => {
    const d = docWith([[0, 6]]);
    const l = d.layers[0];
    l.cels[0].autoHold = true;
    core.nudge(d, l.id, 3, 1, 0);
    expect(l.cels[1].autoHold).toBe(true);
  });

  it('does nothing on an empty frame, a camera layer or a missing layer', () => {
    const d = docWith([[2, 2]]);
    const l = d.layers[0];
    expect(core.nudge(d, l.id, 0, 1, 0)).toBe(false);
    expect(core.nudge(d, 'nope', 2, 1, 0)).toBe(false);
    (l as { kind: string }).kind = 'camera';
    expect(core.nudge(d, l.id, 2, 1, 0)).toBe(false);
  });

  it('moves a pixel layer by whole art pixels', () => {
    const d = newDoc({ length: 4 });
    const l = newPixelLayer('p', 4);
    d.layers = [l];
    addCel(d, l, 0, 4);
    core.nudge(d, l.id, 0, 1, -2);
    expect(l.cels[0].offset).toEqual({ x: 4, y: -8 });
    // Set exactly, it snaps to the grid too.
    core.setOffset(d, l.id, 0, { x: 5, y: 1 });
    expect(l.cels[0].offset).toEqual({ x: 4, y: 0 });
  });

  it('on a glide, makes the usual cut and keeps the motion', () => {
    const d = docWith([[0, 8], [8, 4]]);
    const l = d.layers[0];
    l.cels[0].tween = { ease: 'linear' };
    l.cels[1].offset = { x: 16, y: 0 };
    expect(celOffsetAt(l, 4)).toEqual({ x: 8, y: 0 });
    core.nudge(d, l.id, 4, 0, 1);
    const cut = celAt(l, 4)!;
    expect(cut.start).toBe(4);
    expect(cut.offset).toEqual({ x: 8, y: 1 });
    // Before the cut the glide still heads for the new key; after it, on to the old next one.
    expect(celOffsetAt(l, 2)).toEqual({ x: 4, y: 0.5 });
    expect(celOffsetAt(l, 6)).toEqual({ x: 12, y: 0.5 });
  });
});

describe('moving a folder together', () => {
  function folderDoc() {
    const d = docWith([[0, 6]]);
    d.folders = { f: { id: 'f', name: 'Head', visible: true, opacity: 1 }, g: { id: 'g', name: 'Face', visible: true, opacity: 1, parent: 'f' } };
    d.layers[0].folder = 'f';
    const eyes = { ...newPixelLayer('Eyes', 1), cels: [] as never[] };
    d.layers.push(eyes as never);
    addCel(d, eyes as never, 0, 6);
    eyes.folder = 'g';
    const feet = { ...newPixelLayer('Feet', 1), cels: [] as never[] };
    d.layers.push(feet as never);
    addCel(d, feet as never, 0, 6);
    return d;
  }

  it('moves every layer in the folder, and the folders inside it, and no others', () => {
    const d = folderDoc();
    expect(core.nudgeFolder(d, 'f', 0, 2, 1)).toBe(2);
    expect(d.layers[0].cels[0].offset).toEqual({ x: 2, y: 1 });
    expect(d.layers[1].cels[0].offset).toEqual({ x: 2, y: 1 });
    expect(d.layers[2].cels[0].offset).toBeUndefined();
    expect(core.resetFolder(d, 'f', 0)).toBe(2);
    expect(d.layers.map((l) => l.cels[0].offset)).toEqual([undefined, undefined, undefined]);
  });

  it('skips locked layers and layers with nothing on the frame', () => {
    const d = folderDoc();
    d.layers[1].locked = true;
    expect(core.nudgeFolder(d, 'f', 0, 1, 0)).toBe(1);
    d.layers[0].cels = [];
    expect(core.nudgeFolder(d, 'f', 0, 1, 0)).toBe(0);
  });
});

describe('copies keep the move', () => {
  it('a copy of a drawing on the next frame sits where the original does', () => {
    const d = docWith([[0, 4]]);
    d.layers[0].cels[0].offset = { x: 3, y: 3 };
    edit.duplicateKey(d, d.layers[0].id, 0);
    expect(d.layers[0].cels.map((c) => c.offset)).toEqual([{ x: 3, y: 3 }, { x: 3, y: 3 }]);
    expect(d.layers[0].cels[0].drawingId).not.toBe(d.layers[0].cels[1].drawingId);
  });

  it('a new drawing as a copy keeps it, a new blank one starts where it was drawn', () => {
    const a = docWith([[0, 4]]);
    a.layers[0].cels[0].offset = { x: 3, y: 3 };
    edit.newBlankKey(a, a.layers[0].id, 2, true);
    expect(a.layers[0].cels[1].offset).toEqual({ x: 3, y: 3 });
    const b = docWith([[0, 4]]);
    b.layers[0].cels[0].offset = { x: 3, y: 3 };
    edit.newBlankKey(b, b.layers[0].id, 2, false);
    expect(b.layers[0].cels[1].offset).toBeUndefined();
    edit.newBlankKey(b, b.layers[0].id, 0, false);
    expect(b.layers[0].cels[0].offset).toBeUndefined();
  });
});

describe('the commands in the store', () => {
  it('is one undo step, refuses a locked layer in plain words, and undo brings it back', () => {
    resetStore(docWith([[0, 6]]));
    const id = store().get().doc.layers[0].id;
    expect(ops.nudgeKey(1, 0).ok).toBe(true);
    expect(store().get().doc.layers[0].cels[0].offset).toEqual({ x: 1, y: 0 });
    store().undo();
    expect(store().get().doc.layers[0].cels[0].offset).toBeUndefined();
    store().update('lock', (d) => void (d.layers[0].locked = true));
    const o = ops.nudgeKey(1, 0, id);
    expect(o).toMatchObject({ ok: false, reason: 'locked' });
    expect(ops.whyNot(o)).toMatch(/locked/);
  });

  it('holding the key down is one undo step', () => {
    resetStore(docWith([[0, 6]]));
    ops.nudgeKey(1, 0);
    ops.nudgeKey(1, 0);
    ops.nudgeKey(1, 0);
    expect(store().get().doc.layers[0].cels[0].offset).toEqual({ x: 3, y: 0 });
    store().undo();
    expect(store().get().doc.layers[0].cels[0].offset).toBeUndefined();
  });

  it('says so when the layer is not in a folder, or has nothing on this frame', () => {
    resetStore(docWith([[2, 2]]));
    expect(ops.nudgeFolder(1, 0)).toMatchObject({ ok: false, reason: 'no-folder' });
    expect(ops.nudgeKey(1, 0)).toMatchObject({ ok: false, reason: 'nothing-here' });
    expect(ops.whyNot({ ok: false, reason: 'no-folder' })).toMatch(/folder/);
  });

  it('puts a drawing back, and a folder back', () => {
    resetStore(docWith([[0, 6]]));
    ops.nudgeKey(2, 2);
    expect(ops.resetKeyOffset().ok).toBe(true);
    expect(store().get().doc.layers[0].cels[0].offset).toBeUndefined();
    expect(ops.setKeyOffset(5, 6).ok).toBe(true);
    expect(store().get().doc.layers[0].cels[0].offset).toEqual({ x: 5, y: 6 });
  });
});
