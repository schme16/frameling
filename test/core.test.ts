import { describe, expect, it } from 'vitest';
import { celAt, newDoc, newVectorDrawing, uid } from '../src/core/doc';
import { Store } from '../src/core/store';

describe('store', () => {
  it('undoes and redoes, and coalesces bursts', () => {
    const s = new Store(newDoc());
    s.update('Rename', (d) => void (d.name = 'A'));
    s.update('Rename', (d) => void (d.name = 'AB'), { coalesce: 'name' });
    s.update('Rename', (d) => void (d.name = 'ABC'), { coalesce: 'name' });
    expect(s.get().doc.name).toBe('ABC');
    s.undo();
    expect(s.get().doc.name).toBe('A');
    s.undo();
    expect(s.get().doc.name).toBe('Untitled');
    s.redo();
    expect(s.get().doc.name).toBe('A');
  });

  it('keeps typed arrays through patches', () => {
    const s = new Store(newDoc({ pixel: { pixelSize: 8 } }));
    const layer = s.get().doc.layers[0];
    s.update('Add', (d) => {
      const dr = { id: uid(), kind: 'pixel' as const, width: 2, height: 2, pixels: new Uint8ClampedArray(16) };
      d.drawings[dr.id] = dr;
      d.layers[0].cels.push({ id: uid(), start: 0, length: 2, drawingId: dr.id });
    });
    const cel = celAt(s.get().doc.layers[0], 1)!;
    expect(s.get().doc.drawings[cel.drawingId].kind).toBe('pixel');
    expect(layer.cels.length).toBe(0);
  });
});

describe('doc', () => {
  it('finds the cel covering a frame', () => {
    const d = newDoc();
    const v = newVectorDrawing();
    d.drawings[v.id] = v;
    d.layers[0].cels.push({ id: 'a', start: 2, length: 3, drawingId: v.id });
    expect(celAt(d.layers[0], 1)).toBeUndefined();
    expect(celAt(d.layers[0], 4)?.id).toBe('a');
    expect(celAt(d.layers[0], 5)).toBeUndefined();
  });
});
