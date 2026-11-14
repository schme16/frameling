// The Transform box's maths: every handle, every modifier, the pivot, and that what is done can be undone exactly.
import { describe, expect, it } from 'vitest';
import { apply, multiply, type Matrix, type Pt, type Rect } from '../../src/canvas/geometry';
import { moveBoxTo, sizeBoxTo, slantBoxBy, turnBoxBy } from '../../src/select/numbers';
import {
  angleFromPivot,
  arrowStep,
  boxAngle,
  corners,
  frameOf,
  hitBox,
  insideQuad,
  inverse,
  isIdentity,
  localPoints,
  moveBox,
  movePivot,
  pivotPoint,
  place,
  readout,
  rotateKnob,
  skewBox,
  stretchBox,
  toArt,
  turnBox,
  type Frame,
} from '../../src/transform/box';

const R: Rect = { x: 100, y: 50, w: 80, h: 40 };
const near = (a: Pt, b: Pt, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};
const mat = (m: Matrix, m2: Matrix) => m.forEach((v, i) => expect(v).toBeCloseTo(m2[i], 9));
const f0 = (): Frame => frameOf(R);
const L = localPoints(R);

describe('corners', () => {
  it('stretching puts the corner under the pointer and keeps the opposite one still', () => {
    for (const h of ['nw', 'ne', 'se', 'sw'] as const) {
      const p = { x: L[h].x + 33, y: L[h].y + 17 };
      const m = stretchBox(f0(), h, p);
      near(apply(m, L[h].x, L[h].y), p);
      const opp = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }[h] as 'nw';
      near(apply(m, L[opp].x, L[opp].y), L[opp]);
    }
  });

  it('Shift keeps the proportions, taking the bigger pull', () => {
    const m = stretchBox(f0(), 'se', { x: 180 + 80, y: 90 + 5 }, { shift: true });
    expect(m[0]).toBeCloseTo(m[3], 9);
    expect(m[0]).toBeCloseTo(2, 9);
  });

  it('Alt works from the pivot: the middle until the pivot moves', () => {
    const m = stretchBox(f0(), 'se', { x: 200, y: 110 }, { alt: true });
    near(apply(m, 140, 70), { x: 140, y: 70 });
    // Both sides grew by the same amount about the middle.
    near(apply(m, L.se.x, L.se.y), { x: 200, y: 110 });
    near(apply(m, L.nw.x, L.nw.y), { x: 80, y: 30 });
    const f = { ...f0(), pivot: L.nw };
    near(apply(stretchBox(f, 'se', { x: 200, y: 110 }, { alt: true }), L.nw.x, L.nw.y), L.nw);
  });

  it('dragging past the far side flips, and never collapses to nothing', () => {
    const m = stretchBox(f0(), 'se', { x: 50, y: 30 });
    expect(m[0]).toBeLessThan(0);
    expect(m[3]).toBeLessThan(0);
    const flat = stretchBox(f0(), 'se', { x: 100, y: 50 });
    expect(Math.abs(flat[0])).toBeGreaterThan(0);
  });
});

describe('sides', () => {
  it('squash one way only, and the opposite side stays', () => {
    const m = stretchBox(f0(), 'e', { x: 280, y: 999 });
    near(apply(m, L.e.x, L.e.y), { x: 280, y: L.e.y });
    near(apply(m, L.w.x, L.w.y), L.w);
    expect(m[3]).toBe(1);
    const t = stretchBox(f0(), 'n', { x: 0, y: 20 });
    near(apply(t, L.n.x, L.n.y), { x: L.n.x, y: 20 });
    near(apply(t, L.s.x, L.s.y), L.s);
    expect(t[0]).toBe(1);
  });

  it('Shift on a side keeps the proportions, the other way following about the middle', () => {
    const m = stretchBox(f0(), 'e', { x: 260, y: 70 }, { shift: true });
    expect(m[0]).toBeCloseTo(m[3], 9);
    // The height followed about its own middle line, so the box grew level with itself.
    expect(apply(m, 140, 70).y).toBeCloseTo(70, 9);
  });

  it('a dragged width agrees with the typed one', () => {
    const typed = sizeBoxTo(R, 200, null, false)!;
    mat(stretchBox(f0(), 'e', { x: R.x + 200, y: 70 }), typed);
  });

  it('Alt on a side works from the pivot', () => {
    const m = stretchBox(f0(), 'e', { x: 240, y: 70 }, { alt: true });
    near(apply(m, L.centre.x, L.centre.y), L.centre);
    near(apply(m, L.e.x, L.e.y), { x: 240, y: L.e.y });
    near(apply(m, L.w.x, L.w.y), { x: 40, y: L.w.y });
  });
});

describe('slanting from a side', () => {
  it('slides the side along itself and keeps the opposite one put', () => {
    const m = skewBox(f0(), 'n', { x: L.n.x + 20, y: L.n.y });
    near(apply(m, L.n.x, L.n.y), { x: L.n.x + 20, y: L.n.y });
    near(apply(m, L.s.x, L.s.y), L.s);
    // The side stays level: only x changed.
    near(apply(m, L.ne.x, L.ne.y), { x: L.ne.x + 20, y: L.ne.y });
  });

  it('works up and down from a side edge too', () => {
    const m = skewBox(f0(), 'e', { x: L.e.x, y: L.e.y + 15 });
    near(apply(m, L.e.x, L.e.y), { x: L.e.x, y: L.e.y + 15 });
    near(apply(m, L.w.x, L.w.y), L.w);
  });

  it('agrees with the typed Slant when it works from the middle', () => {
    const deg = 25;
    const k = Math.tan((deg * Math.PI) / 180);
    // The top edge is above the middle by h/2, so it slides by -k * h/2 for a positive slant.
    const m = skewBox(f0(), 'n', { x: L.n.x - k * (R.h / 2), y: L.n.y }, { alt: true });
    mat(m, slantBoxBy(R, deg)!);
  });

  it('Shift snaps the angle to 15 degrees', () => {
    const m = skewBox(f0(), 's', { x: L.s.x + 17, y: L.s.y }, { snap: true });
    const deg = (Math.atan(m[2]) * 180) / Math.PI;
    expect(Math.abs(deg / 15 - Math.round(deg / 15))).toBeLessThan(1e-9);
  });

  it('never goes past 85 degrees', () => {
    const m = skewBox(f0(), 'n', { x: L.n.x + 1e6, y: L.n.y });
    expect(Math.abs(Math.atan(m[2]) * 180 / Math.PI)).toBeLessThanOrEqual(85.0001);
  });
});

describe('turning', () => {
  it('a dragged turn about the middle is the typed turn, to the last digit', () => {
    const c = L.centre;
    const start = angleFromPivot(f0(), { x: c.x, y: c.y - 50 });
    const m = turnBox(f0(), start, { x: c.x + 50, y: c.y });
    mat(m, turnBoxBy(R, 90)!);
  });

  it('Shift snaps the whole box angle to 15 degrees, even from a crooked start', () => {
    const crooked: Frame = { ...f0(), m: turnBoxBy(R, 7)! };
    const start = angleFromPivot(crooked, { x: 140, y: 0 });
    const c = pivotPoint(crooked);
    const m = turnBox(crooked, start, { x: c.x + 100 * Math.cos(-1.2), y: c.y + 100 * Math.sin(-1.2) }, true);
    const deg = (boxAngle(m) * 180) / Math.PI;
    expect(Math.abs(((deg + 7.5) % 15 + 15) % 15 - 7.5)).toBeLessThan(1e-6);
  });

  it('turns about the pivot, wherever it is', () => {
    const f: Frame = { ...f0(), pivot: L.nw };
    const start = angleFromPivot(f, { x: 200, y: 50 });
    const m = turnBox(f, start, { x: 100, y: 150 });
    near(apply(m, L.nw.x, L.nw.y), L.nw);
    near(apply(m, 200, 50), { x: 100, y: 150 });
  });

  it('puts the turn knob out past the top, and turns with the box', () => {
    const up = rotateKnob(f0(), 1);
    near(up.knob, { x: 140, y: 50 - 28 });
    const spun: Frame = { ...f0(), m: turnBoxBy(R, 90)! };
    const k = rotateKnob(spun, 1);
    near(k.knob, { x: 140 + 20 + 28, y: 70 });
  });
});

describe('moving and the pivot', () => {
  it('moves by an amount and agrees with the typed X and Y', () => {
    const m = moveBox(f0(), 25, -10);
    mat(m, moveBoxTo(R, 125, 40)!);
  });

  it('the pivot clings to handles when close and is free otherwise', () => {
    const f = f0();
    expect(movePivot(f, { x: 103, y: 52 }, 1)).toEqual(L.nw);
    expect(movePivot(f, { x: 140, y: 71 }, 1)).toEqual(L.centre);
    expect(movePivot(f, { x: 120, y: 60 }, 1)).toEqual({ x: 120, y: 60 });
    expect(movePivot(f, { x: 103, y: 52 }, 1, false)).toEqual({ x: 103, y: 52 });
  });

  it('the pivot travels with the box', () => {
    const f: Frame = { ...f0(), m: moveBox(f0(), 10, 10), pivot: L.se };
    near(pivotPoint(f), { x: 190, y: 100 });
  });

  it('arrow keys step one way each', () => {
    expect(arrowStep('ArrowLeft')).toEqual({ dx: -1, dy: 0 });
    expect(arrowStep('ArrowDown')).toEqual({ dx: 0, dy: 1 });
    expect(arrowStep('a')).toBeNull();
  });
});

describe('a box that has already been turned', () => {
  const turned = (): Frame => ({ ...f0(), m: turnBoxBy(R, 30)! });

  it('stretches along its own sides, so the dragged corner still follows the pointer', () => {
    const f = turned();
    const p = place(f, { x: L.se.x + 10, y: L.se.y + 6 });
    // Stretch the original 'se' corner out to where it would be after pulling 10 and 6 along the box's own axes.
    const m = stretchBox(f, 'se', p);
    near(apply(m, L.se.x, L.se.y), p);
    near(apply(m, L.nw.x, L.nw.y), place(f, L.nw));
    // Still no slant: the angle of the box is unchanged.
    expect(boxAngle(m)).toBeCloseTo(boxAngle(f.m), 9);
  });

  it('hits its own corners and inside', () => {
    const f = turned();
    const q = corners(f);
    expect(hitBox(f, q[2].x, q[2].y, 1)).toBe('se');
    expect(hitBox(f, place(f, L.centre).x + 12, place(f, L.centre).y, 1)).toBe('move');
    expect(insideQuad(q, place(f, L.centre))).toBe(true);
    expect(insideQuad(q, { x: 0, y: 0 })).toBe(false);
  });
});

describe('what is under the pointer', () => {
  it('finds the pivot before a handle, then the turn knob, corners, sides, the inside', () => {
    const f = f0();
    expect(hitBox(f, 140, 70, 1)).toBe('pivot');
    expect(hitBox(f, 140, 50 - 28, 1)).toBe('rotate');
    expect(hitBox(f, 100, 50, 1)).toBe('nw');
    expect(hitBox(f, 180, 90, 1)).toBe('se');
    expect(hitBox(f, 140, 50, 1)).toBe('n');
    expect(hitBox(f, 180, 70, 1)).toBe('e');
    expect(hitBox(f, 160, 50, 1)).toBe('n');
    expect(hitBox(f, 120, 80, 1)).toBe('move');
    expect(hitBox(f, 500, 500, 1)).toBeNull();
  });

  it('keeps the middle of a tiny box a middle', () => {
    const tiny = frameOf({ x: 0, y: 0, w: 6, h: 6 });
    const f: Frame = { ...tiny, pivot: { x: 500, y: 500 } };
    expect(hitBox(f, 3, 3, 1)).toBe('move');
  });
});

describe('doing it and undoing it', () => {
  it('a sequence of drags composes into one matrix, and its inverse returns every point exactly', () => {
    let f = f0();
    f = { ...f, m: stretchBox(f, 'se', { x: 230, y: 140 }) };
    f = { ...f, m: turnBox(f, angleFromPivot(f, { x: 200, y: 20 }), { x: 260, y: 60 }) };
    f = { ...f, m: skewBox(f, 'n', { x: 150, y: 20 }) };
    f = { ...f, m: moveBox(f, 12, -9) };
    const inv = inverse(f.m)!;
    for (const p of Object.values(L)) {
      const there = apply(f.m, p.x, p.y);
      near(apply(inv, there.x, there.y), p, 9);
    }
    expect(isIdentity(multiply(inv, f.m))).toBe(true);
  });

  it('letting the pointer wander back puts the box back exactly', () => {
    const away = stretchBox(f0(), 'se', { x: 300, y: 200 });
    expect(isIdentity(away)).toBe(false);
    expect(isIdentity(stretchBox(f0(), 'se', { x: 180, y: 90 }))).toBe(true);
  });

  it('squashed flat has no inverse', () => {
    expect(inverse([0, 0, 0, 0, 5, 5])).toBeNull();
  });
});

describe('reading it back', () => {
  it('says size, turn and slant as a person would', () => {
    const f: Frame = { ...f0(), m: multiply(turnBoxBy(R, 20)!, stretchBox(f0(), 'e', { x: 260, y: 70 })) };
    const r = readout(f);
    expect(r.w).toBeCloseTo(160, 1);
    expect(r.h).toBeCloseTo(40, 1);
    expect(r.turn).toBeCloseTo(20, 1);
    expect(r.slant).toBe(0);
    expect(readout(f0())).toEqual({ w: 80, h: 40, turn: 0, slant: 0 });
  });

  it('moves a matrix onto the art grid of a pixel layer', () => {
    const m = toArt(moveBox(f0(), 16, 32), 8);
    expect(m[4]).toBe(2);
    expect(m[5]).toBe(4);
  });
});
