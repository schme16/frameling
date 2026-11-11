import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Shape } from '../../src/core/format';
import { barrierShapes } from '../../src/tools/fill';

const line = (id: string): Shape => ({ id, type: 'path', paths: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }], fill: null, stroke: { color: '#000', width: 2, join: 'round', cap: 'round' }, opacity: 1 });

describe('the bucket sees lines from all layers when asked', () => {
  it('collects lines from visible vector layers at the frame, but not their fills or hidden layers', () => {
    const doc = newDoc();
    const ink = newVectorLayer('Ink');
    const hidden = newVectorLayer('Hidden');
    hidden.visible = false;
    doc.layers.push(ink, hidden);
    const d1 = newVectorDrawing();
    d1.shapes.push(line('a'), { id: 'f', type: 'fill', paths: [], color: '#f00', opacity: 1 });
    const d2 = newVectorDrawing();
    d2.shapes.push(line('h'));
    doc.drawings[d1.id] = d1;
    doc.drawings[d2.id] = d2;
    ink.cels.push({ id: 'c1', start: 0, length: 2, drawingId: d1.id });
    hidden.cels.push({ id: 'c2', start: 0, length: 2, drawingId: d2.id });
    const colour = doc.layers[0];
    expect(barrierShapes(doc, 1, [], false, colour.id).map((s) => s.id)).toEqual([]);
    expect(barrierShapes(doc, 1, [], true, colour.id).map((s) => s.id)).toEqual(['a']);
    expect(barrierShapes(doc, 5, [], true, colour.id).map((s) => s.id)).toEqual([]);
  });
});
