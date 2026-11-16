// Settle bookkeeping: nothing redundant or orphaned is left behind after a recolour or a deleted key.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { activeId, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { aliasId, makeVariation, recolourOpenVariation, settleVariations, splitAlias } from '../../src/artboards/variations';

const PINK = '#ff6f91';
const BLUE = '#4f9bd1';
const rect = (id: string, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }], fill, stroke: null, opacity: 1 });
const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const open = (id: string) => update('Go', (d) => void switchArtboard(d, id));
const make = (): string => {
  let id: string | null = null;
  update('Make', (d) => void (id = makeVariation(d, activeId(d))));
  return id!;
};

beforeEach(() => {
  const d0 = newDoc({ name: 'Hero', width: 100, height: 100, length: 3 });
  const layer = { ...newVectorLayer('Ball'), id: 'L' };
  for (let f = 0; f < 3; f++) {
    d0.drawings[`k${f}`] = { id: `k${f}`, kind: 'vector', shapes: [rect(`b${f}`, PINK)] };
    layer.cels.push({ id: `c${f}`, start: f, length: 1, drawingId: `k${f}` });
  }
  d0.layers = [layer];
  resetStore(d0);
});

describe('a hand edit a recolour makes redundant', () => {
  it('is dropped by the recolour itself', () => {
    const v = make();
    open(v);
    // Hand-colours one key blue, then recolours pink to blue everywhere: that edit says nothing more.
    update('Paint', (d) => {
      ((d.drawings[aliasId('k0', v)] as VectorDrawing).shapes[0] as PathShape).fill = BLUE;
    });
    expect(findArtboard(doc(), v)!.overrides?.drawings?.k0).toBeTruthy();
    update('Recolour', (d) => void recolourOpenVariation(d, [{ from: PINK, to: BLUE }]));
    const ov = findArtboard(doc(), v)!.overrides!;
    expect(ov.palette?.changes).toEqual([{ from: PINK, to: BLUE }]);
    expect(ov.drawings?.k0).toBeUndefined();
    expect(settleVariations(doc())).toBeNull();
  });
});

describe('a copy a variation no longer needs', () => {
  it('goes when the original deletes the key it was a copy of', () => {
    const orig = activeId(doc());
    update('New key', (d) => {
      d.drawings['kn'] = { id: 'kn', kind: 'vector', shapes: [rect('bn', PINK)] };
      d.layers[0].cels.push({ id: 'cn', start: 3, length: 1, drawingId: 'kn' });
      d.length = 4;
    });
    const v = make();
    open(v);
    update('Recolour', (d) => void recolourOpenVariation(d, [{ from: PINK, to: BLUE }]));
    open(orig);
    expect(doc().drawings[aliasId('kn', v)]).toBeTruthy();
    update('Delete the key', (d) => {
      d.layers[0].cels = d.layers[0].cels.filter((c) => c.id !== 'cn');
      delete d.drawings['kn'];
    });
    expect(doc().drawings[aliasId('kn', v)]).toBeUndefined();
    // Match the key exactly or as the original of a copy: a substring would also hit ids that hold "kn" by chance in
    // their random part (about one run in thirty), which made this test fail now and then.
    expect(Object.keys(doc().drawings).filter((k) => k === 'kn' || splitAlias(k)?.orig === 'kn')).toEqual([]);
    expect(settleVariations(doc())).toBeNull();
    expect(artboardsOf(doc())).toHaveLength(2);
  });
});
