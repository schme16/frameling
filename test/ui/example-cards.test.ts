import { describe, expect, it } from 'vitest';
import { fitThumb, tagChips, THUMB_BOX } from '../../src/ui/exampleCards';
import { TEMPLATES } from '../../src/templates';

describe('example card pictures', () => {
  it('fits square, tall and wide pages whole inside the box', () => {
    for (const [w, h] of [[512, 512], [32, 32], [300, 900], [1280, 720]]) {
      const f = fitThumb(w, h);
      expect(f.w).toBeLessThanOrEqual(THUMB_BOX.w);
      expect(f.h).toBeLessThanOrEqual(THUMB_BOX.h);
      expect(Math.abs(f.w / f.h - w / h) / (w / h)).toBeLessThan(0.5);
    }
    expect(fitThumb(512, 512)).toMatchObject({ w: 70, h: 70 });
    expect(fitThumb(1280, 720).w).toBe(124);
    expect(fitThumb(16, 4096)).toMatchObject({ w: 1, h: 70 });
  });
});

describe('example card tags', () => {
  it('shows the first few and counts the rest', () => {
    expect(tagChips(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['a', 'b', 'c'], more: ['d', 'e', 'f'] });
    // One extra is shown rather than "+1".
    expect(tagChips(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b', 'c', 'd'], more: [] });
    expect(tagChips(undefined)).toEqual({ shown: [], more: [] });
    expect(tagChips([' ', 'x '])).toEqual({ shown: ['x'], more: [] });
  });

  it('has tags on the built-in examples that carry them', () => {
    expect(TEMPLATES.some((t) => (t.tags ?? []).length > 0)).toBe(true);
  });
});
