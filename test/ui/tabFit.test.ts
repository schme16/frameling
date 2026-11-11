import { describe, expect, it } from 'vitest';
import { fitTabs } from '../../src/ui/tabFit';

const base = { gap: 2, full: [100, 80, 70, 90], icon: [30, 30, 30, 30], more: 40 };

describe('fitTabs', () => {
  it('shows every name when there is room', () => {
    expect(fitTabs({ ...base, avail: 400, active: 0 })).toEqual({ mode: 'full', shown: [0, 1, 2, 3], hidden: [] });
  });
  it('shrinks the other tabs to icons first', () => {
    // 100 + 3 * 30 + 3 gaps = 196
    expect(fitTabs({ ...base, avail: 200, active: 0 })).toEqual({ mode: 'compact', shown: [0, 1, 2, 3], hidden: [] });
  });
  it('puts what still does not fit behind the +N button, keeping the open tab', () => {
    const f = fitTabs({ ...base, avail: 150, active: 3 });
    expect(f.mode).toBe('overflow');
    expect(f.shown).toContain(3);
    expect(f.hidden.length).toBeGreaterThan(0);
    expect([...f.shown, ...f.hidden].sort()).toEqual([0, 1, 2, 3]);
  });
  it('keeps the tabs nearest the open one', () => {
    const f = fitTabs({ ...base, avail: 90 + 2 + 30 + 2 + 40, active: 3 });
    expect(f.shown).toEqual([2, 3]);
    expect(f.hidden).toEqual([0, 1]);
  });
});
