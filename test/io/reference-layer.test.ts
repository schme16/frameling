import { describe, expect, it } from 'vitest';
import { loadFile, saveFile } from '../../src/io/file';
import { makeHeroSprite } from '../../src/templates/hero-sprite';

describe('reference layers in files', () => {
  it('keep their reference and onion flags through save and open, and older files open without them', () => {
    const doc = makeHeroSprite();
    doc.layers[1].onion = false;
    const back = loadFile(saveFile(doc)).doc;
    expect(back.layers.map((l) => [l.name, !!l.reference, l.onion !== false])).toEqual([
      ['Ground', true, true],
      ['Shadow', false, false],
      ['Pip', false, true],
    ]);
    delete doc.layers[0].reference;
    expect(loadFile(saveFile(doc)).doc.layers[0].reference).toBeUndefined();
  });
});
