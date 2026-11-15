// Line ends and path points as snap targets: what a shape offers, the bucket index agreeing with a plain search, the
// lines a stroke's start and end can be pulled onto, and the options for it.
import { describe, expect, it } from 'vitest';
import type { PathShape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { endsOf, farEnoughToClose, indexShapes, nearestOf, PointIndex, pullToLines, type DrawLines } from '../../src/canvas/snapPoints';
import { clampDrawDistance, DRAW_DISTANCE, DRAW_TARGETS, drawTargets, defaultPicks, describeSnap, targetInfo, type SnapTarget } from '../../src/canvas/snapModel';
import { box } from '../tools/helpers';

const stroke = (id: string, pts: [number, number][]): StrokeShape => ({ id, type: 'stroke', points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), brush: { ...DEFAULT_BRUSH }, color: '#000000', opacity: 1 });

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

describe('what a shape offers to meet', () => {
  it('a stroke offers its two ends and nothing along its body', () => {
    expect(endsOf(stroke('a', [[1, 2], [5, 5], [9, 9], [20, 30]]))).toEqual([{ x: 1, y: 2 }, { x: 20, y: 30 }]);
  });
  it('a single dab is one place', () => {
    expect(endsOf(stroke('a', [[4, 4]]))).toEqual([{ x: 4, y: 4 }]);
  });
  it('a path offers every point, from every piece', () => {
    const b = box('r', 10, 20, 30, 40);
    expect(endsOf(b)).toHaveLength(4);
    expect(endsOf(b)).toContainEqual({ x: 40, y: 60 });
  });
  it('shapes without points offer none', () => {
    const empty: PathShape = { ...box('e', 0, 0, 1, 1), paths: [] };
    expect(endsOf(empty)).toEqual([]);
  });
  it('the same shape gives the same answer without being walked again', () => {
    const s = stroke('a', [[0, 0], [1, 1]]);
    expect(endsOf(s)).toBe(endsOf(s));
  });
});

describe('the point index', () => {
  it('finds the nearest point inside the reach, and nothing outside it', () => {
    const idx = new PointIndex([{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 12, y: 10 }]);
    expect(idx.nearest(11.5, 10, 3)).toEqual({ x: 12, y: 10 });
    expect(idx.nearest(10.5, 10, 3)).toEqual({ x: 10, y: 10 });
    expect(idx.nearest(30, 30, 5)).toBeNull();
    expect(idx.nearest(-500, -500, 5)).toBeNull();
  });
  it('an empty index finds nothing', () => {
    expect(new PointIndex([]).nearest(0, 0, 100)).toBeNull();
    expect(indexShapes([]).size).toBe(0);
  });
  it('is on the edge of its reach exactly: within is a hit', () => {
    const idx = new PointIndex([{ x: 0, y: 0 }]);
    expect(idx.nearest(3, 4, 5)).toEqual({ x: 0, y: 0 });
    expect(idx.nearest(3, 4, 4.99)).toBeNull();
  });
  it('agrees with looking at every point, on many random points and reaches', () => {
    for (const [seed, n, span] of [[1, 50, 100], [2, 2000, 1920], [3, 5000, 400], [4, 300, 4000]] as const) {
      const r = rng(seed);
      const pts = Array.from({ length: n }, () => ({ x: r() * span, y: r() * span * 0.6 }));
      const idx = new PointIndex(pts);
      for (let k = 0; k < 400; k++) {
        const q = { x: (r() * 1.2 - 0.1) * span, y: (r() * 1.2 - 0.1) * span * 0.6 };
        const tol = [1, 4, 12, 60, 700][k % 5];
        let best: { x: number; y: number } | null = null;
        let bd = tol * tol;
        for (const p of pts) {
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (d <= bd) {
            bd = d;
            best = p;
          }
        }
        const got = idx.nearest(q.x, q.y, tol);
        if (!best) expect(got).toBeNull();
        else expect(Math.hypot((got?.x ?? 1e9) - q.x, (got?.y ?? 1e9) - q.y)).toBeCloseTo(Math.sqrt(bd), 9);
      }
    }
  });
  it('copes with points all in a line, all in one place, and far from the origin', () => {
    const line = new PointIndex(Array.from({ length: 500 }, (_, i) => ({ x: i * 2, y: 7 })));
    expect(line.nearest(100.4, 9, 5)).toEqual({ x: 100, y: 7 });
    const same = new PointIndex(Array.from({ length: 50 }, () => ({ x: 5, y: 5 })));
    expect(same.nearest(6, 5, 2)).toEqual({ x: 5, y: 5 });
    const far = new PointIndex([{ x: 1e6, y: -1e6 }, { x: 1e6 + 3, y: -1e6 }]);
    expect(far.nearest(1e6 + 2, -1e6, 2)).toEqual({ x: 1e6 + 3, y: -1e6 });
  });
  it('leaves out the shapes it is told to', () => {
    const shapes = [stroke('a', [[0, 0], [100, 100]]), stroke('b', [[200, 0], [300, 100]])];
    expect(indexShapes(shapes).nearest(100, 100, 2)).toEqual({ x: 100, y: 100 });
    expect(indexShapes(shapes, new Set(['a'])).nearest(100, 100, 2)).toBeNull();
  });
});

const L = (over: Partial<DrawLines> = {}): DrawLines => ({ width: 400, height: 300, page: false, centre: false, guides: null, grid: null, plugins: null, ...over });

describe('pulling a start or end onto lines', () => {
  it('pulls each way on its own and says what it landed on', () => {
    const r = pullToLines({ x: 99, y: 151 }, 4, L({ guides: [{ id: 'g', axis: 'x', at: 100 }], centre: true }));
    expect(r.x).toBe(100);
    expect(r.y).toBe(150);
    expect(r.lines).toEqual([{ axis: 'x', at: 100, kind: 'guides' }, { axis: 'y', at: 150, kind: 'centre' }]);
  });
  it('leaves a point alone when nothing is in reach', () => {
    const r = pullToLines({ x: 60, y: 60 }, 4, L({ page: true, centre: true, grid: null }));
    expect(r).toEqual({ x: 60, y: 60, lines: [] });
  });
  it('snaps to the page edges', () => {
    const r = pullToLines({ x: 2, y: 298 }, 4, L({ page: true }));
    expect([r.x, r.y]).toEqual([0, 300]);
    expect(r.lines.map((l) => l.kind)).toEqual(['page', 'page']);
  });
  it('snaps to the square grid, worked out and not listed, and stays on the page', () => {
    const r = pullToLines({ x: 63, y: 98 }, 4, L({ grid: 32 }));
    expect([r.x, r.y]).toEqual([64, 96]);
    const edge = pullToLines({ x: 386, y: 1 }, 4, L({ grid: 32 }));
    expect([edge.x, edge.y]).toEqual([384, 0]);
    expect(pullToLines({ x: 40, y: 40 }, 4, L({ grid: 32 })).lines).toEqual([]);
  });
  it('takes the nearest line when several are in reach, and an earlier kind on a tie', () => {
    const r = pullToLines({ x: 100, y: 5 }, 8, L({ guides: [{ id: 'a', axis: 'x', at: 103 }, { id: 'b', axis: 'x', at: 98 }] }));
    expect(r.x).toBe(98);
    const tie = pullToLines({ x: 0.5, y: 5 }, 4, L({ guides: [{ id: 'a', axis: 'x', at: 0 }], page: true }));
    expect(tie.lines[0].kind).toBe('guides');
  });
  it('uses what plugins offer', () => {
    const r = pullToLines({ x: 10, y: 10 }, 4, L({ plugins: { x: [12], y: [] } }));
    expect(r.x).toBe(12);
    expect(r.lines[0].kind).toBe('plugins');
  });
  it('a guide only pulls the way it runs', () => {
    const r = pullToLines({ x: 100, y: 100 }, 4, L({ guides: [{ id: 'g', axis: 'y', at: 102 }] }));
    expect([r.x, r.y]).toEqual([100, 102]);
  });
  it('the reach is inclusive', () => {
    expect(pullToLines({ x: 104, y: 50 }, 4, L({ guides: [{ id: 'g', axis: 'x', at: 100 }] })).x).toBe(100);
    expect(pullToLines({ x: 104.1, y: 50 }, 4, L({ guides: [{ id: 'g', axis: 'x', at: 100 }] })).x).toBe(104.1);
  });
});

describe('the nearest end, and closing a loop', () => {
  it('takes the nearest candidate inside the reach, skipping missing ones', () => {
    expect(nearestOf({ x: 0, y: 0 }, 5, null, { x: 4, y: 0 }, undefined, { x: 2, y: 0 })).toEqual({ x: 2, y: 0 });
    expect(nearestOf({ x: 0, y: 0 }, 1, { x: 4, y: 0 })).toBeNull();
  });
  it('a stroke closes on its own start only after it has gone well past the reach', () => {
    expect(farEnoughToClose(10, 8)).toBe(false);
    expect(farEnoughToClose(48, 8)).toBe(false);
    expect(farEnoughToClose(49, 8)).toBe(true);
  });
});

describe('the options for drawing tools', () => {
  it('line ends and points are a vector target, on from the start, with its own words', () => {
    expect(targetInfo('points').contexts).toEqual(['vector']);
    expect(defaultPicks().vector.points).toBe(true);
    expect(defaultPicks().pixel.points).toBeUndefined();
    expect(describeSnap(['points'])).toBe('Snapped to line end');
  });
  it('the pen, pencil and brush take only the targets that suit a start and end', () => {
    const all = new Set<SnapTarget>(['page', 'centre', 'guides', 'grid', 'points', 'shapes', 'spacing', 'perspective', 'angles', 'plugins']);
    expect([...drawTargets(all)].sort()).toEqual([...DRAW_TARGETS].sort());
    expect(drawTargets(all).has('shapes')).toBe(false);
    expect(drawTargets(all).has('spacing')).toBe(false);
    expect([...drawTargets(new Set<SnapTarget>(['shapes']))]).toEqual([]);
  });
  it('the pull distance is whole, inside its range, and the usual for junk', () => {
    expect(clampDrawDistance(7.6)).toBe(8);
    expect(clampDrawDistance(0)).toBe(DRAW_DISTANCE.min);
    expect(clampDrawDistance(500)).toBe(DRAW_DISTANCE.max);
    expect(clampDrawDistance('nope')).toBe(DRAW_DISTANCE.usual);
    expect(clampDrawDistance(undefined)).toBe(DRAW_DISTANCE.usual);
  });
});
