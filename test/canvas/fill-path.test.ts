// A filled shape's path leaves out `closePath` (a fill closes every piece itself, and `closePath` slows down with every
// piece already in the path: 4000 grain holes cost 42 ms). An outlined shape keeps it, since its joins need the close.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FillShape, PathShape, SubPath } from '../../src/core/format';
import { shapePath, subPathsToPath2D } from '../../src/core/render';

const calls: string[] = [];
class RecordingPath {
  moveTo() { calls.push('M'); }
  lineTo() { calls.push('L'); }
  bezierCurveTo() { calls.push('C'); }
  closePath() { calls.push('Z'); }
}

const tri = (x: number): SubPath => ({ closed: true, points: [{ x, y: 0 }, { x: x + 4, y: 0 }, { x: x + 2, y: 4 }] });
const open: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] };
const curvy: SubPath = { closed: true, points: [{ x: 0, y: 0, c1: { x: 1, y: 5 }, c2: { x: 5, y: 9 } }, { x: 10, y: 0, c1: { x: 3, y: -4 }, c2: { x: 7, y: -4 } }, { x: 10, y: 10 }, { x: 0, y: 10, c1: { x: 5, y: 9 }, c2: { x: 1, y: 5 } }] };

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('building a path to fill', () => {
  it('draws the same segments either way, and only a path to outline is closed', () => {
    vi.stubGlobal('Path2D', RecordingPath);
    const paths = [tri(0), open, curvy, tri(20)];
    subPathsToPath2D(paths);
    const closed = [...calls];
    calls.length = 0;
    subPathsToPath2D(paths, true);
    const filled = [...calls];
    expect(closed.filter((c) => c !== 'Z')).toEqual(filled);
    expect(closed.filter((c) => c === 'Z').length).toBe(3);
    expect(filled.includes('Z')).toBe(false);
    // A closing curve is still drawn: the segment is kept, only the close is left to the fill.
    expect(filled.filter((c) => c === 'C').length).toBe(3);
  });

  it('a fill and a path with no outline are built to fill; a path with an outline is closed', () => {
    vi.stubGlobal('Path2D', RecordingPath);
    const fill: FillShape = { id: 'f', type: 'fill', paths: [tri(0)], color: '#000', opacity: 1 };
    const flat: PathShape = { id: 'p1', type: 'path', paths: [tri(0)], fill: '#000', stroke: null, opacity: 1 };
    const lined: PathShape = { id: 'p2', type: 'path', paths: [tri(0)], fill: '#000', stroke: { color: '#f00', width: 3, join: 'miter', cap: 'butt' }, opacity: 1 };
    shapePath(fill);
    expect(calls).not.toContain('Z');
    calls.length = 0;
    shapePath(flat);
    expect(calls).not.toContain('Z');
    calls.length = 0;
    shapePath(lined);
    expect(calls).toContain('Z');
  });
});
