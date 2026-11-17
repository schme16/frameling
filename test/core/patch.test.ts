// applyPatchesHere runs undo and redo patches without immer, so it has to agree with immer exactly. Immer is the
// oracle here: every case runs both and compares, and also checks the sharing (what the step did not touch stays the
// very same object, which is what makes undo cheap) and that nothing of the old document was written in place.
import { applyPatches, enablePatches, produceWithPatches, setAutoFreeze } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyPatchesHere } from '../../src/core/patch';

enablePatches();

/** A document shaped like ours: layers with drawings, each drawing with shapes and points. */
const makeDoc = () => ({
  version: 5,
  name: 'A drawing',
  layers: Array.from({ length: 4 }, (_, l) => ({
    id: `l${l}`,
    name: `Layer ${l}`,
    visible: true,
    cels: Array.from({ length: 3 }, (_, c) => ({
      id: `l${l}c${c}`,
      start: c,
      shapes: [{ id: `s${l}${c}`, type: 'stroke', color: '#123456', points: [1, 2, 3, 4, 5, 6] }],
    })),
  })),
  meta: { tags: ['one', 'two'], nested: { deep: { n: 1 } } },
});

/** Both ways of running the same patches, plus what the fast one shared. */
function both(doc: ReturnType<typeof makeDoc>, recipe: (d: any) => void) {
  const [, patches, inverse] = produceWithPatches(doc, recipe as any);
  const viaImmer = applyPatches(doc, patches as any);
  const fast = applyPatchesHere(doc, patches);
  expect(fast, 'the fast path refused these patches').not.toBeNull();
  expect(fast).toEqual(viaImmer);
  return { patches, inverse, viaImmer, fast: fast as ReturnType<typeof makeDoc> };
}

describe('applyPatchesHere', () => {
  beforeAll(() => setAutoFreeze(false));

  it('gives no patches back the same document', () => {
    const d = makeDoc();
    expect(applyPatchesHere(d, [])).toBe(d);
  });

  it('agrees with immer on a changed value deep in a drawing', () => {
    both(makeDoc(), (d) => { d.layers[2].cels[1].shapes[0].color = '#ff0000'; });
  });

  it('agrees with immer on adding a drawing to a layer', () => {
    both(makeDoc(), (d) => { d.layers[1].cels.push({ id: 'new', start: 9, shapes: [] }); });
  });

  it('agrees with immer on removing a drawing from the middle of a layer', () => {
    both(makeDoc(), (d) => { d.layers[1].cels.splice(1, 1); });
  });

  it('agrees with immer on removing a whole layer, and on putting it back', () => {
    const d = makeDoc();
    const { inverse, fast } = both(d, (x) => { x.layers.splice(1, 1); });
    expect(fast.layers).toHaveLength(3);
    const back = applyPatchesHere(fast, inverse);
    expect(back).not.toBeNull();
    expect(back).toEqual(applyPatches(fast, inverse as any));
    expect(back).toEqual(d);
  });

  it('agrees with immer on a list cut short', () => {
    const { fast } = both(makeDoc(), (d) => { d.layers.length = 2; });
    expect(fast.layers).toHaveLength(2);
  });

  it('agrees with immer on a length patch, which is how a cut reaches undo', () => {
    // Immer writes a cut as removes from the end, but a length replace is a patch immer itself runs (and the one
    // src/core/quiet.ts watches for), so it is checked against immer on its own.
    const d = makeDoc();
    const cut = [{ op: 'replace' as const, path: ['layers', 'length'], value: 2 }];
    const fast = applyPatchesHere(d, cut) as ReturnType<typeof makeDoc>;
    expect(fast).not.toBeNull();
    expect(fast).toEqual(applyPatches(d, cut));
    expect(fast.layers).toHaveLength(2);
    expect(d.layers).toHaveLength(4);
  });

  it('agrees with immer on a key added to and taken off an object', () => {
    both(makeDoc(), (d) => { d.meta.extra = { a: 1 }; });
    both(makeDoc(), (d) => { delete d.meta.nested; });
  });

  it('agrees with immer on several patches at once, including two down the same path', () => {
    both(makeDoc(), (d) => {
      d.name = 'Renamed';
      d.layers[0].cels[0].shapes[0].color = '#000000';
      d.layers[0].cels[1].shapes[0].color = '#ffffff';
      d.layers[3].visible = false;
      d.meta.tags.push('three');
    });
  });

  it('shares everything the patches did not touch, and leaves the old document alone', () => {
    const d = makeDoc();
    const snapshot = JSON.parse(JSON.stringify(d));
    const { fast } = both(d, (x) => { x.layers[2].cels[1].shapes[0].color = '#ff0000'; });
    expect(fast).not.toBe(d);
    // Untouched layers are the same objects, which is the whole point: no walk, no copy.
    expect(fast.layers[0]).toBe(d.layers[0]);
    expect(fast.layers[1]).toBe(d.layers[1]);
    expect(fast.layers[3]).toBe(d.layers[3]);
    expect(fast.meta).toBe(d.meta);
    // Copied along the path only.
    expect(fast.layers[2]).not.toBe(d.layers[2]);
    expect(fast.layers[2].cels[0]).toBe(d.layers[2].cels[0]);
    expect(d).toEqual(snapshot);
  });

  it('does not let the document and the patch share a value that could be written into', () => {
    const d = makeDoc();
    const added = { id: 'new', start: 9, shapes: [{ id: 'sx', type: 'stroke', color: '#abcdef', points: [0, 0] }] };
    const fast = applyPatchesHere(d, [{ op: 'add', path: ['layers', 0, 'cels', 3], value: added }]) as any;
    expect(fast).not.toBeNull();
    expect(fast.layers[0].cels[3]).toEqual(added);
    expect(fast.layers[0].cels[3]).not.toBe(added);
    expect(fast.layers[0].cels[3].shapes[0]).not.toBe(added.shapes[0]);
  });

  it('keeps a pixel array as it is rather than copying it value by value', () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 4]);
    const d: any = { layers: [{ id: 'l0', cels: [{ id: 'c0' }] }] };
    const fast = applyPatchesHere(d, [{ op: 'replace', path: ['layers', 0, 'cels', 0, 'pixels'], value: pixels }]) as any;
    expect(fast.layers[0].cels[0].pixels).toBe(pixels);
  });

  it('hands back to immer rather than guessing', () => {
    const d = makeDoc();
    // Replacing the whole document.
    expect(applyPatchesHere(d, [{ op: 'replace', path: [], value: { version: 5 } }])).toBeNull();
    // A path through a Map, which our format does not have and this does not handle.
    expect(applyPatchesHere({ m: new Map([['a', { n: 1 }]]) } as any, [{ op: 'replace', path: ['m', 'a', 'n'], value: 2 }])).toBeNull();
  });

  it('freezes what it made when the old document was frozen, so the safety net stays', () => {
    const fast = applyPatchesHere(Object.freeze(makeDoc()), [{ op: 'add', path: ['meta', 'extra'], value: { a: [1, 2] } }]) as any;
    expect(fast).not.toBeNull();
    expect(Object.isFrozen(fast)).toBe(true);
    expect(Object.isFrozen(fast.meta)).toBe(true);
    expect(Object.isFrozen(fast.meta.extra)).toBe(true);
    expect(Object.isFrozen(fast.meta.extra.a)).toBe(true);
    // An untouched layer was already frozen, and is still the same object.
    expect(Object.isFrozen(fast.layers[0])).toBe(true);
  });
});
