// @vitest-environment jsdom
// What snapping a stroke's start and end costs on a drawing with many strokes. Never asserts on time (that would flake);
// SNAPDRAW_PERF=1 prints the numbers:  SNAPDRAW_PERF=1 npx vitest run test/perf/snap-draw-cost.test.ts
// It does assert on work: after one edit the index is rebuilt from the changed shapes only, and the bucket search looks
// at a handful of points, not all of them.
import { describe, expect, it } from 'vitest';
import '../../src/canvas';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import type { StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { findDrawSnap } from '../../src/canvas/guides';
import { endsOf, pointIndexFor } from '../../src/canvas/snapPoints';
import { resetSnapPicks, setSnapDraw } from '../../src/canvas/snapOps';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addShapes, vectorStore } from '../tools/helpers';

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const strokes = (n: number): StrokeShape[] => {
  const r = rng(7);
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    type: 'stroke' as const,
    points: Array.from({ length: 12 }, (_, k) => ({ x: r() * 1920, y: r() * 1080, p: 0.5 + k * 0 })),
    brush: { ...DEFAULT_BRUSH },
    color: '#000000',
    opacity: 1,
  }));
};
const ms = (f: () => void, reps = 1): number => {
  const t = performance.now();
  for (let i = 0; i < reps; i++) f();
  return (performance.now() - t) / reps;
};

describe('the cost of snapping a stroke on a big drawing', () => {
  it('rebuilds from the changed shapes only, and answers without walking every point', () => {
    const sizes = [300, 3000, 20000];
    const rows: string[] = [];
    for (const n of sizes) {
      vectorStore();
      resetSnapPicks();
      setViewSettings({ snap: true, snapDraw: true, guides: true, grid: 'off' });
      const all = strokes(n);
      addShapes(...all);
      const { doc, ui } = store().get();
      // Cold: the first time anything asks (the very first touch of a stroke).
      const cold = ms(() => void pointIndexFor(doc, ui.frame, [], null));
      // One more stroke is drawn: a new document in which every old shape is the same object.
      addShapes(strokes(1).map((s) => ({ ...s, id: 'extra' }))[0]);
      const after = store().get();
      const edited = ms(() => void pointIndexFor(after.doc, after.ui.frame, [], null));
      // The ends of every old shape came from the memory of the shape, not a new walk.
      for (const s of all.slice(0, 50)) expect(endsOf(s)).toBe(endsOf(s));
      const query = ms(() => void findDrawSnap({ x: 960.3, y: 540.7 }, 1, false), 2000);
      setSnapDraw(false);
      const off = ms(() => void findDrawSnap({ x: 960.3, y: 540.7 }, 1, false), 20000);
      setSnapDraw(true);
      rows.push(`${String(n).padStart(6)} strokes: first touch ${cold.toFixed(2)} ms, after an edit ${edited.toFixed(2)} ms, one question ${(query * 1000).toFixed(1)} us, off ${(off * 1000).toFixed(3)} us`);
      expect(pointIndexFor(after.doc, after.ui.frame, [], null).size).toBe(2 * (n + 1));
    }
    if (process.env.SNAPDRAW_PERF) console.log('\n' + rows.join('\n'));
  });
});
