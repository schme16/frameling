// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { ReferencePicture } from '../../src/core/format';
import { store } from '../../src/core/store';
import { addReferenceLayer, checkPictureBytes, findSame, fitPicture, referenceLayerToEdit, removePictureFrom, resetPicture, sameBytes, setPlacement } from '../../src/reference/ops';
import { newLayerPicture } from '../../src/reference/model';
import { isSinglePicture } from '../../src/reference/drop';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const pic = (id = 'p1', data = PNG): ReferencePicture => ({ id, name: 'pose.png', data, mime: 'image/png', width: 400, height: 200 });

beforeEach(() => {
  store().load(newDoc({ name: 'T', width: 200, height: 200 }), null);
});

describe('checking a file before it is a reference', () => {
  it('takes PNG and JPEG, and says in plain words why it did not take anything else', () => {
    expect(checkPictureBytes(PNG, 'a.png')).toEqual({ mime: 'image/png' });
    expect(checkPictureBytes(new Uint8Array([0xff, 0xd8, 0xff]), 'a.jpg')).toEqual({ mime: 'image/jpeg' });
    expect(checkPictureBytes(new Uint8Array([71, 73, 70]), 'a.gif')).toEqual({ problem: expect.stringMatching(/"a.gif" isn't a JPG or PNG/) });
  });
  it('shares one copy of a picture added twice', () => {
    expect(sameBytes(PNG, new Uint8Array(PNG))).toBe(true);
    expect(sameBytes(PNG, new Uint8Array([1]))).toBe(false);
    expect(findSame({ pictures: [pic()] }, new Uint8Array(PNG))?.id).toBe('p1');
    expect(findSame({}, PNG)).toBeUndefined();
  });
  it('treats one JPG or PNG dropped as a reference, and anything else as not its business', () => {
    expect(isSinglePicture([{ name: 'a.JPG' }])).toBe(true);
    expect(isSinglePicture([{ name: 'noext', type: 'image/png' }])).toBe(true);
    expect(isSinglePicture([{ name: 'a.png' }, { name: 'b.png' }])).toBe(false);
    expect(isSinglePicture([{ name: 'a.gif', type: 'image/gif' }])).toBe(false);
  });
});

describe('a reference layer in the drawing', () => {
  it('goes at the back, faded, not exported, with the picture fitted to the page, in one undo step', () => {
    const before = store().get().doc.layers.length;
    const id = addReferenceLayer('Add', 'pose', [{ picture: pic(), isNew: true }], (d) => newLayerPicture(pic(), d));
    const doc = store().get().doc;
    expect(doc.layers).toHaveLength(before + 1);
    expect(doc.layers[0]).toMatchObject({ id, name: 'pose', reference: true, opacity: 0.6, picture: { x: 100, y: 100, scale: 0.5 } });
    expect(doc.pictures).toHaveLength(1);
    store().undo();
    expect(store().get().doc.layers).toHaveLength(before);
    expect(store().get().doc.pictures).toBeUndefined();
  });

  it('moves, fits and resets; a whole drag is one undo step', () => {
    const id = addReferenceLayer('Add', 'pose', [{ picture: pic(), isNew: true }], (d) => newLayerPicture(pic(), d));
    for (const x of [110, 120, 130]) setPlacement(id, { x }, 'drag');
    expect(store().get().doc.layers[0].picture!.x).toBe(130);
    store().undo();
    expect(store().get().doc.layers[0].picture!.x).toBe(100);
    setPlacement(id, { scale: 3, turn: 45 });
    resetPicture(id);
    expect(store().get().doc.layers[0].picture).toMatchObject({ x: 100, y: 100, scale: 1 });
    expect(store().get().doc.layers[0].picture!.turn).toBeUndefined();
    fitPicture(id, 'fill');
    expect(store().get().doc.layers[0].picture!.scale).toBe(1);
    fitPicture(id, 'fit');
    expect(store().get().doc.layers[0].picture!.scale).toBe(0.5);
  });

  it('can grow the animation to fit a clip, and refuses to take the only picture away', () => {
    const id = addReferenceLayer('Add', 'clip', [{ picture: pic(), isNew: true }], (d) => newLayerPicture(pic(), d), 60);
    expect(store().get().doc.length).toBe(60);
    expect(removePictureFrom(id, 0)).toBe(false);
  });

  it('finds the layer to work on: the active one with a picture, else the first from the top', () => {
    const id = addReferenceLayer('Add', 'one', [{ picture: pic(), isNew: true }], (d) => newLayerPicture(pic(), d));
    const doc = store().get().doc;
    expect(referenceLayerToEdit(doc, null)?.id).toBe(id);
    expect(referenceLayerToEdit(doc, doc.layers[1].id)?.id).toBe(id);
    expect(referenceLayerToEdit(newDoc(), null)).toBeUndefined();
  });
});
