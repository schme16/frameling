import { it, expect } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { duplicateArtboardById } from '../../src/artboards/ops';
import { artboardsOf } from '../../src/artboards/model';

it('duplicates the open artboard through the store (the document is a draft there)', () => {
  const d0 = newDoc({ name: 'F', width: 16, height: 16, length: 8 });
  d0.layers = [newVectorLayer('V')];
  d0.layers[0].cels = [{ id: 'c1', start: 0, length: 4, drawingId: 'd1' }];
  d0.drawings = { d1: { id: 'd1', kind: 'vector', shapes: [] } };
  resetStore(d0);
  const id = duplicateArtboardById();
  expect(id).toBeTruthy();
  const doc = store().get().doc;
  expect(artboardsOf(doc)).toHaveLength(2);
  const copy = artboardsOf(doc).find((a) => a.id === id)!;
  expect(copy.content!.layers[0].cels[0].drawingId).not.toBe('d1');
  expect(doc.drawings[copy.content!.layers[0].cels[0].drawingId]).toBeTruthy();
});
