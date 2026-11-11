import { describe, expect, it } from 'vitest';
import { sliderValueAt } from '../../src/canvas/controls';

const base = { left: 0, width: 100, min: 0, max: 100, step: 1, fine: null, coarse: false };

describe('slider modifiers', () => {
  it('lands where the pointer is, on whole steps', () => {
    expect(sliderValueAt({ ...base, x: 42.4 })).toBe(42);
  });
  it('Shift snaps to ten steps', () => {
    expect(sliderValueAt({ ...base, x: 46, coarse: true })).toBe(50);
  });
  it('Alt or Ctrl moves ten times slower from where it started, in tenth steps', () => {
    expect(sliderValueAt({ ...base, x: 60, fine: { x: 50, value: 30 } })).toBe(31);
    expect(sliderValueAt({ ...base, x: 53, fine: { x: 50, value: 30 } })).toBeCloseTo(30.3);
  });
  it('never leaves the range', () => {
    expect(sliderValueAt({ ...base, x: 500 })).toBe(100);
    expect(sliderValueAt({ ...base, x: -20, coarse: true })).toBe(0);
  });
});
