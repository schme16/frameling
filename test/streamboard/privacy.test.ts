// Is the board private? One answer decides it, the one already asked ("What can your viewers see?"), plus one switch for a
// board shown on stream on purpose. Nobody is asked twice.
import { describe, expect, it } from 'vitest';
import { boardCovers, privacyLine, privacyOf } from '../../src/streamboard/privacy';

const f = (answer: string | undefined, over: { onStream?: boolean; apart?: boolean } = {}) => ({ answer, onStream: over.onStream ?? false, apart: over.apart ?? false });

describe('the board follows the answer to "What can your viewers see?"', () => {
  it('only the capture window: private, wherever the board sits', () => {
    expect(privacyOf(f('capture'))).toEqual({ private: true, why: 'capture' });
    expect(privacyOf(f('capture', { apart: true })).private).toBe(true);
  });
  it('one screen: private only on a different screen from the drawing window', () => {
    expect(privacyOf(f('display', { apart: true }))).toEqual({ private: true, why: 'apart' });
    expect(privacyOf(f('display', { apart: false }))).toEqual({ private: false, why: 'same-screen' });
  });
  it('everything, not sure, or never answered: covered, even on another screen', () => {
    for (const a of ['screen', undefined, 'something odd']) {
      expect(privacyOf(f(a, { apart: true }))).toEqual({ private: false, why: 'everything' });
      expect(boardCovers(f(a))).toBe(true);
    }
  });
  it('a board put on stream on purpose is never private, whatever the answer was', () => {
    for (const a of ['capture', 'display', 'screen']) expect(privacyOf(f(a, { onStream: true, apart: true }))).toEqual({ private: false, why: 'onstream' });
  });
  it('has a plain line for every case, with no dash', () => {
    for (const why of ['capture', 'apart', 'onstream', 'same-screen', 'everything'] as const) {
      const line = privacyLine({ private: why === 'capture' || why === 'apart', why });
      expect(line.length).toBeGreaterThan(20);
      expect(line).not.toMatch(/[–—]/);
    }
  });
});
