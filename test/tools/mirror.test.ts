import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape, Shape, StrokeShape } from '../../src/core/format';
import { setPixelSettings, DEFAULT_PIXEL_SETTINGS } from '../../src/pixel/settings';
import { brushTool } from '../../src/tools/brush';
import { eraserTool } from '../../src/tools/eraser';
import { fillTool } from '../../src/tools/fill';
import { lineTool, rectTool } from '../../src/tools/shapes';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { activeVectorMirror, mirrorMatrices, mirrorShapes, mirrorSpots, resetMirrorSaid, vectorMirror } from '../../src/tools/mirror';
import { setChoice } from '../../src/core/choices';
import { box, ctx, drag, pixelStore, shapesNow, vectorStore } from './helpers';

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setChoice('eraser.vectorWay', 'whole');
  resetMirrorSaid();
});

const stroke = (id: string, pts: [number, number][]): StrokeShape => ({
  id,
  type: 'stroke',
  points: pts.map(([x, y]) => ({ x, y, p: 0.5 })),
  brush: { size: 6, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 4, taperEnd: 0, capStart: true, capEnd: true },
  color: '#112233',
  opacity: 1,
});

describe('the mirror as pure geometry', () => {
  it('sits in the middle of the page unless told otherwise', () => {
    expect(vectorMirror('h', 400, 300, null, null)).toEqual({ mode: 'h', ax: 200, ay: 150 });
    expect(vectorMirror('both', 400, 300, 120, 40)).toEqual({ mode: 'both', ax: 120, ay: 40 });
  });

  it('makes no copies when off, one for a direction, three for both', () => {
    expect(mirrorMatrices(vectorMirror('off', 400, 300, null, null))).toHaveLength(0);
    expect(mirrorMatrices(vectorMirror('h', 400, 300, null, null))).toHaveLength(1);
    expect(mirrorMatrices(vectorMirror('v', 400, 300, null, null))).toHaveLength(1);
    expect(mirrorMatrices(vectorMirror('both', 400, 300, null, null))).toHaveLength(3);
  });

  it('reflects points across the lines, the original first', () => {
    const m = vectorMirror('both', 400, 300, 200, 150);
    expect(mirrorSpots(m, 50, 20)).toEqual([
      { x: 50, y: 20 },
      { x: 350, y: 20 },
      { x: 50, y: 280 },
      { x: 350, y: 280 },
    ]);
    expect(mirrorSpots(vectorMirror('off', 400, 300, null, null), 5, 5)).toEqual([{ x: 5, y: 5 }]);
  });

  it('reflects a stroke point by point and keeps its brush, colour and widths', () => {
    const s = stroke('a', [[10, 20], [60, 80]]);
    const [c] = mirrorShapes([s], vectorMirror('h', 400, 300, 200, 150), () => 'copy') as StrokeShape[];
    expect(c.id).toBe('copy');
    expect(c.points.map((p) => [p.x, p.y])).toEqual([[390, 20], [340, 80]]);
    expect(c.points.map((p) => p.p)).toEqual([0.5, 0.5]);
    expect(c.brush).toEqual(s.brush);
    expect(c.color).toBe('#112233');
  });

  it('reflects a path, and does not carry over the group or the origin', () => {
    const b = { ...box('b', 10, 10, 20, 20), group: 'g1', origin: 'o1' } as PathShape;
    const [c] = mirrorShapes([b], vectorMirror('v', 400, 300, 200, 150), () => 'copy') as PathShape[];
    expect(c.group).toBeUndefined();
    expect(c.origin).toBeUndefined();
    const ys = c.paths[0].points.map((p) => p.y).sort((x, y) => x - y);
    expect(ys[0]).toBeCloseTo(270);
    expect(ys[ys.length - 1]).toBeCloseTo(290);
  });

  it('gives every copy its own id', () => {
    const copies = mirrorShapes([stroke('a', [[1, 1], [2, 2]])], vectorMirror('both', 400, 300, null, null));
    expect(new Set(copies.map((c) => c.id)).size).toBe(3);
  });

  it('a line along the mirror line lands on itself', () => {
    const [c] = mirrorShapes([stroke('a', [[200, 10], [200, 90]])], vectorMirror('h', 400, 300, 200, 150), () => 'copy') as StrokeShape[];
    expect(c.points.map((p) => p.x)).toEqual([200, 200]);
  });
});

describe('mirror drawing on a vector layer', () => {
  it('draws one stroke when it is off', () => {
    vectorStore();
    drag(brushTool, ctx(), [[50, 50], [80, 90], [100, 120]]);
    expect(shapesNow()).toHaveLength(1);
  });

  it('is only in force on a vector layer', () => {
    vectorStore();
    setPixelSettings({ symmetry: 'h' });
    expect(activeVectorMirror()).not.toBeNull();
    pixelStore();
    expect(activeVectorMirror()).toBeNull();
  });

  it('copies a brush stroke across the page middle, in one undo step', () => {
    const s = vectorStore();
    setPixelSettings({ symmetry: 'h' });
    drag(brushTool, ctx(), [[50, 50], [80, 90], [100, 120]]);
    const shapes = shapesNow() as StrokeShape[];
    expect(shapes).toHaveLength(2);
    expect(shapes[0].points[0]).toMatchObject({ x: 50, y: 50 });
    expect(shapes[1].points[0]).toMatchObject({ x: 350, y: 50 });
    expect(shapes[1].color).toBe(shapes[0].color);
    expect(s.undoLabel()).toBe('Draw stroke');
    s.undo();
    expect(shapesNow()).toHaveLength(0);
    s.redo();
    expect(shapesNow()).toHaveLength(2);
  });

  it('makes four with both ways', () => {
    vectorStore();
    setPixelSettings({ symmetry: 'both' });
    drag(brushTool, ctx(), [[50, 50], [100, 120]]);
    expect(shapesNow()).toHaveLength(4);
  });

  it('follows a moved mirror line, which is kept apart from the pixel one', () => {
    vectorStore();
    setPixelSettings({ symmetry: 'h', vectorAxisX: 100, axisX: 3 });
    drag(brushTool, ctx(), [[50, 50], [70, 70]]);
    const copy = shapesNow()[1] as StrokeShape;
    expect(copy.points[0].x).toBe(150);
  });

  it('copies a rectangle and a line', () => {
    vectorStore();
    setPixelSettings({ symmetry: 'v' });
    drag(rectTool, ctx(), [[40, 30], [90, 60]]);
    drag(lineTool, ctx(), [[10, 10], [60, 40]]);
    expect(shapesNow().filter((x: Shape) => x.type === 'path')).toHaveLength(4);
  });

  it('rubs out on both sides', () => {
    vectorStore();
    drag(brushTool, ctx(), [[40, 100], [41, 100]]);
    drag(brushTool, ctx(), [[360, 100], [361, 100]]);
    expect(shapesNow()).toHaveLength(2);
    setPixelSettings({ symmetry: 'h' });
    drag(eraserTool, ctx(), [[38, 100], [42, 100]]);
    expect(shapesNow()).toHaveLength(0);
  });

  it('says the bucket does not mirror, once, and only while the mirror is on', () => {
    vectorStore();
    const quiet = ctx();
    drag(fillTool, quiet, [[200, 150], [200, 150]]);
    expect(quiet.hint.mock.calls.filter(([m]) => /Mirror drawing/.test(m))).toHaveLength(0);
    setPixelSettings({ symmetry: 'h' });
    const c = ctx();
    fillTool.down?.({ x: 200, y: 150, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 }, c);
    fillTool.down?.({ x: 201, y: 150, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 }, c);
    expect(c.hint.mock.calls.filter(([m]) => /Mirror drawing/.test(m))).toHaveLength(1);
    setPixelSettings({ symmetry: 'v' });
    fillTool.down?.({ x: 202, y: 150, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 }, c);
    expect(c.hint.mock.calls.filter(([m]) => /Mirror drawing/.test(m))).toHaveLength(2);
  });
});
