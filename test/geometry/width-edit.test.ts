import { describe, expect, it } from 'vitest';
import type { PathStroke, SubPath, WidthStop } from '../../src/core/format';
import { areaOfPaths, geomArea } from '../../src/geometry/merge';
import { cleanWidths, lineAreaStyled, widthAt } from '../../src/geometry/lineStyle';
import { addStopHere, grabOffset, isEven, moveStop, nearestSpot, removeStop, setWidthAt, spotAt, stopHandles, stopNear, widthFromDrag } from '../../src/geometry/widthEdit';

const line: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
const elbow: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };

describe('finding a place on a line', () => {
  it('says how far along a straight line a point is', () => {
    const s = nearestSpot(line, { x: 25, y: 7 })!;
    expect(s.t).toBeCloseTo(0.25, 5);
    expect(s.x).toBeCloseTo(25, 5);
    expect(s.dist).toBeCloseTo(7, 5);
  });

  it('measures along the bends, not as the crow flies', () => {
    const s = nearestSpot(elbow, { x: 100, y: 100 })!;
    expect(s.t).toBeCloseTo(1, 3);
    expect(nearestSpot(elbow, { x: 100, y: 0 })!.t).toBeCloseTo(0.5, 2);
  });

  it('gives the left side of the line as the normal', () => {
    const s = nearestSpot(line, { x: 50, y: 3 })!;
    expect(Math.abs(s.ny)).toBeCloseTo(1, 5);
    expect(s.nx).toBeCloseTo(0, 5);
  });

  it('finds a spot by its distance along, and round trips', () => {
    const s = spotAt(elbow, 0.75)!;
    expect(s.x).toBeCloseTo(100, 3);
    expect(s.y).toBeCloseTo(50, 3);
    expect(nearestSpot(elbow, s)!.t).toBeCloseTo(0.75, 3);
  });

  it('works round a closed shape', () => {
    const sq: SubPath = { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };
    expect(nearestSpot(sq, { x: 50, y: 100 })!.t).toBeCloseTo(0.625, 2);
    expect(nearestSpot(sq, { x: 0, y: 50 })!.t).toBeCloseTo(0.875, 2);
  });

  it('is null for a line that is only a point', () => {
    expect(nearestSpot({ closed: false, points: [{ x: 1, y: 1 }] }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('width stops', () => {
  it('starts an even line with two stops at its ends, and puts the new one between', () => {
    const s = setWidthAt(undefined, 0.5, 2);
    expect(s).toEqual([{ at: 0, w: 1 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }]);
  });

  it('changes a stop that is already there instead of adding a second', () => {
    const s = setWidthAt([{ at: 0, w: 1 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }], 0.505, 3);
    expect(s.length).toBe(3);
    expect(s[1].w).toBe(3);
  });

  it('keeps the stops in order and never goes past the limits', () => {
    const s = setWidthAt([{ at: 0, w: 1 }, { at: 1, w: 1 }], 0.2, 100);
    s.push(...setWidthAt(s, 0.1, -5).slice(1, 2));
    expect(Math.max(...cleanWidths(s)!.map((x) => x.w))).toBeLessThanOrEqual(8);
    expect(cleanWidths(s)!.every((x) => x.w >= 0)).toBe(true);
    const t = setWidthAt(setWidthAt(undefined, 0.7, 2), 0.3, 0.001);
    expect(t.map((x) => x.at)).toEqual([0, 0.3, 0.7, 1]);
    expect(t[1].w).toBeCloseTo(0.05, 5);
  });

  it('adds a stop that leaves the line looking the same, so grabbing does not make it jump', () => {
    const before: WidthStop[] = [{ at: 0, w: 0.2 }, { at: 1, w: 1.4 }];
    const { stops, index } = addStopHere(before, 0.5);
    expect(stops.length).toBe(3);
    expect(stops[index].w).toBeCloseTo(widthAt(before, 0.5), 6);
    // The same width at the new stop, and the same everywhere it is exactly on a stop.
    expect(widthAt(stops, 0)).toBeCloseTo(0.2, 6);
    expect(widthAt(stops, 1)).toBeCloseTo(1.4, 6);
  });

  it('hands back the stop already there instead of a second', () => {
    const before: WidthStop[] = [{ at: 0, w: 1 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }];
    const r = addStopHere(before, 0.5);
    expect(r.index).toBe(1);
    expect(r.stops.length).toBe(3);
  });

  it('moves a stop, never past its neighbours, and keeps the two ends at the ends', () => {
    const s: WidthStop[] = [{ at: 0, w: 1 }, { at: 0.4, w: 2 }, { at: 0.6, w: 2 }, { at: 1, w: 1 }];
    expect(moveStop(s, 1, 3, 0.9)[1].at).toBeCloseTo(0.595, 5);
    expect(moveStop(s, 1, 3, -1)[1].at).toBeCloseTo(0.005, 5);
    expect(moveStop(s, 0, 3, 0.3)[0].at).toBe(0);
    expect(moveStop(s, 3, 3, 0.3)[3].at).toBe(1);
    expect(moveStop(s, 1, 3)[1].w).toBe(3);
    expect(s[1].w).toBe(2);
  });

  it('takes a stop away, and goes back to an even line when nothing is left but the line itself', () => {
    const s: WidthStop[] = [{ at: 0, w: 1 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }];
    expect(removeStop(s, 1)).toBeNull();
    const t: WidthStop[] = [{ at: 0, w: 0.2 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }];
    expect(removeStop(t, 1)!.length).toBe(2);
  });

  it('knows when stops are the same as none', () => {
    expect(isEven(undefined)).toBe(true);
    expect(isEven([{ at: 0, w: 1 }, { at: 1, w: 1 }])).toBe(true);
    expect(isEven([{ at: 0, w: 1 }, { at: 1, w: 1.2 }])).toBe(false);
  });

  it('finds the stop near a place', () => {
    const s: WidthStop[] = [{ at: 0, w: 1 }, { at: 0.5, w: 2 }, { at: 1, w: 1 }];
    expect(stopNear(s, 0.51)).toBe(1);
    expect(stopNear(s, 0.3)).toBe(-1);
    expect(stopNear(undefined, 0.3)).toBe(-1);
  });
});

describe('dragging a width', () => {
  const spot = { x: 50, y: 0, t: 0.5, nx: 0, ny: 1 };

  it('makes the line as fat as twice how far the pointer is from its middle', () => {
    expect(widthFromDrag(spot, { x: 50, y: 10 }, 0, 10)).toBeCloseTo(2, 6);
    expect(widthFromDrag(spot, { x: 50, y: -20 }, 0, 10)).toBeCloseTo(4, 6);
  });

  it('does not jump when the grab starts a little off the edge', () => {
    // A line 10 wide has its edge 5 from the middle; grabbed 2 inside it at y = 3.
    const grab = grabOffset(spot, { x: 50, y: 3 }, 1, 10);
    expect(widthFromDrag(spot, { x: 50, y: 3 }, grab, 10)).toBeCloseTo(1, 6);
    expect(widthFromDrag(spot, { x: 50, y: 8 }, grab, 10)).toBeCloseTo(2, 6);
  });

  it('stays within the limits', () => {
    expect(widthFromDrag(spot, { x: 50, y: 0 }, 0, 10)).toBeCloseTo(0.05, 6);
    expect(widthFromDrag(spot, { x: 50, y: 9999 }, 0, 10)).toBe(8);
  });
});

describe('handles', () => {
  it('sits one on each edge of the line at every stop', () => {
    const h = stopHandles(line, [{ at: 0, w: 1 }, { at: 0.5, w: 3 }, { at: 1, w: 1 }], 10);
    expect(h.length).toBe(3);
    expect(h[1].centre.x).toBeCloseTo(50, 5);
    expect(Math.abs(h[1].left.y - h[1].right.y)).toBeCloseTo(30, 5);
  });

  it('has none for an even line', () => {
    expect(stopHandles(line, undefined, 10)).toEqual([]);
  });
});

describe('the stops really change the line', () => {
  const st = (widths?: WidthStop[]): PathStroke => ({ color: '#000', width: 10, join: 'round', cap: 'butt', ...(widths ? { widths } : {}) });
  const drawn = (widths?: WidthStop[]) => lineAreaStyled([line], st(widths), false) ?? [];
  it('a line made fat in the middle covers more than the even line', () => {
    const even = geomArea(areaOfPaths(drawn()));
    const fat = geomArea(areaOfPaths(drawn(setWidthAt(undefined, 0.5, 3))));
    expect(even).toBeGreaterThan(0);
    expect(fat).toBeGreaterThan(even * 1.5);
  });
});
