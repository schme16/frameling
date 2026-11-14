// @vitest-environment jsdom
// Giving Quill a drawing: what the thing is called, and that a machine with no canvas simply gives him nothing
// rather than breaking.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import * as model from '../../src/artboards/model';
import { activeArtboardName } from '../../src/quillpet/where';
import { giveToQuill, thingFromNow, THING_SIZE } from '../../src/quillpet/give';
import { petStore, setPet } from '../../src/quillpet/store';
import { FRESH_PET } from '../../src/quillpet/model';

describe('what the thing is called', () => {
  it('is left to the document when there is only one board', () => {
    expect(activeArtboardName(newDoc({ name: 'Ball' }))).toBeUndefined();
  });

  it('is the board you are on when there are several', () => {
    const doc = newDoc({ name: 'Film' });
    const id = model.addArtboard(doc, { name: 'Close-up' });
    model.switchArtboard(doc, id);
    expect(activeArtboardName(doc)).toBe('Close-up');
  });

  it('keeps his picture small', () => {
    expect(THING_SIZE).toBeLessThanOrEqual(96);
  });
});

describe('without a canvas', () => {
  it('gives him nothing and says so, instead of throwing', async () => {
    setPet(FRESH_PET);
    expect(await thingFromNow()).toBeUndefined();
    expect(await giveToQuill()).toBe(false);
    expect(petStore.get().things).toEqual([]);
  });
});
