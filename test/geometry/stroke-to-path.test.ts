// A brush stroke turned into a few smooth points: it keeps its look, has far fewer points, and Edit points can take it.
import { describe, expect, it } from 'vitest';
import type { PathShape, Shape, StrokeShape } from '../../src/core/format';
import { shapeBounds, flattenSubPath } from '../../src/canvas/geometry';
import { strokeOutline } from '../../src/core/render';
import { sampleMidpointSpline } from '../../src/export/curve-fit';
import { pointCount, strayFor, strokeToPath, turnStrokes } from '../../src/geometry/strokeToPath';

const brush = { size: 10, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 12, taperEnd: 20, capStart: true, capEnd: true };

/** A wobbly arc of 60 pen points, the sort of line a hand makes. */
function arc(id: string, extra: Partial<StrokeShape> = {}): StrokeShape {
  const points = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    return { x: 20 + t * 160, y: 100 - Math.sin(t * Math.PI) * 60 + Math.sin(i * 1.7) * 0.8, p: 0.3 + 0.7 * Math.sin(t * Math.PI) };
  });
  return { id, type: 'stroke', points, brush, color: '#cc3366', opacity: 0.8, ...extra };
}

const nearOutline = (s: StrokeShape, p: PathShape): number => {
  // What the canvas draws: the smooth curve through the outline, not its corners.
  const out = sampleMidpointSpline(strokeOutline(s), 0.25);
  let worst = 0;
  for (const q of flattenSubPath(p.paths[0])) {
    let best = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q.x - a[0]) * dx + (q.y - a[1]) * dy) / l2));
      best = Math.min(best, Math.hypot(q.x - (a[0] + t * dx), q.y - (a[1] + t * dy)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
};

describe('strayFor', () => {
  it('goes from almost nothing to a third of the brush width, and stays in range', () => {
    expect(strayFor(0, 10)).toBeCloseTo(0.05, 6);
    expect(strayFor(1, 10)).toBeCloseTo(3.5, 6);
    expect(strayFor(0.5, 10)).toBeLessThan(strayFor(0.8, 10));
    expect(strayFor(-4, 10)).toBe(strayFor(0, 10));
    expect(strayFor(9, 10)).toBe(strayFor(1, 10));
    expect(strayFor(NaN, 10)).toBe(strayFor(0, 10));
  });
});

describe('a brush stroke as a curve shape', () => {
  it('keeps what it was: id, lineage, group, colour and see-through', () => {
    const s = arc('a', { origin: 'o', group: 'g' });
    const p = strokeToPath(s, 0.4)!;
    expect(p).toMatchObject({ id: 'a', type: 'path', origin: 'o', group: 'g', fill: '#cc3366', opacity: 0.8, stroke: null });
    expect(p.paths).toHaveLength(1);
    expect(p.paths[0].closed).toBe(true);
  });

  it('has far fewer points than the pen gave, and fewer again the smoother it is', () => {
    const s = arc('a');
    const close = strokeToPath(s, 0)!;
    const easy = strokeToPath(s, 0.5)!;
    const smooth = strokeToPath(s, 1)!;
    expect(pointCount(easy)).toBeLessThan(s.points.length);
    expect(pointCount(smooth)).toBeLessThanOrEqual(pointCount(easy));
    expect(pointCount(easy)).toBeLessThanOrEqual(pointCount(close));
    expect(pointCount(smooth)).toBeGreaterThanOrEqual(3);
  });

  it('stays on the drawn outline, within the Smoothness asked for, and keeps its width and taper', () => {
    const s = arc('a');
    for (const smooth of [0, 0.3, 0.7]) {
      const p = strokeToPath(s, smooth)!;
      // Flattening the curves adds a little of its own, so allow double.
      expect(nearOutline(s, p)).toBeLessThan(strayFor(smooth, s.brush.size) * 2 + 0.3);
    }
    const was = shapeBounds(s);
    const now = shapeBounds(strokeToPath(s, 0.3)!);
    expect(now.w).toBeCloseTo(was.w, 0);
    expect(now.h).toBeCloseTo(was.h, 0);
  });

  it('turns a dot, and gives up on nothing to fit', () => {
    const dot = arc('d', { points: [{ x: 50, y: 50, p: 0.5 }] });
    const p = strokeToPath(dot, 0.4);
    expect(p === null || pointCount(p) >= 2).toBe(true);
    expect(strokeToPath(arc('e', { points: [] }), 0.4)).toBeNull();
  });
});

describe('turnStrokes', () => {
  it('changes only the strokes picked, in place, and says how many', () => {
    const plain: Shape = { id: 'p', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#000', stroke: null, opacity: 1 };
    const shapes: Shape[] = [arc('a'), plain, arc('b')];
    const r = turnStrokes(shapes, new Set(['a', 'p']), 0.4);
    expect(r.changed).toBe(1);
    expect(r.shapes.map((s) => s.type)).toEqual(['path', 'path', 'stroke']);
    expect(r.shapes[1]).toBe(plain);
    expect(r.shapes[2]).toBe(shapes[2]);
    expect(r.shapes.map((s) => s.id)).toEqual(['a', 'p', 'b']);
  });

  it('is nothing when no stroke is picked', () => {
    const shapes: Shape[] = [arc('a')];
    const r = turnStrokes(shapes, new Set(), 0.4);
    expect(r.changed).toBe(0);
    expect(r.shapes[0]).toBe(shapes[0]);
  });
});

describe('in the drawing', () => {
  const setup = async () => {
    const { resetStore, store } = await import('../../src/core/store');
    const { newDoc } = await import('../../src/core/doc');
    await import('../../src/core/commands');
    await import('../../src/tools');
    const { addShapes, shapesNow } = await import('../tools/helpers');
    resetStore(newDoc({ width: 400, height: 300 }));
    addShapes(arc('a'), arc('b', { points: arc('b').points.map((p) => ({ ...p, y: p.y + 100 })) }));
    return { store, shapesNow };
  };

  it('is one undo step, and Undo brings the brush line back exactly', async () => {
    const { store, shapesNow } = await setup();
    const { editShapes } = await import('../../src/tools/merge-mode');
    const was = shapesNow();
    const r = editShapes('Turn into an editable line', (shapes) => {
      const out = turnStrokes(shapes, new Set(['a']), 0.4);
      return out.changed ? out.shapes : null;
    });
    expect(r).toBe('ok');
    expect(shapesNow().map((s) => s.type)).toEqual(['path', 'stroke']);
    store().undo();
    expect(shapesNow()).toEqual(was);
  });

  it('Edit points on a brush line selects it and offers to turn it into one; a turned line is then picked up by Edit points', async () => {
    const { store } = await setup();
    const { pointsTool, resetPointsTool, pointsTarget } = await import('../../src/tools/points');
    const { toasts } = await import('../../src/ui/toast');
    const { ctx, ptr } = await import('../tools/helpers');
    resetPointsTool();
    toasts.set([]);
    const mid = arc('a').points[30];
    pointsTool.down!(ptr(mid.x, mid.y), ctx());
    pointsTool.up?.(ptr(mid.x, mid.y), ctx());
    expect(store().get().ui.selection).toEqual(['a']);
    const t = toasts.get().find((x) => /Brush lines are made of many tiny points/.test(x.message));
    expect(t?.action?.label).toBe('Turn into an editable line');
    expect(pointsTarget()).toBeNull();

    const { editShapes } = await import('../../src/tools/merge-mode');
    editShapes('turn', (shapes) => turnStrokes(shapes, new Set(['a']), 0.4).shapes);
    resetPointsTool();
    pointsTool.down!(ptr(mid.x, mid.y), ctx());
    pointsTool.up?.(ptr(mid.x, mid.y), ctx());
    expect(pointsTarget()?.id).toBe('a');
  });
});
