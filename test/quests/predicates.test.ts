import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import {
  celSignature,
  changedFromPrevious,
  closedShapeCenter,
  drawingsDiffer,
  hasClosedShapeAt,
  hasInkAt,
  hasStrokeAt,
  ownDrawingAt,
  paintCount,
  paintedAt,
  squashFrame,
} from '../../src/quests/predicates';
import type { PathShape } from '../../src/core/format';
import { pixelDoc, putPixels, putShapes, ring, stroke, vectorDoc } from './helpers';

const rectShape = (w = 80, h = 80, fill: string | null = null): PathShape => ({
  id: 'r',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 10, y: 10 }, { x: 10 + w, y: 10 }, { x: 10 + w, y: 10 + h }, { x: 10, y: 10 + h }] }],
  fill,
  stroke: { color: '#000', width: 4, join: 'round', cap: 'round' },
  opacity: 1,
});

describe('ink and strokes', () => {
  it('sees ink on vector and pixel layers, at the right frame', () => {
    const v = vectorDoc();
    expect(hasInkAt(v, 0)).toBe(false);
    putShapes(v, v.layers[0], 2, [stroke(ring())]);
    expect(hasInkAt(v, 0)).toBe(false);
    expect(hasInkAt(v, 2)).toBe(true);
    expect(hasStrokeAt(v, 2)).toBe(true);
    const p = pixelDoc();
    expect(hasInkAt(p, 0)).toBe(false);
    putPixels(p, p.layers[0], 0, [[3, 3]]);
    expect(hasInkAt(p, 0)).toBe(true);
    expect(paintedAt(p, 0)).toBe(1);
  });

  it('an empty drawing is not ink', () => {
    const v = vectorDoc();
    putShapes(v, v.layers[0], 0, []);
    expect(hasInkAt(v, 0)).toBe(false);
  });
});

describe('frames and copies', () => {
  it('a hold is not a new drawing, a different drawing is', () => {
    const d = vectorDoc();
    const l = d.layers[0];
    putShapes(d, l, 0, [stroke(ring())], 2);
    expect(ownDrawingAt(d, 1)).toBe(false);
    const d2 = vectorDoc();
    putShapes(d2, d2.layers[0], 0, [stroke(ring())]);
    putShapes(d2, d2.layers[0], 1, [stroke(ring())]);
    expect(ownDrawingAt(d2, 1)).toBe(true);
    expect(ownDrawingAt(d2, 0)).toBe(false);
  });

  it('an unchanged copy is not a change; a moved one is; ids do not matter', () => {
    const d = vectorDoc();
    putShapes(d, d.layers[0], 0, [stroke(ring())]);
    putShapes(d, d.layers[0], 1, [stroke(ring())]);
    expect(changedFromPrevious(d, 1)).toBe(false);
    const e = vectorDoc();
    putShapes(e, e.layers[0], 0, [stroke(ring())]);
    putShapes(e, e.layers[0], 1, [stroke(ring(260))]);
    expect(changedFromPrevious(e, 1)).toBe(true);
    expect(changedFromPrevious(e, 0)).toBe(false);
  });

  it('a second drawing with nothing in it is not a change', () => {
    const d = vectorDoc();
    putShapes(d, d.layers[0], 0, [stroke(ring())]);
    putShapes(d, d.layers[0], 1, []);
    expect(changedFromPrevious(d, 1)).toBe(false);
  });

  it('compares pixel drawings byte by byte', () => {
    const p = pixelDoc();
    const a = putPixels(p, p.layers[0], 0, [[1, 1], [2, 2]]);
    const b = putPixels(p, p.layers[0], 1, [[1, 1], [2, 2]]);
    expect(drawingsDiffer(p.drawings[a], p.drawings[b])).toBe(false);
    expect(changedFromPrevious(p, 1)).toBe(false);
    const q = pixelDoc();
    putPixels(q, q.layers[0], 0, [[1, 1], [2, 2]]);
    putPixels(q, q.layers[0], 1, [[1, 1]]);
    expect(changedFromPrevious(q, 1)).toBe(true);
  });

  it('notices a hold changing', () => {
    const d = vectorDoc();
    putShapes(d, d.layers[0], 0, [stroke(ring())], 1);
    const before = celSignature(d);
    d.layers[0].cels[0].length = 2;
    expect(celSignature(d)).not.toBe(before);
  });
});

describe('closed shapes and paint', () => {
  it('counts a joined-up line, a rectangle and an ellipse; not an open line or a speck', () => {
    const open = vectorDoc();
    putShapes(open, open.layers[0], 0, [stroke(ring(200, 150, 60, false))]);
    expect(hasClosedShapeAt(open, 0)).toBe(false);

    const closed = vectorDoc();
    putShapes(closed, closed.layers[0], 0, [stroke(ring())]);
    expect(hasClosedShapeAt(closed, 0)).toBe(true);

    const rect = vectorDoc();
    putShapes(rect, rect.layers[0], 0, [rectShape()]);
    expect(hasClosedShapeAt(rect, 0)).toBe(true);

    const speck = vectorDoc();
    putShapes(speck, speck.layers[0], 0, [stroke(ring(200, 150, 6))]);
    expect(hasClosedShapeAt(speck, 0)).toBe(false);

    const few = vectorDoc();
    putShapes(few, few.layers[0], 0, [stroke([[10, 10], [80, 10], [10, 10]])]);
    expect(hasClosedShapeAt(few, 0)).toBe(false);
  });

  it('forgives a hand-drawn loop whose ends nearly meet', () => {
    const d = vectorDoc();
    const pts = ring();
    pts[pts.length - 1] = [pts[0][0] + 6, pts[0][1] + 4];
    putShapes(d, d.layers[0], 0, [stroke(pts)]);
    expect(hasClosedShapeAt(d, 0)).toBe(true);
  });

  it('finds the middle of a closed shape, for the bucket', () => {
    const d = vectorDoc();
    putShapes(d, d.layers[0], 0, [stroke(ring(200, 150, 60))]);
    const c = closedShapeCenter(d, 0)!;
    expect(c.x).toBeCloseTo(200, 0);
    expect(c.y).toBeCloseTo(150, 0);
    expect(closedShapeCenter(d, 5)).toBeNull();
  });

  it('counts paint: fill shapes and filled paths', () => {
    const d = vectorDoc();
    putShapes(d, d.layers[0], 0, [rectShape(80, 80, '#ff0000'), rectShape(), { id: 'f', type: 'fill', paths: [], color: '#00ff00', opacity: 1 }]);
    expect(paintCount(d, 0)).toBe(2);
  });
});

describe('the bouncing ball', () => {
  it('uses the contact marker, or frame 9 (index 8)', () => {
    const d = newDoc({});
    expect(squashFrame(d)).toBe(8);
    d.markers.push({ id: 'm', name: 'contact', frame: 5 });
    expect(squashFrame(d)).toBe(5);
  });
});

describe('layers', () => {
  it('looks across every layer', () => {
    const d = vectorDoc();
    const top = newVectorLayer('Top');
    d.layers.push(top);
    putShapes(d, top, 0, [stroke(ring())]);
    expect(hasInkAt(d, 0)).toBe(true);
  });
});
