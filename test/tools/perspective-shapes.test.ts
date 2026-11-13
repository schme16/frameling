import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape, StrokeShape } from '../../src/core/format';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, setDepth, setView, toggleThroughCamera } from '../../src/camera/ops';
import { store } from '../../src/core/store';
import { pencilTool } from '../../src/tools/pencil';
import { brushTool } from '../../src/tools/brush';
import { setChoice } from '../../src/core/choices';
import { eraserTool } from '../../src/tools/eraser';
import { ellipseTool, rectTool } from '../../src/tools/shapes';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { viewSizeFactor } from '../../src/tools/view-size';
import { addShapes, box, ctx, drag, shapesNow, vectorStore } from './helpers';

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setViewSettings({ perspective: true, snap: true, throughCamera: false, guides: true, grid: 'off' });
});

function withPerspective(points: { x: number; y: number }[]) {
  const s = vectorStore();
  s.update('Perspective', (d) => void (d.perspective = { points }));
  s.setUi({ fillColor: '#ff0000', strokeOn: false });
  return s;
}

const corners = (s: PathShape) => s.paths[0].points.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));

describe('rectangles and ellipses on perspective guides', () => {
  it('a rectangle dragged on a wall becomes the matching quad', () => {
    withPerspective([{ x: 300, y: 120 }]);
    setToolSettings({ perspectivePlane: 'wall' });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    const q = corners(shapesNow()[0] as PathShape);
    // The start and end stay put; the others sit on the lines from them to the vanishing point.
    expect(q[0]).toEqual({ x: 60, y: 170 });
    expect(q[2]).toEqual({ x: 140, y: 230 });
    expect(q[1].x).toBe(140);
    expect(q[3].x).toBe(60);
    const cross = (a: typeof q[0], v: { x: number; y: number }, p: typeof q[0]) => (v.x - a.x) * (p.y - a.y) - (v.y - a.y) * (p.x - a.x);
    expect(Math.abs(cross(q[0], { x: 300, y: 120 }, q[1]))).toBeLessThan(2);
    expect(Math.abs(cross(q[2], { x: 300, y: 120 }, q[3]))).toBeLessThan(2);
    // Not a plain rectangle any more.
    expect(q[1].y).not.toBe(170);
  });

  it('Flat, Ctrl, the snap switch and hidden guides all give the ordinary rectangle', () => {
    withPerspective([{ x: 300, y: 120 }]);
    const plain = [{ x: 60, y: 170 }, { x: 140, y: 170 }, { x: 140, y: 230 }, { x: 60, y: 230 }];
    setToolSettings({ perspectivePlane: 'flat' });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    expect(corners(shapesNow()[0] as PathShape)).toEqual(plain);
    setToolSettings({ perspectivePlane: 'wall' });
    // Ctrl (mod) stops snapping for a moment.
    drag(rectTool, ctx(), [[60, 170], [140, 230]], { mod: true });
    expect(corners(shapesNow()[1] as PathShape)).toEqual(plain);
    setViewSettings({ snap: false });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    expect(corners(shapesNow()[2] as PathShape)).toEqual(plain);
    setViewSettings({ snap: true, perspective: false });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    expect(corners(shapesNow()[3] as PathShape)).toEqual(plain);
  });

  it('with no perspective guides in the document nothing changes', () => {
    vectorStore().setUi({ fillColor: '#ff0000', strokeOn: false });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    expect(corners(shapesNow()[0] as PathShape)).toHaveLength(4);
  });

  it('an ellipse on a floor is a projected ellipse of sixteen curves that touches the quad edges', () => {
    withPerspective([{ x: 200, y: 100 }]);
    setToolSettings({ perspectivePlane: 'floor' });
    drag(ellipseTool, ctx(), [[80, 170], [220, 260]]);
    const sh = shapesNow()[0] as PathShape;
    expect(sh.paths[0].points).toHaveLength(16);
    const ys = sh.paths[0].points.map((p) => p.y);
    // Floor with one point: the near edge stays level, so the ellipse's lowest point is on it.
    expect(Math.max(...ys)).toBeLessThanOrEqual(260 + 1e-6);
    expect(Math.max(...ys)).toBeGreaterThan(255);
  });

  it('Shift keeps the box square before it goes on the plane', () => {
    withPerspective([{ x: 300, y: 120 }]);
    setToolSettings({ perspectivePlane: 'wall' });
    drag(rectTool, ctx(), [[60, 170], [140, 200]], { shift: true });
    const q = corners(shapesNow()[0] as PathShape);
    expect(q[2]).toEqual({ x: 140, y: 250 });
  });
});

describe('tool sizes through a zoomed camera', () => {
  function zoomedCamera(zoom: number) {
    const s = vectorStore();
    const layerId = s.get().doc.layers[0].id;
    s.setUi({ brush: { ...s.get().ui.brush, size: 12 } });
    addCamera();
    setView({ x: 200, y: 150, zoom });
    s.setUi({ activeLayerId: layerId });
    toggleThroughCamera(true);
    return s;
  }

  it('is 1 when not looking through the camera', () => {
    vectorStore();
    expect(viewSizeFactor()).toBe(1);
    zoomedCamera(2);
    toggleThroughCamera(false);
    expect(viewSizeFactor()).toBe(1);
  });

  it('is the inverse of the camera zoom, and a far layer follows its own parallax', () => {
    const s = zoomedCamera(4);
    expect(viewSizeFactor()).toBeCloseTo(0.25);
    setDepth(s.get().doc.layers[0].id, 1);
    expect(viewSizeFactor()).toBeCloseTo(1 / Math.sqrt(4));
  });

  it('a brush stroke is thinner on the stage, so it looks the size you set', () => {
    zoomedCamera(2);
    drag(brushTool, ctx(), [[10, 10], [30, 18], [60, 40], [90, 38], [120, 20]]);
    expect((shapesNow()[0] as StrokeShape).brush.size).toBe(6);
  });

  it('the pencil and the rectangle outline do the same', () => {
    zoomedCamera(2);
    setToolSettings({ pencilSize: 4, shapeStroke: 8 });
    drag(pencilTool, ctx(), [[10, 10], [30, 18], [60, 40]]);
    expect((shapesNow()[0] as StrokeShape).brush.size).toBe(2);
    store().setUi({ strokeOn: true });
    drag(rectTool, ctx(), [[60, 170], [140, 230]]);
    expect((shapesNow()[1] as PathShape).stroke?.width).toBe(4);
  });

  it('the eraser reaches by what you see too', () => {
    setChoice('eraser.vectorWay', 'whole');
    zoomedCamera(2);
    setToolSettings({ eraserSize: 40 });
    // The box is 15 away: a radius of 20 on the stage would reach it, the 10 you get at zoom 2 does not.
    addShapes(box('b', 100, 100, 50, 50));
    drag(eraserTool, ctx(), [[125, 165], [125, 165]]);
    expect(shapesNow()).toHaveLength(1);
    drag(eraserTool, ctx(), [[125, 157], [125, 157]]);
    expect(shapesNow()).toHaveLength(0);
  });
});
