import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { addingStartsNewDrawing, editActiveDrawing } from '../../src/tools/edit';
import { ghostItems, tracingAt } from '../../src/canvas/ghost';
import { addShapes as addToDrawing } from '../../src/tools/merge-mode';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const cels = () => store().get().doc.layers[0].cels.map((c) => [c.start, c.length]);

beforeEach(() => {
  vectorStore();
  addShapes(box('a', 0, 0, 100, 100));
});

describe('drawing on frames a drawing carries on to', () => {
  it('the first drawing carries on to the end', () => {
    expect(cels()).toEqual([[0, store().get().doc.length]]);
    store().setUi({ frame: 5 });
    expect(shapesNow().map((s) => s.id)).toEqual(['a']);
    expect(addingStartsNewDrawing()).toBe(true);
  });

  it('adding a shape there starts a new drawing, and the one before shows as a ghost', () => {
    const n = store().get().doc.length;
    store().setUi({ frame: 5 });
    addToDrawing('Draw stroke', [box('b', 200, 0, 50, 50)]);
    expect(cels()).toEqual([[0, 5], [5, n - 5]]);
    expect(shapesNow().map((s) => s.id)).toEqual(['b']);
    expect(tracingAt(5).has(store().get().doc.layers[0].id)).toBe(true);
    const ghost = ghostItems(store().get().doc, 5);
    expect(ghost).toHaveLength(1);
    expect(ghost[0].drawing.kind === 'vector' && ghost[0].drawing.shapes[0].id).toBe('a');
    // Frame 1 is untouched.
    store().setUi({ frame: 0 });
    expect(shapesNow().map((s) => s.id)).toEqual(['a']);
  });

  it('changing what is there (not adding) still works on the drawing you can see', () => {
    store().setUi({ frame: 5 });
    editActiveDrawing('Recolour', 'vector', (d) => void ((d.shapes[0] as PathShape).fill = '#00ff00'));
    // No asker in tests: the held-frame default makes a new key from a copy, with the change.
    expect(shapesNow().map((s) => (s as PathShape).fill)).toEqual(['#00ff00']);
    store().setUi({ frame: 0 });
    expect(shapesNow().map((s) => (s as PathShape).fill)).toEqual(['#ff0000']);
  });
});

describe('the empty frame ghost', () => {
  it('shows the last drawing on an empty frame, and nothing where something is drawn', () => {
    store().update('trim', (d) => void (d.layers[0].cels[0].length = 2));
    expect(ghostItems(store().get().doc, 1, new Set())).toHaveLength(0);
    const g = ghostItems(store().get().doc, 6, new Set());
    expect(g).toHaveLength(1);
  });

  it('leaves out hidden layers and layers kept out of the onion skin', () => {
    store().update('trim', (d) => {
      d.layers[0].cels[0].length = 2;
      d.layers[0].onion = false;
    });
    expect(ghostItems(store().get().doc, 6, new Set())).toHaveLength(0);
  });

  it('forgets the drawing-over once you go to another frame', () => {
    store().setUi({ frame: 5 });
    addToDrawing('Draw stroke', [box('b', 200, 0, 50, 50)]);
    expect(tracingAt(6).size).toBe(0);
    expect(tracingAt(5).size).toBe(0);
  });
});
