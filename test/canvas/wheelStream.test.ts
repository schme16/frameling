import { describe, expect, it } from 'vitest';
import { MAX_WHEEL_EVENT_FACTOR, wheelPixels, wheelZoomFactor } from '../../src/canvas/view';
import { WheelStream, ZOOM_SPEED_SCALE, isWhole } from '../../src/canvas/wheelStream';
import type { ZoomStep } from '../../src/canvas/input';

const pct = (f: number) => Math.round((f - 1) * 100);

describe('one wheel event', () => {
  // The table from the zoom-wheel-too-fast card: what one click does, whatever reports it.
  const table: [string, number, number, number, ZoomStep, number][] = [
    // name, deltaY, deltaMode, dpr, step, expected percent
    ['an ordinary click', -100, 0, 1, 'normal', 25],
    ['an ordinary click, coarse', -100, 0, 1, 'coarse', 62],
    ['an ordinary click, fine', -100, 0, 1, 'fine', 9],
    ['a click multiplied by 1.75 scaling, divided back out', -175, 0, 1.75, 'normal', 25],
    ['the same with the coarse step', -175, 0, 1.75, 'coarse', 62],
    ['a click at 2x scaling', -200, 0, 2, 'normal', 25],
    ['a click at 1.25x scaling', -125, 0, 1.25, 'normal', 25],
    ['three lines', -3, 1, 1, 'normal', 11],
    ['a whole page, clamped', -1, 2, 1, 'normal', 80],
    ['a huge delta, clamped', -5000, 0, 1, 'normal', 80],
    ['a zoom out click', 100, 0, 1, 'normal', -20],
  ];
  for (const [name, dy, mode, dpr, step, want] of table) {
    it(`${name}: ${want > 0 ? '+' : ''}${want}%`, () => {
      expect(pct(wheelZoomFactor(dy, mode, step, 'wheel', dpr))).toBe(want);
    });
  }

  it('never changes the zoom by more than the clamp, in or out', () => {
    for (const dy of [-1e6, -400, 400, 1e6]) {
      const f = wheelZoomFactor(dy, 0);
      expect(f).toBeLessThanOrEqual(MAX_WHEEL_EVENT_FACTOR);
      expect(f).toBeGreaterThanOrEqual(1 / MAX_WHEEL_EVENT_FACTOR);
    }
  });

  it('divides only pixels by the scaling', () => {
    expect(wheelPixels(100, 0, 2)).toBe(50);
    expect(wheelPixels(3, 1, 2)).toBe(48);
    expect(wheelPixels(1, 2, 2)).toBe(400);
    expect(wheelPixels(100, 0, 0)).toBe(100);
  });

  it('the speed preference scales the step', () => {
    const slow = pct(wheelZoomFactor(-100, 0, 'normal', 'wheel', 1, ZOOM_SPEED_SCALE.slow));
    const fast = pct(wheelZoomFactor(-100, 0, 'normal', 'wheel', 1, ZOOM_SPEED_SCALE.fast));
    expect(slow).toBe(14);
    expect(fast).toBe(42);
  });
});

describe('telling a wheel from a pinch by the run of events', () => {
  it('a high-resolution wheel (small whole numbers) is a wheel and adds up to one notch', () => {
    const s = new WheelStream();
    let total = 1;
    // 100 pixels sent as 8 events of 12.5... whole numbers: 12 x 8 = 96 pixels, 8ms apart, even with Ctrl held.
    for (let i = 0; i < 8; i++) {
      const r = s.read({ deltaY: -12, deltaMode: 0, ctrlKey: true }, i * 8);
      expect(r.kind).toBe('wheel');
      total *= r.factor;
    }
    expect(pct(total)).toBeGreaterThanOrEqual(22);
    expect(pct(total)).toBeLessThanOrEqual(25);
  });

  it('the same wheel on a scaled screen is still a wheel', () => {
    const s = new WheelStream();
    // 1.75 scaling: 53 pixels reaches us as 92.75, which is whole once divided back down.
    const r = s.read({ deltaY: -92.75, deltaMode: 0, ctrlKey: true }, 0, { dpr: 1.75 });
    expect(r.kind).toBe('wheel');
    // And 12 pixels as 21: whole as sent.
    expect(s.read({ deltaY: -21, deltaMode: 0, ctrlKey: true }, 8, { dpr: 1.75 }).kind).toBe('wheel');
  });

  it('a trackpad pinch (Ctrl with fractional deltas) is a pinch, and zooms by its own bigger rate', () => {
    const s = new WheelStream();
    const r = s.read({ deltaY: -2.37, deltaMode: 0, ctrlKey: true }, 0);
    expect(r.kind).toBe('pinch');
    expect(r.factor).toBeCloseTo(Math.exp(2.37 * 0.01), 6);
    // Whole numbers in the middle of the same pinch stay part of it.
    expect(s.read({ deltaY: -3, deltaMode: 0, ctrlKey: true }, 16).kind).toBe('pinch');
  });

  it('fractional deltas without Ctrl are never a pinch', () => {
    const s = new WheelStream();
    expect(s.read({ deltaY: -2.37, deltaMode: 0, ctrlKey: false }, 0).kind).toBe('wheel');
  });

  it('a pinch is forgotten once the stream stops', () => {
    const s = new WheelStream();
    s.read({ deltaY: -2.37, deltaMode: 0, ctrlKey: true }, 0);
    expect(s.read({ deltaY: -100, deltaMode: 0, ctrlKey: true }, 1000).kind).toBe('wheel');
  });

  it('counts the burst', () => {
    const s = new WheelStream();
    expect(s.read({ deltaY: -12, deltaMode: 0, ctrlKey: false }, 0).burst).toBe(1);
    expect(s.read({ deltaY: -12, deltaMode: 0, ctrlKey: false }, 10).burst).toBe(2);
    expect(s.read({ deltaY: -12, deltaMode: 0, ctrlKey: false }, 600).burst).toBe(1);
  });

  it('knows a whole number', () => {
    expect(isWhole(12)).toBe(true);
    expect(isWhole(12.004)).toBe(true);
    expect(isWhole(2.37)).toBe(false);
  });
});
