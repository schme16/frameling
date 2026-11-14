import { describe, expect, it } from 'vitest';
import { fittedSize, MAX_SHARE } from '../../src/timeline/fitHeight';
import { MAX_SIZE, MIN_SIZE } from '../../src/ui/dockModel';

describe('Timeline height for its layers', () => {
  it('grows by what is cut off', () => {
    expect(fittedSize(260, 150, 1000)).toBe(410);
  });
  it('stays put when nothing is cut off', () => {
    expect(fittedSize(260, 0, 1000)).toBe(260);
    expect(fittedSize(260, -5, 1000)).toBe(260);
    expect(fittedSize(260, Number.NaN, 1000)).toBe(260);
  });
  it('never takes more than half of the window', () => {
    expect(fittedSize(260, 900, 1000)).toBe(1000 * MAX_SHARE);
    expect(fittedSize(260, 900, 700)).toBe(350);
  });
  it('never takes more than the zone allows, or less than it has', () => {
    expect(fittedSize(260, 5000, 4000)).toBe(MAX_SIZE.bottom);
    expect(fittedSize(480, 300, 600)).toBe(480);
    expect(fittedSize(300, 100, 100)).toBe(300);
    expect(MIN_SIZE.bottom).toBeLessThan(MAX_SIZE.bottom);
  });
  it('rounds up to whole pixels', () => {
    expect(fittedSize(260, 10.2, 1000)).toBe(271);
  });
});
