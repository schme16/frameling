import { describe, expect, it } from 'vitest';
import type { SubPath } from '../../src/core/format';
import { sampleSubPath } from '../../src/geometry/bezier';
import { deletePoint, fromAnchors, handlesInLine, insertPoint, moveAnchor, moveHandle, nearestOnPath, toAnchors, toggleSmooth } from '../../src/geometry/pen';
import { ellipseSubPath, rectSubPath } from '../../src/tools/shapes';

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('points and handles', () => {
  it('turns a subpath into anchors and back without changing it', () => {
    for (const sp of [ellipseSubPath({ x: 0, y: 0, w: 100, h: 60 }), rectSubPath({ x: 0, y: 0, w: 50, h: 40 }, 10), rectSubPath({ x: 0, y: 0, w: 50, h: 40 })]) {
      const back = fromAnchors(toAnchors(sp), sp.closed);
      const a = sampleSubPath(sp, 8);
      const b = sampleSubPath(back, 8);
      expect(b.length).toBe(a.length);
      a.forEach((p, i) => expect(near(p, b[i])).toBeLessThan(1e-6));
    }
  });

  it('keeps an open line open, with no handle before its first point', () => {
    const sp: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 3, y: 5 }, c2: { x: 7, y: 5 } }] };
    const a = toAnchors(sp);
    expect(a[0].hin).toBeUndefined();
    expect(a[0].hout).toEqual({ x: 3, y: 5 });
    expect(fromAnchors(a, false)).toEqual(sp);
  });

  it('adds a point on a curve without changing its shape', () => {
    const sp = ellipseSubPath({ x: 0, y: 0, w: 100, h: 60 });
    const a = toAnchors(sp);
    const hit = nearestOnPath(a, true, { x: 85, y: 50 })!;
    expect(hit.dist).toBeLessThan(5);
    const more = insertPoint(a, hit.seg, hit.t);
    expect(more.length).toBe(a.length + 1);
    const after = fromAnchors(more, true);
    // Every point of the new outline is still on the old one.
    for (const p of sampleSubPath(after, 6)) expect(nearestOnPath(a, true, p)!.dist).toBeLessThan(0.05);
  });

  it('switches corners and smooth points, and deletes points', () => {
    const sq = toAnchors(rectSubPath({ x: 0, y: 0, w: 40, h: 40 }));
    const smooth = toggleSmooth(sq, 1, true);
    expect(smooth[1].hin && smooth[1].hout).toBeTruthy();
    expect(handlesInLine(smooth[1])).toBe(true);
    expect(toggleSmooth(smooth, 1, true)[1].hin).toBeUndefined();
    expect(deletePoint(sq, 2).length).toBe(3);
  });

  it('moves points with their handles, and turns the other handle on a smooth point', () => {
    const a = [{ x: 0, y: 0 }, { x: 50, y: 0, hin: { x: 40, y: 0 }, hout: { x: 70, y: 0 } }, { x: 100, y: 0 }];
    const moved = moveAnchor(a, 1, { x: 50, y: 10 });
    expect(moved[1].hin).toEqual({ x: 40, y: 10 });
    const bent = moveHandle(a, 1, 'hout', { x: 50, y: 20 }, true);
    expect(bent[1].hin!.x).toBeCloseTo(50);
    expect(bent[1].hin!.y).toBeCloseTo(-10);
    const broken = moveHandle(a, 1, 'hout', { x: 50, y: 20 }, false);
    expect(broken[1].hin).toEqual({ x: 40, y: 0 });
  });
});
