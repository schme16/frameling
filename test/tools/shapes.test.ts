import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { shapeBounds } from '../../src/canvas/geometry';
import { dragLine, dragRect, ellipseSubPath, ellipseTool, lineTool, makeShape, rectSubPath, rectTool } from '../../src/tools/shapes';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { ctx, drag, pixelStore, shapesNow, vectorStore } from './helpers';

beforeEach(() => setToolSettings({ ...DEFAULT_TOOL_SETTINGS }));

describe('drag maths', () => {
  const a = { x: 100, y: 100 };

  it('makes a box from any direction', () => {
    expect(dragRect(a, { x: 60, y: 140 }, false, false)).toEqual({ x: 60, y: 100, w: 40, h: 40 });
    expect(dragRect(a, { x: 160, y: 130 }, false, false)).toEqual({ x: 100, y: 100, w: 60, h: 30 });
  });

  it('keeps it square with Shift, in the direction of the drag', () => {
    expect(dragRect(a, { x: 160, y: 130 }, true, false)).toEqual({ x: 100, y: 100, w: 60, h: 60 });
    expect(dragRect(a, { x: 70, y: 150 }, true, false)).toEqual({ x: 50, y: 100, w: 50, h: 50 });
  });

  it('grows from the middle with Alt', () => {
    expect(dragRect(a, { x: 130, y: 120 }, false, true)).toEqual({ x: 70, y: 80, w: 60, h: 40 });
    expect(dragRect(a, { x: 130, y: 120 }, true, true)).toEqual({ x: 70, y: 70, w: 60, h: 60 });
  });

  it('snaps lines to 45 degrees with Shift and keeps their length', () => {
    const [p, q] = dragLine(a, { x: 200, y: 112 }, true, false);
    expect(p).toEqual(a);
    expect(q.y).toBeCloseTo(100);
    expect(q.x).toBeCloseTo(100 + Math.hypot(100, 12));
    const [, d] = dragLine(a, { x: 150, y: 140 }, true, false);
    expect(d.x - 100).toBeCloseTo(d.y - 100);
  });

  it('draws lines from the middle with Alt', () => {
    const [p, q] = dragLine(a, { x: 130, y: 100 }, false, true);
    expect(p).toEqual({ x: 70, y: 100 });
    expect(q).toEqual({ x: 130, y: 100 });
  });
});

describe('outlines', () => {
  it('draws an ellipse with four bezier curves that reach its edges', () => {
    const sp = ellipseSubPath({ x: 0, y: 0, w: 100, h: 60 });
    expect(sp.closed).toBe(true);
    expect(sp.points).toHaveLength(4);
    expect(sp.points.every((p) => p.c1 && p.c2)).toBe(true);
    expect(sp.points.map((p) => [p.x, p.y])).toEqual([[100, 30], [50, 60], [0, 30], [50, 0]]);
  });

  it('rounds the corners of a rectangle with curves, and clamps the radius', () => {
    expect(rectSubPath({ x: 0, y: 0, w: 10, h: 10 }, 0).points).toHaveLength(4);
    const round = rectSubPath({ x: 0, y: 0, w: 100, h: 40 }, 500);
    expect(round.points).toHaveLength(8);
    const xs = round.points.map((p) => p.x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(100);
    // The radius can't be more than half the short side.
    expect(round.points[0].x).toBe(20);
  });
});

describe('shape tools', () => {
  it('draws a rectangle as one PathShape with fill and outline', () => {
    const s = vectorStore();
    s.setUi({ color: '#5ab8ff', fillColor: '#ffc94a', strokeOn: true });
    drag(rectTool, ctx(), [[50, 50], [120, 90]]);
    const shape = shapesNow()[0] as PathShape;
    expect(shape.type).toBe('path');
    expect(shape.fill).toBe('#ffc94a');
    expect(shape.stroke).toMatchObject({ color: '#5ab8ff', width: DEFAULT_TOOL_SETTINGS.shapeStroke });
    expect(shapeBounds({ ...shape, stroke: null })).toEqual({ x: 50, y: 50, w: 70, h: 40 });
    expect(s.undoLabel()).toBe('Draw rectangle');
  });

  it('uses the fill and stroke boxes, either of which can be none (as in Illustrator)', () => {
    const s = vectorStore();
    s.setUi({ color: '#ff0000', fillColor: null, strokeOn: true });
    drag(rectTool, ctx(), [[0, 0], [50, 50]]);
    s.setUi({ fillColor: '#00ff00', strokeOn: false });
    drag(rectTool, ctx(), [[0, 0], [50, 50]]);
    s.setUi({ fillColor: '#00ff00', strokeOn: true });
    drag(rectTool, ctx(), [[0, 0], [50, 50]]);
    const [o, f, b] = shapesNow() as PathShape[];
    expect([o.fill, !!o.stroke]).toEqual([null, true]);
    expect([f.fill, f.stroke]).toEqual(['#00ff00', null]);
    expect([b.fill, b.stroke?.color]).toEqual(['#00ff00', '#ff0000']);
  });

  it('refuses when both boxes are none, with a reason', () => {
    const s = vectorStore();
    s.setUi({ fillColor: null, strokeOn: false });
    const c = ctx();
    drag(rectTool, c, [[0, 0], [50, 50]]);
    expect(shapesNow()).toHaveLength(0);
    expect(c.hint).toHaveBeenCalledWith(expect.stringContaining('none'));
  });

  it('draws an ellipse and a line', () => {
    vectorStore();
    drag(ellipseTool, ctx(), [[10, 10], [110, 70]]);
    drag(lineTool, ctx(), [[0, 0], [100, 0]]);
    const [e, l] = shapesNow() as PathShape[];
    expect(e.paths[0].points.every((p) => p.c1)).toBe(true);
    expect(l.fill).toBeNull();
    expect(l.paths[0].closed).toBe(false);
    expect(l.paths[0].points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('makes nothing from a click, and refuses on a pixel layer with a reason', () => {
    vectorStore();
    drag(rectTool, ctx(), [[10, 10], [10, 10]]);
    expect(shapesNow()).toHaveLength(0);
    expect(makeShape('line', { x: 0, y: 0 }, { x: 0.2, y: 0.2 }, { shift: false, alt: false }, { fill: null, stroke: '#000', line: '#000' }, DEFAULT_TOOL_SETTINGS)).toBeNull();

    pixelStore();
    const c = ctx();
    drag(rectTool, c, [[0, 0], [30, 30]]);
    expect(c.hint).toHaveBeenCalledWith(expect.stringContaining('vector'));
    expect(store().get().doc.layers[0].cels).toHaveLength(0);
  });

  it('uses the modifier keys held at the end of the drag', () => {
    vectorStore();
    drag(rectTool, ctx(), [[100, 100], [160, 130]], { shift: true, alt: true });
    const s = shapesNow()[0] as PathShape;
    expect(shapeBounds({ ...s, stroke: null })).toEqual({ x: 40, y: 40, w: 120, h: 120 });
  });
});
