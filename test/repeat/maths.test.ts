import { describe, expect, it } from 'vitest';
import { apply, type Matrix } from '../../src/geometry/matrix';
import {
  axisReflections,
  cleanRepeat,
  copyAs,
  gridSize,
  lineAngle,
  MAX_REPEAT,
  mirrorLine,
  reflectAcross,
  reflectX,
  reflectY,
  repeatCount,
  repeatMatrices,
  ringStep,
} from '../../src/geometry/repeat';
import { mirrorMatrices, vectorMirror } from '../../src/tools/mirror';
import { stroke } from '../../src/templates/build';

const at = (m: Matrix, x: number, y: number) => apply(m, x, y);
const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
};

describe('a grid', () => {
  it('puts the original first and steps across then down', () => {
    const ms = repeatMatrices({ kind: 'grid', cols: 3, rows: 2, dx: 10, dy: 20 }, { x: 0, y: 0 });
    expect(ms).toHaveLength(6);
    expect(at(ms[0], 5, 5)).toEqual({ x: 5, y: 5 });
    expect(at(ms[2], 5, 5)).toEqual({ x: 25, y: 5 });
    expect(at(ms[3], 5, 5)).toEqual({ x: 5, y: 25 });
    expect(at(ms[5], 5, 5)).toEqual({ x: 25, y: 25 });
  });

  it('takes a step either way, so a grid can grow left and up', () => {
    const ms = repeatMatrices({ kind: 'grid', cols: 2, rows: 2, dx: -10, dy: -5 }, { x: 0, y: 0 });
    expect(at(ms[3], 0, 0)).toEqual({ x: -10, y: -5 });
  });

  it('holds a big ask to the limit by taking rows away', () => {
    expect(gridSize({ cols: 50, rows: 50 })).toEqual({ cols: 50, rows: 8 });
    expect(repeatCount({ kind: 'grid', cols: 50, rows: 50, dx: 1, dy: 1 })).toBeLessThanOrEqual(MAX_REPEAT);
    expect(gridSize({ cols: 0, rows: -3 })).toEqual({ cols: 1, rows: 1 });
  });
});

describe('a ring', () => {
  it('spreads a full ring evenly, so the last copy stops short of the first', () => {
    expect(ringStep(4, 360)).toBe(90);
    const ms = repeatMatrices({ kind: 'ring', count: 4, cx: 100, cy: 100 }, { x: 0, y: 0 });
    expect(ms).toHaveLength(4);
    // Round the middle a quarter turn at a time (clockwise on screen, y goes down).
    close(at(ms[1], 150, 100), 100, 150);
    close(at(ms[2], 150, 100), 50, 100);
    close(at(ms[3], 150, 100), 100, 50);
  });

  it('puts the last copy of a fan at the far end', () => {
    expect(ringStep(3, 90)).toBe(45);
    const ms = repeatMatrices({ kind: 'ring', count: 3, cx: 0, cy: 0, sweep: 90 }, { x: 0, y: 0 });
    close(at(ms[2], 10, 0), 0, 10);
  });

  it('turns each copy with the ring, or keeps it upright', () => {
    const follow = repeatMatrices({ kind: 'ring', count: 4, cx: 0, cy: 0 }, { x: 10, y: 0 });
    const upright = repeatMatrices({ kind: 'ring', count: 4, cx: 0, cy: 0, turn: false }, { x: 10, y: 0 });
    // A turned copy has a turned matrix; an upright one only moves.
    expect(follow[1][0]).toBeCloseTo(0, 9);
    expect(follow[1][1]).toBeCloseTo(1, 9);
    expect(upright[1].slice(0, 4)).toEqual([1, 0, 0, 1]);
    // Both put the shape's middle in the same place on the ring.
    close(at(follow[1], 10, 0), 0, 10);
    close(at(upright[1], 10, 0), 0, 10);
    // And the upright one keeps its own corner the same distance from its own middle.
    close(at(upright[1], 12, 0), 2, 10);
  });

  it('counts at least one and at most the limit', () => {
    expect(repeatCount({ kind: 'ring', count: 0, cx: 0, cy: 0 })).toBe(1);
    expect(repeatCount({ kind: 'ring', count: 9999, cx: 0, cy: 0 })).toBe(MAX_REPEAT);
  });
});

describe('a mirror', () => {
  it('flips across an up-and-down, a sideways and a slanted line', () => {
    close(at(reflectAcross(100, 0, 90), 130, 40), 70, 40);
    close(at(reflectAcross(0, 50, 0), 130, 40), 130, 60);
    // A line at 45 degrees through the middle swaps x and y.
    close(at(reflectAcross(0, 0, 45), 3, 7), 7, 3);
    close(at(reflectAcross(10, 10, 45), 13, 17), 17, 13);
  });

  it('keeps the original, then the image, and can reflect through a point', () => {
    const line = repeatMatrices({ kind: 'mirror', x: 100, y: 0 }, { x: 0, y: 0 });
    expect(line).toHaveLength(2);
    close(at(line[1], 130, 40), 70, 40);
    const point = repeatMatrices({ kind: 'mirror', x: 100, y: 100, point: true }, { x: 0, y: 0 });
    close(at(point[1], 130, 40), 70, 160);
  });

  it('reads the angle of a line between two points, clean at the straight ones', () => {
    expect(lineAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(lineAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(lineAngle({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45, 9);
    const l = mirrorLine({ kind: 'mirror', x: 5, y: 5, angle: 90 }, 10);
    close(l.a, 5, -5);
    close(l.b, 5, 15);
  });
});

describe('one mirror, not two', () => {
  it('makes the very same matrices as the drawing mirror for an up-and-down or a sideways line', () => {
    expect(reflectAcross(120, 0, 90)).toEqual(reflectX(120));
    expect(reflectAcross(0, 80, 0)).toEqual(reflectY(80));
    const drawing = mirrorMatrices(vectorMirror('both', 400, 300, 120, 80));
    expect(drawing).toEqual(axisReflections(true, true, 120, 80));
    expect(drawing[0]).toEqual(repeatMatrices({ kind: 'mirror', x: 120, y: 0, angle: 90 }, { x: 0, y: 0 })[1]);
    expect(drawing[1]).toEqual(repeatMatrices({ kind: 'mirror', x: 0, y: 80, angle: 0 }, { x: 0, y: 0 })[1]);
  });

  it('makes a copy that is a plain shape of its own', () => {
    const s = { ...stroke([[0, 0], [5, 5]], '#000', 4), group: 'g', origin: 'o', repeat: { kind: 'grid' as const, cols: 2, rows: 1, dx: 5, dy: 0 } };
    const c = copyAs(s, 'new');
    expect(c.id).toBe('new');
    expect('group' in c || 'origin' in c || 'repeat' in c).toBe(false);
  });
});

describe('reading a repeat', () => {
  it('leaves out what is not one', () => {
    expect(cleanRepeat(undefined)).toBeUndefined();
    expect(cleanRepeat('ring')).toBeUndefined();
    expect(cleanRepeat({ kind: 'spiral' })).toBeUndefined();
  });

  it('puts sane numbers in', () => {
    expect(cleanRepeat({ kind: 'grid', cols: 2.4, rows: 'x', dx: Infinity, dy: 7 })).toEqual({ kind: 'grid', cols: 2, rows: 1, dx: 0, dy: 7 });
    expect(cleanRepeat({ kind: 'ring', count: 1e9, cx: 5, cy: 6, sweep: 999, turn: false })).toEqual({ kind: 'ring', count: MAX_REPEAT, cx: 5, cy: 6, sweep: 360, turn: false });
    expect(cleanRepeat({ kind: 'ring', count: 5, cx: 0, cy: 0, sweep: 360, turn: true })).toEqual({ kind: 'ring', count: 5, cx: 0, cy: 0 });
    expect(cleanRepeat({ kind: 'mirror', x: 1, y: 2, angle: 270 })).toEqual({ kind: 'mirror', x: 1, y: 2 });
    expect(cleanRepeat({ kind: 'mirror', x: 1, y: 2, angle: 30 })).toEqual({ kind: 'mirror', x: 1, y: 2, angle: 30 });
    expect(cleanRepeat({ kind: 'mirror', x: 1, y: 2, point: true, angle: 30 })).toEqual({ kind: 'mirror', x: 1, y: 2, point: true });
  });
});
