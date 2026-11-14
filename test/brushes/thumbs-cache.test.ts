// @vitest-environment jsdom
// The picture cache: a brush seen again is copied, not drawn again, and the cache never grows past its limit.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { drawShape } from '../../src/core/render';
import { clearThumbs, THUMB_CACHE_MAX, thumbFor, thumbsDrawn, thumbsKept } from '../../src/brushes/thumbs';
import { defaultTip } from '../../src/geometry/tip';

vi.mock('../../src/core/render', () => ({ drawShape: vi.fn() }));

beforeEach(() => {
  clearThumbs();
  vi.mocked(drawShape).mockClear();
  // jsdom has no canvas: a stand-in that accepts the one call the cache makes.
  HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {} })) as unknown as HTMLCanvasElement['getContext'];
});

describe('thumbFor', () => {
  it('draws a brush once and then hands back the same picture', () => {
    const a = thumbFor(DEFAULT_BRUSH, 'dab', 44, 30, 1, '#fff');
    const b = thumbFor({ ...DEFAULT_BRUSH }, 'dab', 44, 30, 1, '#fff');
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(drawShape).toHaveBeenCalledTimes(1);
  });
  it('draws again for another tip, ink or sharpness, and the real tip reaches the renderer', () => {
    thumbFor(DEFAULT_BRUSH, 'dab', 44, 30, 1, '#fff');
    thumbFor({ ...DEFAULT_BRUSH, tip: defaultTip('chalk') }, 'dab', 44, 30, 1, '#fff');
    thumbFor(DEFAULT_BRUSH, 'dab', 44, 30, 1, '#000');
    thumbFor(DEFAULT_BRUSH, 'dab', 44, 30, 2, '#fff');
    expect(drawShape).toHaveBeenCalledTimes(4);
    const shape = vi.mocked(drawShape).mock.calls[1][1] as { brush: { tip?: { kind: string } } };
    expect(shape.brush.tip?.kind).toBe('chalk');
  });
  it('keeps the picture it was asked for last, and drops the oldest when it is full', () => {
    const first = thumbFor({ ...DEFAULT_BRUSH, size: 1 }, 'dab', 44, 30, 1, '#fff');
    for (let i = 0; i < THUMB_CACHE_MAX + 20; i++) {
      thumbFor({ ...DEFAULT_BRUSH, size: 2 + i }, 'dab', 44, 30, 1, '#fff');
      if (i % 50 === 0) thumbFor({ ...DEFAULT_BRUSH, size: 1 }, 'dab', 44, 30, 1, '#fff');
    }
    expect(thumbsKept()).toBeLessThanOrEqual(THUMB_CACHE_MAX);
    const before = thumbsDrawn();
    expect(thumbFor({ ...DEFAULT_BRUSH, size: 1 }, 'dab', 44, 30, 1, '#fff')).toBe(first);
    expect(thumbsDrawn()).toBe(before);
  });
  it('gives nothing for a box with no size', () => {
    expect(thumbFor(DEFAULT_BRUSH, 'dab', 0, 30, 1, '#fff')).toBeNull();
  });
});
