// Shift+click draws a straight line from where you last left off: brush, pencil and eraser, on both kinds of layer.
import { beforeEach, describe, expect, it } from 'vitest';
import type { StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { brushTool } from '../../src/tools/brush';
import { pencilTool } from '../../src/tools/pencil';
import { eraserTool } from '../../src/tools/eraser';
import { forgetLastVectorEnd } from '../../src/tools/vectorStroke';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { ctx, drag, ptr, shapesNow, vectorStore } from './helpers';

beforeEach(() => {
  forgetLastVectorEnd();
  forgetLastPixelEnd();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
});

const last = () => shapesNow().at(-1) as StrokeShape;
const click = (tool: typeof brushTool, x: number, y: number, shift = false) => {
  const c = ctx();
  tool.down?.(ptr(x, y, { shift }), c);
  tool.up?.(ptr(x, y, { shift }), c);
};

describe('Shift+click on a vector layer', () => {
  it('the brush runs a line from the end of the last stroke', () => {
    vectorStore();
    drag(brushTool, ctx(), [[10, 10], [40, 10], [70, 10]]);
    const drawn = shapesNow().length;
    click(brushTool, 70, 90, true);
    expect(shapesNow().length).toBe(drawn + 1);
    const pts = last().points;
    // Starts where the last stroke ended, finishes where you clicked.
    expect(pts[0].x).toBeCloseTo(70);
    expect(pts[0].y).toBeCloseTo(10);
    expect(pts[pts.length - 1].y).toBeCloseTo(90);
  });

  it('without Shift a click is just a dot where you clicked', () => {
    vectorStore();
    drag(brushTool, ctx(), [[10, 10], [70, 10]]);
    click(brushTool, 70, 90);
    expect(last().points.every((p) => p.y === 90)).toBe(true);
  });

  it('the pencil does the same', () => {
    vectorStore();
    drag(pencilTool, ctx(), [[10, 10], [50, 10]]);
    click(pencilTool, 50, 60, true);
    const pts = last().points;
    expect(pts[0].y).toBeCloseTo(10);
    expect(pts[pts.length - 1].y).toBeCloseTo(60);
  });

  it('the eraser rubs out everything along the line, not just under the click', () => {
    const s = vectorStore();
    s.setUi({ brush: { ...s.get().ui.brush, size: 4 } });
    setToolSettings({ eraserSize: 10 });
    // Three separate blobs in a row.
    for (const x of [20, 60, 100]) drag(brushTool, ctx(), [[x, 200], [x + 2, 200]]);
    expect(shapesNow()).toHaveLength(3);
    // Rub out the first, then Shift+click past the third: the sweep walks the whole way.
    click(eraserTool as typeof brushTool, 20, 200);
    expect(shapesNow()).toHaveLength(2);
    click(eraserTool as typeof brushTool, 100, 200, true);
    expect(shapesNow()).toHaveLength(0);
  });
});
