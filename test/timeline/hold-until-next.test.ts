import { afterEach, describe, expect, it } from 'vitest';
import * as core from '../../src/timeline/edit-core';
import { setChoice } from '../../src/core/choices';
import { docWith, shape } from './helpers';

const L = (d: ReturnType<typeof docWith>) => d.layers[0];

afterEach(() => setChoice('timeline.newKeyHold', undefined));

describe('new drawings hold until the next one', () => {
  it('a new key at the end holds to the end of the animation, marked automatic', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    expect(shape(L(d))).toEqual([[0, 12]]);
    expect(L(d).cels[0].autoHold).toBe(true);
  });

  it('an automatic hold before a new key stretches to meet it', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    // Frame 4 is held, so a new key there splits the hold.
    core.newBlankKey(d, L(d).id, 4);
    expect(shape(L(d))).toEqual([[0, 4], [4, 8]]);
    expect(L(d).cels.every((c) => c.autoHold)).toBe(true);
  });

  it('fills a gap after an automatic hold, but never after a chosen one', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    L(d).cels[0].length = 2; // as if trimmed by hand, still automatic
    core.newBlankKey(d, L(d).id, 6);
    expect(shape(L(d))).toEqual([[0, 6], [6, 6]]);

    const e = docWith([[0, 2]], 12);
    core.newBlankKey(e, L(e).id, 6);
    expect(shape(L(e))).toEqual([[0, 2], [6, 6]]);
  });

  it('choosing a length clears the automatic mark', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    core.setExposure(d, L(d).id, 0, 3);
    expect(L(d).cels[0].autoHold).toBeUndefined();
    core.newBlankKey(d, L(d).id, 8);
    expect(shape(L(d))).toEqual([[0, 3], [8, 4]]);
  });

  it('the last automatic hold follows the animation length', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    core.newBlankKey(d, L(d).id, 6);
    core.setDocLength(d, 20);
    expect(shape(L(d))).toEqual([[0, 6], [6, 14]]);
    core.setDocLength(d, 8);
    expect(shape(L(d))).toEqual([[0, 6], [6, 2]]);
  });

  it('deleting a key lets the automatic hold before it carry on', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    core.newBlankKey(d, L(d).id, 6);
    core.deleteKey(d, L(d).id, 6);
    expect(shape(L(d))).toEqual([[0, 12]]);
  });

  it('autoHeldAt only answers for later frames of an automatic hold without in-betweens', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    expect(core.autoHeldAt(L(d), 0)).toBeUndefined();
    expect(core.autoHeldAt(L(d), 5)).toBe(L(d).cels[0]);
    L(d).cels[0].tween = { ease: 'linear' };
    expect(core.autoHeldAt(L(d), 5)).toBeUndefined();
  });

  it('splitAutoHold cuts the hold and the new key carries on automatically', () => {
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    const c = core.splitAutoHold(L(d), L(d).cels[0], 5, 'x');
    expect(shape(L(d))).toEqual([[0, 5], [5, 7]]);
    expect(c).toMatchObject({ start: 5, drawingId: 'x', autoHold: true });
  });

  it('one frame, if that is the preference, as before', () => {
    setChoice('timeline.newKeyHold', 'one-frame');
    const d = docWith([], 12);
    core.newBlankKey(d, L(d).id, 0);
    core.newBlankKey(d, L(d).id, 4);
    expect(shape(L(d))).toEqual([[0, 1], [4, 1]]);
    expect(L(d).cels[0].autoHold).toBeUndefined();
  });
});
