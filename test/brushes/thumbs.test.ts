// The picker's little pictures: the same brush is only drawn once, and what makes two of them different is what shows.
import { beforeEach, describe, expect, it } from 'vitest';
import { clearThumbs, dabPoints, dabSize, sampleSize, THUMB_CACHE_MAX, thumbBrush, thumbKey } from '../../src/brushes/thumbs';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { defaultTip } from '../../src/geometry/tip';

beforeEach(() => clearThumbs());

describe('the key of a picture', () => {
  const key = (b = DEFAULT_BRUSH, kind: 'dab' | 'stroke' = 'dab', w = 44, h = 30, dpr = 1, colour = '#fff') => thumbKey(b, kind, w, h, dpr, colour);
  it('is the same for the same brush, whatever object it is', () => {
    expect(key({ ...DEFAULT_BRUSH })).toBe(key(DEFAULT_BRUSH));
  });
  it('changes with the tip, the size, the box, the sharpness and the ink', () => {
    const base = key();
    expect(key({ ...DEFAULT_BRUSH, tip: defaultTip('chalk') })).not.toBe(base);
    expect(key({ ...DEFAULT_BRUSH, tip: { ...defaultTip('chalk'), grain: 2 } })).not.toBe(key({ ...DEFAULT_BRUSH, tip: defaultTip('chalk') }));
    expect(key({ ...DEFAULT_BRUSH, size: 9 })).not.toBe(base);
    expect(key(DEFAULT_BRUSH, 'stroke')).not.toBe(base);
    expect(key(DEFAULT_BRUSH, 'dab', 50)).not.toBe(base);
    expect(key(DEFAULT_BRUSH, 'dab', 44, 30, 2)).not.toBe(base);
    expect(key(DEFAULT_BRUSH, 'dab', 44, 30, 1, '#000')).not.toBe(base);
  });
});

describe('what is drawn', () => {
  it('keeps the dab inside its box and shows the whole tip, not a pointy end', () => {
    expect(dabSize(5, 30)).toBe(5);
    expect(dabSize(90, 30)).toBeLessThanOrEqual(30 * 0.6);
    const b = thumbBrush({ ...DEFAULT_BRUSH, size: 40, taperStart: 50, taperEnd: 60 }, 'dab', 30);
    expect(b.taperStart).toBe(0);
    expect(b.taperEnd).toBe(0);
    expect(b.size).toBeLessThanOrEqual(30);
    for (const size of [2, 18, 60]) {
      const pts = dabPoints(44, 30, dabSize(size, 30));
      for (const p of pts) {
        // The whole tip, halo and all, stays in the box.
        expect(p.x - dabSize(size, 30) / 2).toBeGreaterThanOrEqual(-0.01);
        expect(p.x + dabSize(size, 30) / 2).toBeLessThanOrEqual(44.01);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(30);
      }
    }
  });
  it('keeps the long stroke inside the row and its tip', () => {
    expect(sampleSize(120, 30)).toBeLessThanOrEqual(30 * 0.66);
    expect(thumbBrush({ ...DEFAULT_BRUSH, tip: defaultTip('stamp') }, 'stroke', 30).tip?.kind).toBe('stamp');
  });
  it('keeps a bounded number of pictures', () => {
    expect(THUMB_CACHE_MAX).toBeGreaterThanOrEqual(300);
    expect(THUMB_CACHE_MAX).toBeLessThanOrEqual(2000);
  });
});
