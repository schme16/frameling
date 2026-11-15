import { describe, expect, it } from 'vitest';
import type { Shape } from '../../src/core/format';
import { evalCubic } from '../../src/geometry/bezier';
import { fillRegion, type FillResult } from '../../src/geometry/fill';
import { pointInPaths } from '../../src/geometry/hit';
import { arc, pan, rectPath, stroke } from './helpers';

const B = { x: 0, y: 0, width: 600, height: 600 };
const at = (shapes: Shape[], x: number, y: number, gap: number, maxPixels?: number): FillResult => fillRegion(shapes, { x, y }, { gap, bounds: B, maxPixels });

// The pan's handle: two lines of width 16 at y 282 and 318, so the open neck runs y 290 to 310, x 392 to 472.
// A gap setting of 24 fattens the walls by 12 a side, which shuts a neck 20 wide completely.
const NECK = { x0: 396, x1: 470, top: 290, bottom: 310 };

function neckGaps(r: FillResult, tol = 1): string[] {
  if (r.kind !== 'ok') return ['not ok: ' + r.kind];
  const bad: string[] = [];
  for (let x = NECK.x0; x <= NECK.x1; x += 2) {
    for (const y of [NECK.top + tol, 300, NECK.bottom - tol]) if (!pointInPaths(r.paths, x, y)) bad.push(`${x},${y}`);
  }
  return bad;
}

describe('a narrow neck is filled right to its walls', () => {
  it('the thick ring with a neck, filled from the round part, is solid along the whole neck', () => {
    const r = at(pan(0.15), 300, 300, 24);
    expect(r.kind).toBe('ok');
    expect(neckGaps(r)).toEqual([]);
  });

  it('reaches the real line along the neck, within a pixel, top and bottom', () => {
    const r = at(pan(0.15), 300, 300, 24);
    if (r.kind !== 'ok') throw new Error(r.kind);
    for (let x = NECK.x0; x <= NECK.x1; x += 1) {
      expect(pointInPaths(r.paths, x, NECK.top + 0.6)).toBe(true);
      expect(pointInPaths(r.paths, x, NECK.bottom - 0.6)).toBe(true);
    }
  });

  // From the neck itself the flood reaches the whole neck with no extra help, so this one is about the outline fit:
  // curves fitted to a few kept points used to bow across the long straight edge and leave a wedge.
  it('is the same neck whether you click in the round part or in the neck itself', () => {
    const round = at(pan(0.15), 300, 300, 24);
    const neck = at(pan(0.15), 440, 300, 24);
    expect(neckGaps(neck)).toEqual([]);
    if (round.kind !== 'ok' || neck.kind !== 'ok') throw new Error('not ok');
    expect(Math.abs(round.area - neck.area)).toBeLessThan(round.area * 0.02);
  });

  it('holds at a coarser mask, as on a big canvas', () => {
    for (const maxPixels of [90_000, 40_000]) {
      const r = at(pan(0.15), 300, 300, 24, maxPixels);
      expect(neckGaps(r, 2)).toEqual([]);
    }
  });

  it('a neck that is not narrow still fills as before', () => {
    const r = at(pan(0.15), 300, 300, 8);
    expect(r.kind).toBe('leak');
    const wide = at(pan(0.15), 300, 300, 40);
    expect(wide.kind).toBe('ok');
    expect(neckGaps(wide)).toEqual([]);
  });
});

describe('the gap closing still stops a leak', () => {
  it('a break in the rim does not let the colour out, at the setting that shuts it', () => {
    const r = at(pan(0.15), 300, 300, 24);
    if (r.kind !== 'ok') throw new Error(r.kind);
    // Above the break, outside the ring, and past the end of the handle.
    for (const [x, y] of [[300, 180], [300, 150], [250, 190], [350, 190], [500, 300], [480, 250], [300, 450], [100, 300]]) expect(pointInPaths(r.paths, x, y)).toBe(false);
    expect(r.area).toBeLessThan(Math.PI * 110 * 110 + 120 * 22);
  });

  it('still leaks when the setting does not shut the break', () => {
    expect(at(pan(0.15), 300, 300, 0).kind).toBe('leak');
    expect(at(pan(0.15), 300, 300, 10).kind).toBe('leak');
  });

  it('a break through a thick wall (a long slit) fills in but does not come out the other side', () => {
    const s = [
      stroke(arc(300, 300, 100, 0.2, 1.5 * Math.PI - 0.1), 40),
      stroke(arc(300, 300, 100, 1.5 * Math.PI + 0.1, 2 * Math.PI - 0.2), 40),
      stroke([[395, 300], [395, 300.1]], 1),
    ];
    const r = at(s, 300, 300, 24);
    if (r.kind !== 'ok') throw new Error(r.kind);
    // The ring's outer edge at the top is y = 300 - 120 = 180: nothing past it.
    for (const [x, y] of [[300, 176], [300, 160], [300, 120]]) expect(pointInPaths(r.paths, x, y)).toBe(false);
  });
});

describe('the outline does not bow past a long straight edge', () => {
  it("a rectangle's fill stays inside its walls, not bulging a few pixels out over the line", () => {
    const r = at([rectPath(100, 100, 200, 100)], 200, 150, 0);
    if (r.kind !== 'ok') throw new Error(r.kind);
    const pts = r.paths[0].points;
    const n = pts.length;
    let out = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n];
      const b = pts[i];
      if (!b.c1 || !b.c2) continue;
      for (let t = 0.05; t < 1; t += 0.05) {
        const q = evalCubic([a, b.c1, b.c2, b], t);
        // The wall is 4 wide, centred on the rectangle: the fill may tuck a pixel under it, no more.
        out = Math.max(out, 98 - q.x, q.x - 302, 98 - q.y, q.y - 202);
      }
    }
    expect(out).toBeLessThan(1);
  });
});
