// The canvas has to hear about a change of pixel ratio (a window dragged to a screen at another scale keeps its size, so
// no resize comes with it).
import { describe, expect, it } from 'vitest';
import { watchPixelRatio, type PixelRatioHost } from '../../src/canvas/pixelRatio';

/** A host whose ratio can be moved, with media queries that report like the real ones: a change event when they stop matching. */
function host(ratio: number) {
  const h = {
    ratio,
    queries: [] as { q: string; fns: Set<() => void> }[],
    get devicePixelRatio() {
      return h.ratio;
    },
    matchMedia(q: string) {
      const rec = { q, fns: new Set<() => void>() };
      h.queries.push(rec);
      return {
        addEventListener: (_t: 'change', fn: () => void) => void rec.fns.add(fn),
        removeEventListener: (_t: 'change', fn: () => void) => void rec.fns.delete(fn),
      };
    },
    /** Moves the ratio and tells every query that was about the old one. */
    move(to: number) {
      const old = `(resolution: ${h.ratio}dppx)`;
      h.ratio = to;
      for (const r of [...h.queries]) if (r.q === old) for (const f of [...r.fns]) f();
    },
    live: () => h.queries.reduce((n, r) => n + r.fns.size, 0),
  };
  return h;
}

describe('watchPixelRatio', () => {
  it('calls back on a change, and again on the next one (the query is set again for the new ratio)', () => {
    const h = host(1);
    let n = 0;
    watchPixelRatio(() => n++, h as unknown as PixelRatioHost);
    h.move(2);
    expect(n).toBe(1);
    h.move(1.5);
    expect(n).toBe(2);
    h.move(1);
    expect(n).toBe(3);
  });
  it('asks about the current ratio', () => {
    const h = host(2);
    watchPixelRatio(() => undefined, h as unknown as PixelRatioHost);
    expect(h.queries[0].q).toBe('(resolution: 2dppx)');
    h.move(1.25);
    expect(h.queries.at(-1)!.q).toBe('(resolution: 1.25dppx)');
  });
  it('leaves nothing listening once stopped, and says nothing after', () => {
    const h = host(1);
    let n = 0;
    const stop = watchPixelRatio(() => n++, h as unknown as PixelRatioHost);
    h.move(2);
    expect(h.live()).toBe(1);
    stop();
    expect(h.live()).toBe(0);
    h.move(1);
    expect(n).toBe(1);
  });
});
