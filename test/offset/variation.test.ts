import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, VectorDrawing } from '../../src/core/format';
import { OFFSET_FORMAT_VERSION } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { artboardDoc, artboardsOf, switchArtboard } from '../../src/artboards/model';
import { makeVariation } from '../../src/artboards/variations';

const rect = (id: string, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], fill, stroke: null, opacity: 1 });
const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));

describe('a move made in a variation', () => {
  it('is only that variation\'s, survives save and open, and makes the file the newer version', () => {
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
    update('move', (d) => void (d.layers[0].cels[0].offset = { x: 3, y: -2 }));
    expect(artboardDoc(doc(), v).layers[0].cels[0].offset).toEqual({ x: 3, y: -2 });
    expect(artboardDoc(doc(), root).layers[0].cels[0].offset).toBeUndefined();

    const bytes = saveFile(doc());
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).version).toBe(OFFSET_FORMAT_VERSION);
    const loaded = loadFile(bytes).doc;
    expect(artboardDoc(loaded, v).layers[0].cels[0].offset).toEqual({ x: 3, y: -2 });
    expect(artboardDoc(loaded, root).layers[0].cels[0].offset).toBeUndefined();
  });
});
