// @vitest-environment jsdom
// Only real work of yours goes in his room: a drawing you drew in and saved. Opening a file, a template or a new page
// and saving it untouched does not, and neither does an empty drawing. A canvas is faked, because the rule is about
// what counts, not about pixels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { store, resetStore } from '../../src/core/store';
import { setChoice, _resetChoicesForTests } from '../../src/core/choices';

const blank = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/core/render', () => ({
  renderFrameToCanvas: () => ({ width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(16).fill(blank.value ? 0 : 255) }) }) }),
}));
vi.mock('../../src/io/thumb', () => ({ thumbnailOf: async () => 'data:image/png;base64,QUJD' }));

import { noteMade } from '../../src/quillpet/madeNow';
import { madeStore, setMade, YOURS_CHOICE } from '../../src/quillpet/made';
import { forgetNow, startWatching } from '../../src/quillpet/watch';
import { registerYoursChoice } from '../../src/quillpet/choices';
import { setPet } from '../../src/quillpet/store';
import { FRESH_PET } from '../../src/quillpet/model';

let stop: () => void;

beforeEach(() => {
  resetStore();
  _resetChoicesForTests();
  registerYoursChoice();
  setPet(FRESH_PET);
  setMade([]);
  blank.value = false;
  stop = startWatching();
});
afterEach(() => {
  stop();
  forgetNow();
});

const draw = () => store().update('Draw', (d) => void (d.name = d.name + '.'));

describe('what counts as yours', () => {
  it('is a drawing you drew in and saved', async () => {
    draw();
    const got = await noteMade(store().get().doc, 1000);
    expect(got?.kind).toBe('drawing');
    expect(madeStore.get().list).toHaveLength(1);
    expect(madeStore.get().list[0].madeAt).toBe(1000);
  });

  it('is never a template, an example or a file you opened and saved without drawing in it', async () => {
    store().load(newDoc({ name: 'Bouncing ball example' }));
    expect(await noteMade(store().get().doc)).toBeUndefined();
    expect(madeStore.get().list).toEqual([]);
  });

  it('stops counting the moment a different file is opened, even straight after drawing in another', async () => {
    draw();
    store().load(newDoc({ name: 'Somebody else’s file' }));
    expect(await noteMade(store().get().doc)).toBeUndefined();
    expect(madeStore.get().list).toEqual([]);
  });

  it('is never an empty drawing', async () => {
    draw();
    blank.value = true;
    expect(await noteMade(store().get().doc)).toBeUndefined();
    expect(madeStore.get().list).toEqual([]);
  });

  it('saving it again freshens it rather than adding it twice', async () => {
    draw();
    await noteMade(store().get().doc, 1);
    await noteMade(store().get().doc, 2);
    expect(madeStore.get().list).toHaveLength(1);
    expect(madeStore.get().list[0].madeAt).toBe(2);
  });

  it('is left out while the room is switched off, and the next save after switching on goes in', async () => {
    draw();
    setChoice(YOURS_CHOICE, 'hide');
    expect(await noteMade(store().get().doc)).toBeUndefined();
    setChoice(YOURS_CHOICE, 'show');
    expect(await noteMade(store().get().doc)).toBeTruthy();
  });

  it('never throws, so it can never get in the way of a save', async () => {
    draw();
    const doc = { ...store().get().doc, layers: null } as never;
    await expect(noteMade(doc)).resolves.toBeUndefined();
  });
});
