import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, celAt } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { editActiveDrawing } from '../../src/tools/edit';

function setup() {
  const doc = newDoc();
  const d = newVectorDrawing();
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  const s = resetStore(doc);
  s.setUi({ frame: 2, activeLayerId: doc.layers[0].id });
  return s;
}
const add = (dr: { shapes: unknown[] }) => void dr.shapes.push({ id: 's', type: 'fill', paths: [], color: '#000', opacity: 1 });

describe('drawing on a held frame', () => {
  it('makes a new key from a copy when chosen', () => {
    setChoice('draw.heldFrame', 'new-key');
    const s = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    const l = s.get().doc.layers[0];
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 2], [2, 2]]);
    const first = s.get().doc.drawings[celAt(l, 0)!.drawingId];
    const here = s.get().doc.drawings[celAt(l, 2)!.drawingId];
    expect(first.kind === 'vector' && first.shapes.length).toBe(0);
    expect(here.kind === 'vector' && here.shapes.length).toBe(1);
    s.undo();
    expect(s.get().doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 4]]);
  });

  it('changes the held drawing when chosen', () => {
    setChoice('draw.heldFrame', 'edit-held');
    const s = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    const l = s.get().doc.layers[0];
    expect(l.cels.length).toBe(1);
    const d = s.get().doc.drawings[l.cels[0].drawingId];
    expect(d.kind === 'vector' && d.shapes.length).toBe(1);
  });
});
