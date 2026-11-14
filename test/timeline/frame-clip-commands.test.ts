// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { currentChoice, setChoice } from '../../src/core/choices';
import { store } from '../../src/core/store';
import { clearFrameClip, copyKeys, cutKeys, frameClipForTests, hasFrameClip, pasteKeys } from '../../src/timeline/frameClipCommands';
import { clearKeys, pickKeys, tl } from '../../src/timeline/state';
import { celRef } from '../../src/timeline/tracks';
import { shape, storeWith } from './helpers';

beforeEach(() => {
  setChoice('timeline.pasteOver', undefined);
  clearFrameClip();
  clearKeys();
});

const layer = () => store().get().doc.layers[0];

describe('copy and paste keys on the store', () => {
  it('copies the drawing on the playhead when no keys are picked, and pastes it later as one undo step', () => {
    storeWith([[0, 2], [2, 3]]);
    store().setUi({ frame: 0, activeLayerId: layer().id });
    expect(copyKeys()).toBeTruthy();
    store().setUi({ frame: 10 });
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 2], [2, 3], [10, 2]]);
    expect(store().undoLabel()).toContain('Paste');
    store().undo();
    expect(shape(layer())).toEqual([[0, 2], [2, 3]]);
  });
  it('copies the picked keys and picks the pasted ones afterwards', () => {
    storeWith([[0, 1], [1, 1], [2, 1]]);
    const l = layer();
    pickKeys([celRef(l.id, l.cels[0].id), celRef(l.id, l.cels[1].id)]);
    copyKeys();
    store().setUi({ frame: 6, activeLayerId: l.id });
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 1], [1, 1], [2, 1], [6, 1], [7, 1]]);
    expect(tl().keys.size).toBe(2);
    expect(store().get().ui.frame).toBe(6);
  });
  it('makes room by default when it lands on drawings, and covers when that is the answer', () => {
    storeWith([[0, 2], [2, 2], [4, 2]]);
    const l = layer();
    store().setUi({ frame: 0, activeLayerId: l.id });
    copyKeys();
    store().setUi({ frame: 2 });
    pasteKeys();
    expect(currentChoice('timeline.pasteOver')).toBe('insert');
    expect(shape(layer())).toEqual([[0, 2], [2, 2], [4, 2], [6, 2]]);
    storeWith([[0, 2], [2, 2], [4, 2]]);
    setChoice('timeline.pasteOver', 'cover');
    store().setUi({ frame: 0, activeLayerId: layer().id });
    copyKeys();
    store().setUi({ frame: 2 });
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 2], [2, 2], [4, 2]]);
  });
  it('cuts: the keys go, and can be pasted back', () => {
    storeWith([[0, 2], [2, 2]]);
    const l = layer();
    store().setUi({ frame: 2, activeLayerId: l.id });
    cutKeys();
    // The drawing before it holds on over the frames the cut one left.
    expect(shape(layer())).toEqual([[0, 4]]);
    expect(hasFrameClip()).toBe(true);
    store().setUi({ frame: 5 });
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 4], [5, 2]]);
  });
  it('pastes after the last drawing, so the animation can grow', () => {
    storeWith([[0, 2], [2, 3]]);
    const l = layer();
    store().setUi({ frame: 0, activeLayerId: l.id });
    copyKeys();
    pasteKeys({ atEnd: true });
    expect(shape(layer())).toEqual([[0, 2], [2, 3], [5, 2]]);
    pasteKeys({ atEnd: true });
    expect(shape(layer())).toEqual([[0, 2], [2, 3], [5, 2], [7, 2]]);
  });
  it('pastes in place on the same layer and frame, as a new drawing', () => {
    storeWith([[0, 2], [4, 2]]);
    const l = layer();
    store().setUi({ frame: 4, activeLayerId: l.id });
    copyKeys();
    const before = layer().cels[1].drawingId;
    pasteKeys({ inPlace: true });
    expect(shape(layer())).toEqual([[0, 2], [4, 2]]);
    expect(layer().cels[1].drawingId).not.toBe(before);
  });
  it('refuses on a locked layer and changes nothing', () => {
    storeWith([[0, 2]]);
    const l = layer();
    store().setUi({ frame: 0, activeLayerId: l.id });
    copyKeys();
    store().update('Lock', (d) => void (d.layers[0].locked = true));
    store().setUi({ frame: 5 });
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 2]]);
  });
  it('says there is nothing to paste before anything was copied', () => {
    storeWith([[0, 2]]);
    pasteKeys();
    expect(shape(layer())).toEqual([[0, 2]]);
    expect(frameClipForTests()).toBeNull();
  });
});

describe('the commands', () => {
  it('are registered, with help, and only paste when there is something to paste', () => {
    for (const id of ['timeline.copyKeys', 'timeline.cutKeys', 'timeline.pasteKeys', 'timeline.pasteKeysAtEnd', 'timeline.pasteKeysInPlace']) {
      const c = getCommand(id);
      expect(c, id).toBeTruthy();
      expect(c!.help).toBe('timeline-copy-keys');
      expect(c!.keys).toBeUndefined();
    }
    storeWith([[0, 2]]);
    expect(getCommand('timeline.pasteKeys')!.enabled!(store().get())).toBe(false);
  });
});
