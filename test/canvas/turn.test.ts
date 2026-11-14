import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_TURN,
  boxOffset,
  describeTurn,
  flipped,
  getTurn,
  isTurned,
  resetTurn,
  setTurn,
  snapAngle,
  subscribeTurn,
  turnAngleFor,
  turnBox,
  turnCss,
  turnedBy,
  turnedSize,
  turnVector,
  unturnVector,
  windowToBox,
} from '../../src/canvas/turn';
import { fitView } from '../../src/canvas/view';

beforeEach(() => resetTurn());

describe('angles', () => {
  it('snap to 15 degree steps and wrap into 0..359', () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(8)).toBe(15);
    expect(snapAngle(-15)).toBe(345);
    expect(snapAngle(375)).toBe(15);
    expect(snapAngle(Number.NaN)).toBe(0);
  });

  it('turn by steps in either direction', () => {
    expect(turnedBy(NO_TURN, 1).angle).toBe(15);
    expect(turnedBy(NO_TURN, -1).angle).toBe(345);
    expect(turnedBy({ angle: 345, flip: true }, 2)).toEqual({ angle: 15, flip: true });
  });

  it('a drag takes the short way round the 180 mark', () => {
    expect(turnAngleFor(170, -170)).toBe(20);
    expect(turnAngleFor(-170, 170)).toBe(-20);
    expect(turnAngleFor(10, 40)).toBe(30);
  });
});

describe('what counts as turned', () => {
  it('straight and unflipped is not turned', () => {
    expect(isTurned(NO_TURN)).toBe(false);
    expect(isTurned({ angle: 0, flip: true })).toBe(true);
    expect(isTurned({ angle: 90, flip: false })).toBe(true);
  });

  it('says what the view is doing in plain words', () => {
    expect(describeTurn({ angle: 30, flip: false })).toBe('turned 30 degrees');
    expect(describeTurn({ angle: 0, flip: true })).toBe('flipped');
    expect(describeTurn({ angle: 45, flip: true })).toBe('flipped and turned 45 degrees');
  });

  it('writes the CSS the box is turned with, flip after the turn', () => {
    expect(turnCss(NO_TURN)).toBe('');
    expect(turnCss({ angle: 30, flip: false })).toBe('rotate(30deg)');
    expect(turnCss({ angle: 30, flip: true })).toBe('scaleX(-1) rotate(30deg)');
  });
});

describe('the box the layers need', () => {
  it('is the window itself when straight, flipped or upside down', () => {
    expect(turnBox(800, 600, NO_TURN)).toEqual({ w: 800, h: 600 });
    expect(turnBox(800, 600, { angle: 0, flip: true })).toEqual({ w: 800, h: 600 });
    expect(turnBox(800, 600, { angle: 180, flip: false })).toEqual({ w: 800, h: 600 });
  });

  it('swaps for a quarter turn', () => {
    expect(turnBox(800, 600, { angle: 90, flip: false })).toEqual({ w: 800, h: 800 });
    expect(turnBox(600, 800, { angle: 270, flip: false })).toEqual({ w: 800, h: 800 });
  });

  it('covers the window turned back, at any angle', () => {
    const w = 800;
    const h = 600;
    for (const angle of [15, 30, 45, 75, 105, 200]) {
      const t = { angle, flip: false };
      const b = turnBox(w, h, t);
      // The window's four corners, taken back into the box's frame, must land inside the box.
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const p = windowToBox(t, w, h, x, y);
        expect(p.x).toBeGreaterThanOrEqual(-0.5);
        expect(p.y).toBeGreaterThanOrEqual(-0.5);
        expect(p.x).toBeLessThanOrEqual(b.w + 0.5);
        expect(p.y).toBeLessThanOrEqual(b.h + 0.5);
      }
    }
  });

  it('sticks out evenly either side of the window', () => {
    const o = boxOffset(800, 600, { angle: 90, flip: false });
    expect(o).toEqual({ x: 0, y: 100 });
  });
});

describe('pointer positions', () => {
  it('are untouched when straight', () => {
    expect(windowToBox(NO_TURN, 800, 600, 123, 456)).toEqual({ x: 123, y: 456 });
  });

  it('the middle of the window is the middle of the box, whatever the turn', () => {
    for (const t of [{ angle: 30, flip: false }, { angle: 90, flip: true }, { angle: 0, flip: true }]) {
      const b = turnBox(800, 600, t);
      const p = windowToBox(t, 800, 600, 400, 300);
      expect(p.x).toBeCloseTo(b.w / 2);
      expect(p.y).toBeCloseTo(b.h / 2);
    }
  });

  it('a flipped view mirrors left and right', () => {
    const p = windowToBox({ angle: 0, flip: true }, 800, 600, 100, 50);
    expect(p).toEqual({ x: 700, y: 50 });
  });

  it('a quarter turn clockwise: a point on the right of the screen was at the bottom of the page', () => {
    // After turning clockwise, what was at the box's bottom is on the screen's left; the screen's right is the box's top.
    const p = unturnVector({ angle: 90, flip: false }, 100, 0);
    expect(p).toEqual({ x: 0, y: -100 });
    const q = unturnVector({ angle: 90, flip: false }, 0, 100);
    expect(q).toEqual({ x: 100, y: 0 });
  });

  it('turn and unturn are inverses, for every angle and both flips', () => {
    for (let angle = 0; angle < 360; angle += 15) {
      for (const flip of [false, true]) {
        const t = { angle, flip };
        const v = turnVector(t, 37, -91);
        const back = unturnVector(t, v.x, v.y);
        expect(back.x).toBeCloseTo(37, 6);
        expect(back.y).toBeCloseTo(-91, 6);
      }
    }
  });

  it('a movement keeps its length however the view is turned', () => {
    const v = unturnVector({ angle: 45, flip: true }, 30, 40);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(50, 6);
  });
});

describe('fitting a turned page', () => {
  it('leaves room for the page after the turn', () => {
    const straight = fitView(1000, 700, 400, 400, 0);
    const turned = fitView(1000, 700, 400, 400, 0, false, { w: 1000, h: 700, angle: 45 });
    // A square page turned 45 degrees is about 1.41 times as wide as it was: the zoom must fall to match.
    expect(turned.zoom).toBeLessThan(straight.zoom);
    const t = turnedSize(400, 400, 45);
    expect(t.w * turned.zoom).toBeLessThanOrEqual(700 + 1e-6);
  });

  it('is the plain fit when straight', () => {
    expect(fitView(1000, 700, 400, 300, 48, false, { w: 1000, h: 700, angle: 0 })).toEqual(fitView(1000, 700, 400, 300, 48));
  });

  it('centres the page in the box, which is centred on the window', () => {
    const b = turnBox(1000, 700, { angle: 30, flip: false });
    const v = fitView(b.w, b.h, 400, 300, 48, false, { w: 1000, h: 700, angle: 30 });
    expect(v.panX + 200 * v.zoom).toBeCloseTo(b.w / 2);
    expect(v.panY + 150 * v.zoom).toBeCloseTo(b.h / 2);
  });
});

describe('the session turn', () => {
  it('starts straight, keeps what it is given, and tells listeners', () => {
    let calls = 0;
    const off = subscribeTurn(() => calls++);
    expect(getTurn()).toEqual(NO_TURN);
    setTurn({ angle: 22, flip: true });
    expect(getTurn()).toEqual({ angle: 15, flip: true });
    setTurn({ angle: 15, flip: true });
    expect(calls).toBe(1);
    setTurn(flipped(getTurn()));
    expect(getTurn().flip).toBe(false);
    resetTurn();
    expect(getTurn()).toEqual(NO_TURN);
    off();
    setTurn({ angle: 90, flip: false });
    expect(calls).toBe(3);
  });
});
