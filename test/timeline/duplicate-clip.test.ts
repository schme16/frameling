import { describe, expect, it } from 'vitest';
import * as core from '../../src/timeline/edit-core';
import * as ops from '../../src/timeline/ops';
import { store } from '../../src/core/store';
import { docWith, isTidy, shape, storeWith } from './helpers';

describe('duplicate clip', () => {
  it('copies the cels and drawings onto the end, as a clip of its own', () => {
    const d = docWith([[0, 2], [2, 2], [4, 2]], 6);
    const id = core.addClip(d, 2, 3, 'jump', false);
    const before = Object.keys(d.drawings).length;
    const made = core.duplicateClip(d, id)!;
    expect(made).toBeTruthy();
    expect(d.length).toBe(8);
    expect(shape(d.layers[0])).toEqual([[0, 2], [2, 2], [4, 2], [6, 2]]);
    expect(isTidy(d.layers[0])).toBe(true);
    const copy = d.clips.find((c) => c.id === made)!;
    expect(copy).toMatchObject({ name: 'jump copy', start: 6, end: 7, loop: false });
    expect(Object.keys(d.drawings)).toHaveLength(before + 1);
    // Painting on the copy never touches the original.
    const [orig, dup] = [d.layers[0].cels[1], d.layers[0].cels[3]];
    expect(dup.drawingId).not.toBe(orig.drawingId);
    expect(dup.id).not.toBe(orig.id);
  });

  it('cuts a cel that runs past the clip, and keeps a drawing shown twice as one drawing', () => {
    const d = docWith([[0, 6]], 6);
    d.layers[0].cels.push({ ...d.layers[0].cels[0], id: 'again', start: 6, length: 2 });
    d.length = 8;
    const id = core.addClip(d, 4, 7, 'x');
    core.duplicateClip(d, id);
    const cels = d.layers[0].cels.filter((c) => c.start >= 8);
    expect(cels.map((c) => [c.start, c.length])).toEqual([[8, 2], [10, 2]]);
    expect(cels[0].drawingId).toBe(cels[1].drawingId);
    expect(cels[0].drawingId).not.toBe(d.layers[0].cels[0].drawingId);
  });

  it('brings markers inside the clip, and leaves the others', () => {
    const d = docWith([[0, 4]], 4);
    core.addMarker(d, 1, 'in');
    core.addMarker(d, 3, 'out');
    const id = core.addClip(d, 0, 1, 'a');
    core.duplicateClip(d, id);
    expect(d.markers.map((m) => [m.name, m.frame])).toEqual([['in', 1], ['out', 3], ['in', 5]]);
  });

  it('numbers the names so none repeats', () => {
    const d = docWith([[0, 2]], 2);
    const id = core.addClip(d, 0, 1, 'Run');
    const a = core.duplicateClip(d, id)!;
    core.duplicateClip(d, id);
    core.duplicateClip(d, a);
    expect(d.clips.map((c) => c.name)).toEqual(['Run', 'Run copy', 'Run copy 2', 'Run copy 3']);
  });

  it('says no for a missing clip and when the animation would grow too long', () => {
    const d = docWith([[0, 2]], 2);
    expect(core.duplicateClip(d, 'nope')).toBeNull();
    const id = core.addClip(d, 0, 1, 'a');
    d.length = core.MAX_LENGTH;
    expect(core.duplicateClip(d, id)).toBeNull();
  });

  it('is one undo step through the op, and refuses inside a symbol', () => {
    storeWith([[0, 3]], 3);
    const id = ops.addClip(0, 2, 'walk').id!;
    const o = ops.duplicateClip(id);
    expect(o.ok).toBe(true);
    expect(store().get().doc.clips).toHaveLength(2);
    store().undo();
    expect(store().get().doc.clips).toHaveLength(1);
    expect(store().get().doc.length).toBe(3);
    expect(ops.duplicateClip('missing').ok).toBe(false);
  });
});
