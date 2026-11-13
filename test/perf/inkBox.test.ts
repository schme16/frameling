// The box a layer bitmap is cut to must hold everything the drawing paints. Pixel-for-pixel checks against the real canvas
// are in scripts/e2e/layer-cache.cjs; these are the arithmetic and the "when in doubt, keep the whole frame" rules.
import { describe, expect, it } from 'vitest';
import { cropFor, shapesInk, unionCrop } from '../../src/canvas/inkBox';
import type { PathShape, Shape, StrokeShape } from '../../src/core/format';

const path = (over: Partial<PathShape> = {}): PathShape => ({
  id: 'p',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 50 }] }],
  fill: '#000000',
  stroke: null,
  opacity: 1,
  ...over,
});

const stroke = (over: Partial<StrokeShape['brush']> = {}, pts = [{ x: 100, y: 100, p: 0.5 }, { x: 140, y: 120, p: 0.5 }]): StrokeShape => ({
  id: 's',
  type: 'stroke',
  points: pts,
  brush: { size: 10, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true, ...over },
  color: '#000000',
  opacity: 1,
});

describe('shapesInk', () => {
  it('is the box of the points of a plain fill', () => {
    expect(shapesInk([path()])).toEqual({ x0: 10, y0: 20, x1: 30, y1: 50 });
  });

  it('counts curve handles, since a curve can bulge towards them', () => {
    const p = path({ paths: [{ closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 3, y: -40 }, c2: { x: 7, y: 60 } }] }] });
    expect(shapesInk([p])).toEqual({ x0: 0, y0: -40, x1: 10, y1: 60 });
  });

  it('adds the reach of a stroke, a miter being the longest', () => {
    const round = shapesInk([path({ stroke: { color: '#000', width: 10, join: 'round', cap: 'butt' } })])!;
    const miter = shapesInk([path({ stroke: { color: '#000', width: 10, join: 'miter', cap: 'butt' } })])!;
    expect(round.x0).toBeLessThanOrEqual(10 - 5);
    // The canvas's default miter limit lets a point reach ten half-widths.
    expect(miter.x0).toBeLessThanOrEqual(10 - 50);
    expect(miter.x1).toBeGreaterThanOrEqual(30 + 50);
  });

  it('reaches a pen stroke by its widest width, not only its nominal size', () => {
    const b = shapesInk([stroke({ size: 20, thinning: -1 }, [{ x: 100, y: 100, p: 0 }, { x: 120, y: 100, p: 1 }])])!;
    // Up to a full size either side of the points.
    expect(b.x0).toBeLessThanOrEqual(100 - 20);
    expect(b.y1).toBeGreaterThanOrEqual(100 + 20);
  });

  it('is empty (not unknown) with no shapes', () => {
    const b = shapesInk([])!;
    expect(b.x1).toBeLessThan(b.x0);
  });

  it('does not know shapes it cannot measure, or numbers that are not numbers', () => {
    expect(shapesInk([{ id: 'i', type: 'instance' } as unknown as Shape])).toBeNull();
    expect(shapesInk([{ id: 't', type: 'text' } as unknown as Shape])).toBeNull();
    expect(shapesInk([path(), { id: 'x', type: 'someplugin' } as unknown as Shape])).toBeNull();
    expect(shapesInk([path({ paths: [{ closed: true, points: [{ x: NaN, y: 0 }] }] })])).toBeNull();
    // A zero line width leaves the canvas's earlier width in force.
    expect(shapesInk([path({ stroke: { color: '#000', width: 0, join: 'round', cap: 'butt' } })])).toBeNull();
  });
});

describe('cropFor', () => {
  const box = { x0: 100, y0: 50, x1: 200, y1: 90 };

  it('maps the box to whole device pixels with a margin, on the stage scale', () => {
    // A 1000 x 500 document drawn at 2x: 2000 x 1000 device pixels.
    expect(cropFor(box, 1000, 500, 2000, 1000)).toEqual({ x: 198, y: 98, w: 204 + 0, h: 84 });
  });

  it('is clipped to the frame', () => {
    const c = cropFor({ x0: -500, y0: -500, x1: 5000, y1: 5000 }, 1000, 500, 2000, 1000)!;
    expect(c).toEqual({ x: 0, y: 0, w: 2000, h: 1000 });
  });

  it('takes the fractional zoom into account but keeps a whole-pixel frame', () => {
    const c = cropFor({ x0: 0, y0: 0, x1: 1000, y1: 500 }, 1000, 500, 1234.7, 617.9)!;
    expect(c.x).toBe(0);
    expect(c.w).toBe(1234);
    expect(c.h).toBe(617);
  });

  it('is a single see-through pixel for nothing, or for something off the frame', () => {
    expect(cropFor({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, 100, 100, 100, 100)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropFor({ x0: 500, y0: 5, x1: 600, y1: 9 }, 100, 100, 100, 100)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('says unknown when the box is, or the sizes are not usable', () => {
    expect(cropFor(null, 100, 100, 100, 100)).toBeNull();
    expect(cropFor(box, 0, 100, 100, 100)).toBeNull();
    expect(cropFor(box, 100, 100, 0.5, 100)).toBeNull();
  });
});

describe('unionCrop', () => {
  it('holds both', () => {
    expect(unionCrop({ x: 10, y: 10, w: 10, h: 10 }, { x: 30, y: 0, w: 5, h: 8 })).toEqual({ x: 10, y: 0, w: 25, h: 20 });
  });
});
