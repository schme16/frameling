import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';
import { addArtboard, artboardDoc, artboardsOf, deleteArtboard, findArtboard, switchArtboard } from '../../src/artboards/model';
import { makeVariation } from '../../src/artboards/variations';

const rect = (id: string, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }], fill, stroke: null, opacity: 1 });
const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));

describe('a key added inside a variation', () => {
  it('survives deleting another artboard while the variation is open (and the save after it)', () => {
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
    // A new key with a new drawing, made in the variation.
    update('new key', (d) => {
      const layer = d.layers[0];
      d.drawings['dn1'] = { id: 'dn1', kind: 'vector', shapes: [rect('sn', '#00ff00')] } as VectorDrawing;
      layer.cels[0].length = 2;
      layer.cels.push({ id: 'cn', start: 2, length: 2, drawingId: 'dn1' });
    });
    // Another artboard comes and goes.
    let other = '';
    update('add', (d) => void (other = addArtboard(d)));
    update('delete', (d) => void deleteArtboard(d, other));
    const shows = (dd: Doc, a: string) => {
      const c = artboardDoc(dd, a);
      const cel = c.layers[0].cels.find((x) => x.start === 2);
      const dr = cel && c.drawings[cel.drawingId];
      return dr?.kind === 'vector' ? (dr.shapes[0] as PathShape).fill : null;
    };
    expect(shows(doc(), v)).toBe('#00ff00');
    const loaded = loadFile(saveFile(doc())).doc;
    expect(shows(loaded, v)).toBe('#00ff00');
    // Close it and open it again.
    update('close', (d) => void switchArtboard(d, root));
    expect(shows(doc(), v)).toBe('#00ff00');
    expect(findArtboard(doc(), v)).toBeTruthy();
  });
});
