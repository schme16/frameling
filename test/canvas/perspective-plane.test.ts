import { describe, expect, it } from 'vitest';
import { applyHomography, choosePlane, homography, isConvexQuad, planeMap, projectedEllipse, projectSubPath } from '../../src/canvas/perspectivePlane';
import { matrixScale, sizeThroughCamera } from '../../src/core/camera';

const near = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);
const box = { x: 100, y: 100, w: 80, h: 60 };
// One vanishing point in the middle of a 400 x 300 page, a horizon at y = 120.
const one = [{ x: 200, y: 120 }];
const two = [{ x: 40, y: 120 }, { x: 760, y: 120 }];
/** Is `p` on the line through a and b? */
const onLine = (a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

describe('choosing a plane', () => {
  it('stays flat for Flat, or when no vanishing points show', () => {
    expect(choosePlane('flat', one, box)).toBeNull();
    expect(choosePlane('auto', [], box)).toBeNull();
  });

  it('one point: a box across the horizon is a wall, one wholly below or above is a floor', () => {
    const wall = choosePlane('auto', one, { x: 100, y: 80, w: 50, h: 90 })!;
    expect(wall.v).toEqual([0, 1, 0]);
    const floor = choosePlane('auto', one, { x: 100, y: 150, w: 50, h: 90 })!;
    expect(floor.h).toEqual([1, 0, 0]);
    const ceiling = choosePlane('auto', one, { x: 100, y: 10, w: 50, h: 90 })!;
    expect(ceiling.h).toEqual([1, 0, 0]);
    // Picking by hand wins over the guess.
    expect(choosePlane('wall', one, { x: 100, y: 150, w: 50, h: 90 })!.v).toEqual([0, 1, 0]);
    expect(choosePlane('floor', one, { x: 100, y: 80, w: 50, h: 90 })!.h).toEqual([1, 0, 0]);
  });

  it('two points: auto faces the nearer point, left and right pick one, floor uses both', () => {
    expect(choosePlane('auto', two, { x: 60, y: 100, w: 40, h: 80 })!.h).toEqual([40, 120, 1]);
    expect(choosePlane('auto', two, { x: 500, y: 100, w: 40, h: 80 })!.h).toEqual([760, 120, 1]);
    expect(choosePlane('right', two, box)!.h).toEqual([760, 120, 1]);
    expect(choosePlane('left', [two[1], two[0]], box)!.h).toEqual([40, 120, 1]);
    const f = choosePlane('floor', two, box)!;
    expect(f.h).toEqual([40, 120, 1]);
    expect(f.v).toEqual([760, 120, 1]);
  });
});

describe('the quad a drag makes', () => {
  it('a wall keeps its upright edges upright and runs the others to the point', () => {
    const p = { x: 100, y: 100 };
    const q = { x: 180, y: 160 };
    const m = planeMap(p, q, choosePlane('wall', one, box)!)!;
    const [a, b, c, d] = m.quad;
    expect(a).toEqual(p);
    expect(c).toEqual(q);
    // b is on a's line to the point and above c; d is on c's line to the point and above a.
    near(b.x, 180);
    near(d.x, 100);
    near(onLine(p, one[0], b), 0);
    near(onLine(q, one[0], d), 0);
    expect(isConvexQuad(m.quad)).toBe(true);
  });

  it('a floor with one point has level edges and edges to the point', () => {
    const p = { x: 100, y: 200 };
    const q = { x: 180, y: 260 };
    const m = planeMap(p, q, choosePlane('floor', one, { x: 100, y: 200, w: 80, h: 60 })!)!;
    const [, b, , d] = m.quad;
    // Level edges from p and q, so b shares p's height and d shares q's.
    near(b.y, 200);
    near(d.y, 260);
    near(onLine(q, one[0], b), 0);
    near(onLine(p, one[0], d), 0);
  });

  it('a floor with two points has all four edges running to a vanishing point', () => {
    const p = { x: 150, y: 180 };
    const q = { x: 250, y: 240 };
    const m = planeMap(p, q, choosePlane('floor', two, { x: 150, y: 180, w: 100, h: 60 })!)!;
    const [a, b, c, d] = m.quad;
    for (const e of [b, d]) {
      const viaLeft = Math.abs(onLine(a, two[0], e)) < 1e-6 || Math.abs(onLine(c, two[0], e)) < 1e-6;
      const viaRight = Math.abs(onLine(a, two[1], e)) < 1e-6 || Math.abs(onLine(c, two[1], e)) < 1e-6;
      expect(viaLeft).toBe(true);
      expect(viaRight).toBe(true);
    }
    expect(isConvexQuad(m.quad)).toBe(true);
  });

  it('gives up (stays flat) when the drag crosses the vanishing point so the shape would fold', () => {
    const wall = choosePlane('wall', one, box)!;
    expect(planeMap({ x: 100, y: 100 }, { x: 300, y: 160 }, wall)).toBeNull();
  });

  it('the plain plane is just the rectangle', () => {
    // Horizontal and vertical edges: the "front" of a box.
    const m = planeMap({ x: 10, y: 20 }, { x: 70, y: 90 }, { h: [1, 0, 0], v: [0, 1, 0] })!;
    expect(m.quad).toEqual([{ x: 10, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 90 }, { x: 10, y: 90 }]);
  });
});

describe('the projection', () => {
  const src = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const dst = [{ x: 5, y: 5 }, { x: 40, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 20 }];

  it('carries the four corners onto the four corners', () => {
    const h = homography(src, dst)!;
    src.forEach((s, i) => {
      const r = applyHomography(h, s.x, s.y)!;
      near(r.x, dst[i].x);
      near(r.y, dst[i].y);
    });
  });

  it('straight edges stay straight: the middle of an edge lands on the line between its corners', () => {
    const h = homography(src, dst)!;
    const mid = applyHomography(h, 5, 0)!;
    near(onLine(dst[0], dst[1], mid), 0, 1e-6);
  });

  it('refuses corners in a line', () => {
    expect(homography(src, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBeNull();
  });

  it('projects a rectangle outline corner for corner', () => {
    const p = { x: 100, y: 100 };
    const q = { x: 180, y: 160 };
    const m = planeMap(p, q, choosePlane('wall', one, box)!)!;
    const flat = { closed: true, points: [{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 180, y: 160 }, { x: 100, y: 160 }] };
    const out = projectSubPath(flat, m.map)!;
    out.points.forEach((pt, i) => {
      near(pt.x, m.quad[i].x, 1e-6);
      near(pt.y, m.quad[i].y, 1e-6);
    });
  });

  it('an ellipse in a strongly skewed quad is still a true projected circle', () => {
    const p = { x: 60, y: 140 };
    const q = { x: 180, y: 260 };
    const m = planeMap(p, q, choosePlane('floor', one, { x: 60, y: 140, w: 120, h: 120 })!)!;
    const b = { x: 60, y: 140, w: 120, h: 120 };
    const el = projectedEllipse(b, m.map)!;
    expect(el.points).toHaveLength(16);
    // Map a flattened bezier back through the inverse projection: every point should sit on the circle.
    const inv = homography(m.quad, [p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }])!;
    const cubic = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
    let worst = 0;
    for (let i = 0; i < el.points.length; i++) {
      const prev = el.points[(i + el.points.length - 1) % el.points.length];
      const cur = el.points[i];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const x = cubic(prev.x, cur.c1!.x, cur.c2!.x, cur.x, t);
        const y = cubic(prev.y, cur.c1!.y, cur.c2!.y, cur.y, t);
        const r = applyHomography(inv, x, y)!;
        worst = Math.max(worst, Math.abs(Math.hypot(r.x - 120, r.y - 200) - 60));
      }
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('an ellipse on a flat plane is the ordinary ellipse', () => {
    const m = planeMap({ x: 10, y: 20 }, { x: 70, y: 90 }, { h: [1, 0, 0], v: [0, 1, 0] })!;
    const el = projectedEllipse({ x: 10, y: 20, w: 60, h: 70 }, m.map)!;
    near(el.points[0].x, 70, 1e-6);
    near(el.points[0].y, 55, 1e-6);
    near(el.points[8].x, 10, 1e-6);
  });
});

describe('size through a camera', () => {
  it('is 1 with no camera, and the inverse of the camera zoom otherwise', () => {
    expect(sizeThroughCamera(undefined)).toBe(1);
    expect(sizeThroughCamera([1, 0, 0, 1, 0, 0])).toBe(1);
    near(sizeThroughCamera([2, 0, 0, 2, -50, -20]), 0.5);
    // Turning doesn't change size.
    const c = Math.cos(0.7) * 4;
    const s = Math.sin(0.7) * 4;
    near(matrixScale([c, s, -s, c, 0, 0]), 4);
    near(sizeThroughCamera([c, s, -s, c, 0, 0]), 0.25);
  });

  it('survives a degenerate matrix', () => {
    expect(sizeThroughCamera([0, 0, 0, 0, 0, 0])).toBe(1);
  });
});
