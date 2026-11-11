import { describe, expect, it } from 'vitest';
import type { Shape, SubPath } from '../../src/core/format';
import { fillRegion, pathsOverlap, rasteriseBarrier, maskScale, type FillResult } from '../../src/geometry/fill';
import { pointInPaths } from '../../src/geometry/hit';
import { fillRings, ringArea2 } from '../../src/geometry/raster';
import { flattenSubPath } from '../../src/geometry/hit';
import { arc, brokenCircle, rectPath, stroke } from './helpers';

const BOUNDS = { x: 0, y: 0, width: 600, height: 600 };
const fill = (shapes: Shape[], x: number, y: number, gap = 0, bounds = BOUNDS): FillResult => fillRegion(shapes, { x, y }, { gap, bounds });
function ok(r: FillResult) {
  if (r.kind !== 'ok') throw new Error('expected a fill, got ' + r.kind);
  return r;
}
function closedCircle(cx: number, cy: number, r: number, size = 8) {
  return stroke(arc(cx, cy, r, 0, Math.PI * 2 + 0.2), size);
}
/** Rasterises subpaths even-odd into a w x h mask. */
function paint(paths: SubPath[], w = 600, h = 600) {
  const m = new Uint8Array(w * h);
  fillRings(m, w, w === h ? h : h, paths.map(flattenSubPath), 'evenodd');
  return m;
}

describe('rasterising the barrier', () => {
  it('a stroke covers the pixels along its line and none far from it', () => {
    const { mask, w } = rasteriseBarrier([stroke([[100, 100], [300, 100]], 10)], BOUNDS, 1);
    expect(mask[100 * w + 200]).toBe(1);
    expect(mask[96 * w + 200]).toBe(1);
    expect(mask[103 * w + 250]).toBe(1);
    expect(mask[90 * w + 200]).toBe(0);
    expect(mask[110 * w + 200]).toBe(0);
    expect(mask[100 * w + 450]).toBe(0);
  });

  it('a path with a stroke is a wall at the stroke width, and its inside stays open', () => {
    const { mask, w } = rasteriseBarrier([rectPath(100, 100, 200, 100)], BOUNDS, 1);
    expect(mask[100 * w + 200]).toBe(1);
    expect(mask[99 * w + 200]).toBe(1);
    expect(mask[150 * w + 200]).toBe(0);
    expect(mask[150 * w + 100]).toBe(1);
  });

  it('fills are paint, not walls, unless asked', () => {
    const fillShape: Shape = { id: 'f', type: 'fill', color: '#f00', opacity: 1, paths: [{ closed: true, points: [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 200 }, { x: 10, y: 200 }] }] };
    expect(rasteriseBarrier([fillShape], BOUNDS, 1).mask.some((v) => v)).toBe(false);
    expect(rasteriseBarrier([fillShape], BOUNDS, 1, true).mask.some((v) => v)).toBe(true);
  });

  it('keeps the mask to the pixel budget', () => {
    expect(maskScale(1280, 720)).toBe(1);
    const s = maskScale(8000, 6000);
    expect(8000 * s * 6000 * s).toBeLessThanOrEqual(4_000_001);
    expect(s).toBeLessThan(1);
  });
});

describe('fill region', () => {
  const circle = [closedCircle(300, 300, 100)];

  it('fills inside a closed circle, to the inside edge of the line', () => {
    const r = ok(fill(circle, 300, 300));
    const inner = 96; // 100 minus half the 8px line
    expect(Math.abs(r.area - Math.PI * inner * inner)).toBeLessThan(Math.PI * inner * inner * 0.02);
    expect(r.paths).toHaveLength(1);
    expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    expect(pointInPaths(r.paths, 300 + 60, 300 + 60)).toBe(true);
    expect(pointInPaths(r.paths, 300 + 120, 300)).toBe(false);
  });

  it('is a leak when nothing closes the area', () => {
    expect(fill([], 300, 300).kind).toBe('leak');
    expect(fill([stroke(arc(300, 300, 100, 0, Math.PI), 8)], 300, 300).kind).toBe('leak');
    // Outside the circle also touches the stage edge.
    expect(fill(circle, 20, 20).kind).toBe('leak');
  });

  it('says on-line when the click lands on a stroke', () => {
    expect(fill(circle, 400, 300).kind).toBe('on-line');
    expect(fill(circle, 300, 203).kind).toBe('on-line');
  });

  it('says outside when the click is off the stage', () => {
    expect(fill(circle, -5, 20).kind).toBe('outside');
    expect(fill(circle, 700, 20).kind).toBe('outside');
  });

  it('closes small gaps: a circle of four strokes leaks at None and fills at Small', () => {
    // 10 degrees open between strokes: about 17px between the ends, so about 9px of open air past the round caps.
    const gappy = brokenCircle(300, 300, 100, 4, 10);
    expect(fill(gappy, 300, 300, 0).kind).toBe('leak');
    expect(fill(gappy, 300, 300, 6).kind).toBe('leak');
    const r = ok(fill(gappy, 300, 300, 12));
    expect(r.paths).toHaveLength(1);
    // It stays inside the circle (give or take the little bulge into each gap).
    expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    expect(pointInPaths(r.paths, 300 + 115, 300)).toBe(false);
    expect(Math.abs(r.area - Math.PI * 96 * 96)).toBeLessThan(Math.PI * 96 * 96 * 0.04);
    expect(r.stats.radius).toBeGreaterThan(0);
    // A bigger setting works too.
    ok(fill(gappy, 300, 300, 40));
  });

  it('closes a gap in a rectangle drawn as four separate strokes', () => {
    const l = (a: [number, number], b: [number, number]) => stroke([a, b], 6);
    const box = [l([100, 100], [180, 100]), l([190, 100], [300, 100]), l([300, 100], [300, 300]), l([300, 300], [100, 300]), l([100, 300], [100, 100])];
    // A 10px hole between the first two top strokes, less 6 of cap leaves about 4 open.
    expect(fill(box, 200, 200, 0).kind).toBe('leak');
    const r = ok(fill(box, 200, 200, 8));
    expect(pointInPaths(r.paths, 200, 200)).toBe(true);
    expect(pointInPaths(r.paths, 200, 80)).toBe(false);
  });

  it('keeps a hole: a ring of two circles gives an outer path and a hole', () => {
    const ring = [closedCircle(300, 300, 150), closedCircle(300, 300, 60)];
    const r = ok(fill(ring, 300, 300 - 105)); // between the circles
    expect(r.paths).toHaveLength(2);
    const [a, b] = r.paths.map((p) => {
      const f = flattenSubPath(p);
      return ringArea2(f);
    });
    // Opposite orientation: one outer, one hole.
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(pointInPaths(r.paths, 300, 300)).toBe(false); // the hole
    expect(pointInPaths(r.paths, 300, 300 - 105)).toBe(true);
    expect(pointInPaths(r.paths, 300, 300 - 160)).toBe(false);
    const expected = Math.PI * (146 * 146 - 64 * 64);
    expect(Math.abs(r.area - expected)).toBeLessThan(expected * 0.03);
  });

  it('keeps an island hole even when it is tiny and the gap is big', () => {
    // A small closed eye inside a face: filling the face leaves the eye alone.
    const face = [closedCircle(300, 300, 150), closedCircle(260, 260, 12)];
    const r = ok(fill(face, 340, 340, 24));
    expect(pointInPaths(r.paths, 340, 340)).toBe(true);
    expect(pointInPaths(r.paths, 260, 260)).toBe(false);
  });

  it('fills a pocket smaller than the gap setting instead of the outside', () => {
    const shapes = [closedCircle(300, 300, 150), closedCircle(300, 300, 12)];
    const r = ok(fill(shapes, 300, 300, 60));
    // Inside the little circle, not the big ring around it.
    expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    expect(pointInPaths(r.paths, 300, 300 - 80)).toBe(false);
    expect(r.area).toBeLessThan(Math.PI * 14 * 14);
  });

  it('works when the click is right next to a line', () => {
    const r = ok(fill(circle, 300, 300 - 94, 12));
    expect(Math.abs(r.area - Math.PI * 96 * 96)).toBeLessThan(Math.PI * 96 * 96 * 0.03);
    // On the inside edge of the line, with no gap closing.
    ok(fill(circle, 300, 300 - 94, 0));
  });

  it('tucks under the lines: paint and lines together leave no sliver inside the circle', () => {
    const { mask: walls } = rasteriseBarrier(circle, BOUNDS, 1);
    for (const gap of [0, 12]) {
      const r = ok(fill(circle, 300, 300, gap));
      const painted = paint(r.paths);
      let bare = 0;
      for (let y = 0; y < 600; y++)
        for (let x = 0; x < 600; x++) {
          const d = Math.hypot(x + 0.5 - 300, y + 0.5 - 300);
          if (d < 103 && !painted[y * 600 + x] && !walls[y * 600 + x]) bare++;
        }
      expect(bare).toBe(0);
    }
  });

  it('works on a downscaled mask for a huge stage', () => {
    const big = { x: 0, y: 0, width: 6000, height: 4000 };
    const shapes = [closedCircle(3000, 2000, 900, 40)];
    const r = ok(fill(shapes, 3000, 2000, 60, big));
    expect(r.stats.scale).toBeLessThan(1);
    expect(r.stats.width * r.stats.height).toBeLessThanOrEqual(4_000_000 + 7000);
    const inner = 880;
    expect(Math.abs(r.area - Math.PI * inner * inner)).toBeLessThan(Math.PI * inner * inner * 0.03);
  });

  it('honours bounds that do not start at the origin', () => {
    const r = ok(fill(circle, 300, 300, 0, { x: 100, y: 100, width: 400, height: 400 }));
    expect(pointInPaths(r.paths, 300, 300)).toBe(true);
    expect(Math.min(...r.paths[0].points.map((p) => p.x))).toBeGreaterThan(190);
  });

  it('fills the inside of a stroked rectangle path exactly', () => {
    const r = ok(fill([rectPath(100, 100, 200, 100)], 200, 150));
    // Inside the 4px stroke: 196 x 96.
    expect(Math.abs(r.area - 196 * 96)).toBeLessThan(196 * 96 * 0.02);
    // Corners stay sharp: the outline has four corner points, not a blob.
    expect(r.paths[0].points.length).toBeLessThanOrEqual(8);
  });

  it('a filled path without a stroke bounds its own area', () => {
    const p = rectPath(100, 100, 200, 100, { stroke: null, fill: '#f00' });
    const r = ok(fill([p], 200, 150));
    expect(Math.abs(r.area - 200 * 100)).toBeLessThan(200 * 100 * 0.05);
  });

  it('measures how well a fill matches the area it was made from', () => {
    const r = ok(fill(circle, 300, 300));
    expect(pathsOverlap(r.paths, r.paths, BOUNDS)).toBeCloseTo(1, 5);
    const half = ok(fill([...circle, stroke([[190, 300], [410, 300]], 8)], 300, 250));
    expect(pathsOverlap(r.paths, half.paths, BOUNDS)).toBeLessThan(0.6);
    expect(pathsOverlap(r.paths, [], BOUNDS)).toBe(0);
  });
});
