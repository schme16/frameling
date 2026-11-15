// The tester's frying pan split across two layers: the body is outlined in paint on one layer, and the line that closes
// the break in its rim is a drawn line on another. Filling on the colour layer underneath has to see both.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, Layer, Shape, SubPath } from '../../src/core/format';
import { fillRegion, type FillResult } from '../../src/geometry/fill';
import { pointInPaths } from '../../src/geometry/hit';
import { barrierShapes } from '../../src/tools/fill';
import { arc, stroke } from './helpers';

const B = { x: 0, y: 0, width: 600, height: 600 };

function layerWith(doc: Doc, name: string, shapes: Shape[]): Layer {
  const l = newVectorLayer(name);
  const d = newVectorDrawing();
  d.shapes.push(...shapes);
  doc.drawings[d.id] = d;
  l.cels.push({ id: `c-${name}`, start: 0, length: 4, drawingId: d.id });
  doc.layers.push(l);
  return l;
}

/** A fill shape: one closed polygon per ring. */
function paintShape(id: string, rings: [number, number][][]): Shape {
  const paths: SubPath[] = rings.map((r) => ({ closed: true, points: r.map(([x, y]) => ({ x, y })) }));
  return { id, type: 'fill', color: '#ff0000', opacity: 1, paths };
}

/** The pan's body outlined in paint: a ring 16 wide round (300,300) with a 60 pixel break at the top. */
function paintedRim(): Shape {
  const a0 = 1.5 * Math.PI + 0.3;
  const a1 = 1.5 * Math.PI - 0.3 + 2 * Math.PI;
  return paintShape('rim', [[...arc(300, 300, 108, a0, a1, 3), ...arc(300, 300, 92, a1, a0, 3)]]);
}

/** The line that closes the break, on another layer. */
const bridge = (): Shape => stroke([[300 - 100 * Math.sin(0.3) - 6, 200 + 8], [300 + 100 * Math.sin(0.3) + 6, 200 + 8]], 16);

const fillAt = (doc: Doc, active: Layer, x: number, y: number, withFills = true): FillResult => {
  const shapes = barrierShapes(doc, 1, [], true, active.id, withFills);
  return fillRegion(shapes, { x, y }, { gap: 0, bounds: B });
};

describe('paint on another layer walls a fill in', () => {
  it('the pan split across two layers is closed: the painted rim plus the drawn bridge', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Paint outline', [paintedRim()]);
    layerWith(doc, 'Ink', [bridge()]);
    const r = fillAt(doc, colour, 300, 300);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    // Inside the rim and nowhere outside it.
    expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    expect(pointInPaths(r.paths, 300, 250)).toBe(true);
    expect(pointInPaths(r.paths, 10, 10)).toBe(false);
    expect(pointInPaths(r.paths, 300, 120)).toBe(false);
    expect(r.area).toBeLessThan(Math.PI * 100 * 100);
    expect(r.area).toBeGreaterThan(Math.PI * 80 * 80);
  });

  it('without the painted layer the same pan leaks, which is what the tester saw', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Ink', [bridge()]);
    expect(fillAt(doc, colour, 300, 300).kind).toBe('leak');
  });

  it('a layer ABOVE counts, and the same paint on a layer BELOW the one being filled does not', () => {
    const doc = newDoc({ width: 600, height: 600 });
    layerWith(doc, 'Below', [paintedRim()]);
    const mid = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Ink', [bridge()]);
    // The rim is under the new paint, so it is no wall: the fill runs out through the break.
    expect(fillAt(doc, mid, 300, 300).kind).toBe('leak');
    expect(barrierShapes(doc, 1, [], true, mid.id).map((s) => s.id)).not.toContain('rim');
  });

  it('a big tint on a layer above, under the click, does not wall the click off', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Ink', [stroke([[100, 100], [500, 100], [500, 500], [100, 500], [100, 100]], 8)]);
    layerWith(doc, 'Tint', [paintShape('tint', [[[0, 0], [600, 0], [600, 600], [0, 600]]])]);
    const r = fillAt(doc, colour, 300, 300);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    // The ink square is the wall, not the page-sized tint over it.
    expect(pointInPaths(r.paths, 120, 120)).toBe(true);
    expect(pointInPaths(r.paths, 50, 50)).toBe(false);
  });

  it('paint on a layer above only walls what its edge really bounds: a click outside a small patch is not boxed in by it', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Ink', [stroke([[100, 100], [500, 100], [500, 500], [100, 500], [100, 100]], 8)]);
    layerWith(doc, 'Patch', [paintShape('patch', [[[250, 250], [350, 250], [350, 350], [250, 350]]])]);
    const r = fillAt(doc, colour, 150, 150);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(pointInPaths(r.paths, 150, 150)).toBe(true);
    // The patch is a wall to this click, like a line would be: its inside is not part of the fill.
    expect(pointInPaths(r.paths, 300, 300)).toBe(false);
  });

  it('a merge layer leaves other layers paint out, since every fill edge there is already a wall', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Paint outline', [paintedRim()]);
    expect(barrierShapes(doc, 1, [], true, colour.id, false).map((s) => s.id)).toEqual([]);
  });

  it('is only asked of when lines from all layers is on', () => {
    const doc = newDoc({ width: 600, height: 600 });
    const colour = layerWith(doc, 'Colour', []);
    layerWith(doc, 'Paint outline', [paintedRim()]);
    expect(barrierShapes(doc, 1, [], false, colour.id)).toEqual([]);
  });
});
