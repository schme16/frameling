import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { artboardDoc, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { makeVariation } from '../../src/artboards/variations';

const rect = (id: string, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], fill, stroke: null, opacity: 1 });
const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));

describe('a key added in a variation without changing any key of the original', () => {
  it('is kept by save and open', () => {
    const d0 = newDoc({ name: 'F', width: 16, height: 16, length: 8 });
    const l = { ...newVectorLayer('V'), id: 'LV' };
    l.cels = [{ id: 'c1', start: 0, length: 4, drawingId: 'd1' }];
    d0.drawings = { d1: { id: 'd1', kind: 'vector', shapes: [rect('s1', '#ff0000')] } as VectorDrawing };
    d0.layers = [l];
    resetStore(d0);
    const root = artboardsOf(doc())[0].id;
    let v = '';
    update('make', (d) => void (v = makeVariation(d, root)!));
    update('open', (d) => void switchArtboard(d, v));
    // A new key after the existing one, with its own drawing: the original's key is not touched.
    update('new key', (d) => {
      d.drawings['dn'] = { id: 'dn', kind: 'vector', shapes: [rect('sn', '#00ff00')] } as VectorDrawing;
      d.layers[0].cels.push({ id: 'cn', start: 5, length: 3, drawingId: 'dn' });
    });
    const keys = (dd: Doc) => artboardDoc(dd, v).layers[0].cels.map((c) => c.start);
    expect(keys(doc())).toEqual([0, 5]);
    const loaded = loadFile(saveFile(doc())).doc;
    expect(findArtboard(loaded, v)).toBeTruthy();
    expect(keys(loaded)).toEqual([0, 5]);
    const cel = artboardDoc(loaded, v).layers[0].cels[1];
    const dr = loaded.drawings[cel.drawingId] as VectorDrawing;
    expect((dr.shapes[0] as PathShape).fill).toBe('#00ff00');
  });
});
