import { describe, expect, it } from 'vitest';
import { newVectorLayer } from '../../src/core/doc';
import type { Shape } from '../../src/core/format';
import { drawingIsBlank, frameScopeMatters, holdLongerMatters, newKeyMatters } from '../../src/timeline/matters';
import { docWith } from './helpers';

const shape = { id: 's1', type: 'rect' } as unknown as Shape;

describe('when a timeline question makes no difference', () => {
  describe('Every layer or just this layer', () => {
    it('makes no difference with one layer, and does with two', () => {
      const d = docWith([[0, 4]]);
      expect(frameScopeMatters(d)).toBe(false);
      d.layers.push(newVectorLayer('Two'));
      expect(frameScopeMatters(d)).toBe(true);
    });
  });

  describe('Move them later or cover them', () => {
    const cels = docWith([[0, 3], [3, 3], [10, 2]]).layers[0].cels;
    const [a, , c] = cels;
    it('makes no difference with nothing after the drawing', () => {
      expect(holdLongerMatters(cels, c.id, 10, 8)).toBe(false);
      const alone = docWith([[0, 3]]).layers[0].cels;
      expect(holdLongerMatters(alone, alone[0].id, 0, 20)).toBe(false);
    });
    it('makes no difference when the longer hold stops short of the next drawing', () => {
      expect(holdLongerMatters(cels, a.id, 0, 3)).toBe(false);
    });
    it('does when the drawing now runs into the next one', () => {
      expect(holdLongerMatters(cels, a.id, 0, 4)).toBe(true);
      expect(holdLongerMatters(cels, cels[1].id, 3, 8)).toBe(true);
    });
    it('does not count the drawing itself, or one that starts before it', () => {
      expect(holdLongerMatters(cels, cels[1].id, 3, 3)).toBe(false);
    });
    it('a hold of nothing counts as one frame', () => {
      expect(holdLongerMatters(cels, a.id, 2, 0)).toBe(false);
      expect(holdLongerMatters(cels, a.id, 3, 0)).toBe(true);
    });
  });

  describe('Start blank or as a copy', () => {
    it('makes no difference on an empty frame', () => {
      const d = docWith([[0, 2]]);
      expect(newKeyMatters(d, d.layers[0].id, 5)).toBe(false);
    });
    it('makes no difference on a drawing with nothing in it yet', () => {
      const d = docWith([[0, 2]]);
      expect(newKeyMatters(d, d.layers[0].id, 0)).toBe(false);
    });
    it('does once the drawing has something to copy', () => {
      const d = docWith([[0, 2]]);
      const drawing = d.drawings[d.layers[0].cels[0].drawingId];
      if (drawing.kind === 'vector') drawing.shapes.push(shape);
      expect(newKeyMatters(d, d.layers[0].id, 1)).toBe(true);
    });
    it('makes no difference on a missing layer', () => {
      const d = docWith([[0, 2]]);
      expect(newKeyMatters(d, 'nope', 0)).toBe(false);
    });
    it('recognises blank pixel and vector drawings', () => {
      expect(drawingIsBlank(undefined)).toBe(true);
      expect(drawingIsBlank({ id: 'p', kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([9, 9, 9, 0]) })).toBe(true);
      expect(drawingIsBlank({ id: 'p', kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([9, 9, 9, 255]) })).toBe(false);
      expect(drawingIsBlank({ id: 'k', kind: 'camera', view: { x: 0, y: 0, zoom: 1, rotation: 0 } })).toBe(false);
    });
  });
});

