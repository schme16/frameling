import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { brushTool } from '../../src/tools/brush';
import { pencilTool } from '../../src/tools/pencil';
import { eraserTool } from '../../src/tools/eraser';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { getPx } from '../../src/canvas/pixels';
import { addShapes, ctx, drag, pixelStore, ptr, shapesNow, vectorStore } from './helpers';

const wave: [number, number][] = [[10, 10], [30, 18], [60, 40], [90, 38], [120, 20]];

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  forgetLastPixelEnd();
});

describe('brush on a vector layer', () => {
  it('commits one stroke with the brush and colour from the UI state', () => {
    const s = vectorStore();
    s.setUi({ color: '#ff9e6d', brush: { ...s.get().ui.brush, size: 12 } });
    const c = ctx();
    drag(brushTool, c, wave);
    const shapes = shapesNow();
    expect(shapes).toHaveLength(1);
    const st = shapes[0] as StrokeShape;
    expect(st.type).toBe('stroke');
    expect(st.color).toBe('#ff9e6d');
    expect(st.brush.size).toBe(12);
    expect(st.points[0]).toMatchObject({ x: 10, y: 10 });
    expect(st.points[st.points.length - 1]).toMatchObject({ x: 120, y: 20 });
    expect(c.hint).not.toHaveBeenCalled();
  });

  it('makes the new key on an empty frame, and undoes in one step', () => {
    const s = vectorStore();
    drag(brushTool, ctx(), wave);
    expect(s.get().doc.layers[0].cels).toHaveLength(1);
    expect(s.undoLabel()).toBe('Draw stroke');
    s.undo();
    expect(s.get().doc.layers[0].cels).toHaveLength(0);
    s.redo();
    expect(shapesNow()).toHaveLength(1);
  });

  it('keeps real pen pressure and turns a lone click into a dot', () => {
    vectorStore();
    brushTool.down?.(ptr(50, 50, { hasPressure: true, pressure: 0.8, pointerType: 'pen' }), ctx());
    brushTool.move?.(ptr(60, 50, { hasPressure: true, pressure: 0.3, pointerType: 'pen' }), ctx());
    brushTool.up?.(ptr(60, 50, { hasPressure: true, pressure: 0.3, pointerType: 'pen' }), ctx());
    const st = shapesNow()[0] as StrokeShape;
    expect(st.points.map((p) => p.p)).toEqual([0.8, 0.3]);

    const c = ctx();
    drag(brushTool, c, [[200, 200], [200, 200]]);
    const dot = shapesNow()[1] as StrokeShape;
    expect(dot.points.length).toBeGreaterThanOrEqual(2);
  });

  it('skips points that add nothing, but always ends where the pen lifted', () => {
    vectorStore();
    const c = ctx(4);
    brushTool.down?.(ptr(10, 10), c);
    for (let i = 0; i < 50; i++) brushTool.move?.(ptr(10 + i * 0.01, 10), c);
    brushTool.up?.(ptr(11, 10), c);
    const st = shapesNow()[0] as StrokeShape;
    expect(st.points.length).toBeLessThan(10);
    expect(st.points[st.points.length - 1].x).toBe(11);
  });

  it('says why when the layer is locked, and draws nothing', () => {
    const s = vectorStore();
    s.update('lock', (d) => void (d.layers[0].locked = true));
    const c = ctx();
    drag(brushTool, c, wave);
    expect(c.hint).toHaveBeenCalledWith(expect.stringContaining('locked'));
    expect(shapesNow()).toHaveLength(0);
  });

  it('can be cancelled mid-stroke', () => {
    vectorStore();
    const c = ctx();
    brushTool.down?.(ptr(1, 1), c);
    brushTool.move?.(ptr(40, 40), c);
    brushTool.cancel?.(c);
    brushTool.up?.(ptr(40, 40), c);
    expect(shapesNow()).toHaveLength(0);
  });
});

describe('pencil', () => {
  it('draws a thin, even line regardless of the brush settings', () => {
    const s = vectorStore();
    s.setUi({ brush: { ...s.get().ui.brush, size: 50, taperEnd: 30 } });
    drag(pencilTool, ctx(), wave);
    const st = shapesNow()[0] as StrokeShape;
    expect(st.brush.size).toBe(DEFAULT_TOOL_SETTINGS.pencilSize);
    expect(st.brush.thinning).toBeLessThan(0.2);
    expect(st.brush.taperEnd).toBe(0);
  });

  it('is the one pixel pencil on a pixel layer', () => {
    expect(pencilTool.layers).toEqual(['vector', 'pixel']);
    pixelStore();
    setToolSettings({ pixelBrushSize: 5 });
    const c = ctx();
    drag(pencilTool, c, [[4, 4], [12, 4]]);
    expect(c.hint).not.toHaveBeenCalled();
    const { doc } = store().get();
    const d = Object.values(doc.drawings)[0] as PixelDrawing;
    // One pixel high whatever the brush size: row 1 stays clear.
    expect(getPx(d.pixels, d.width, 0, 0)[3]).toBe(255);
    expect(getPx(d.pixels, d.width, 1, 0)[3]).toBe(255);
    expect(getPx(d.pixels, d.width, 0, 1)[3]).toBe(0);
  });
});

/** Pointer at the middle of art pixel (px, py) on an 8px-per-pixel layer. */
const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
const pixelsNow = () => {
  const { doc } = store().get();
  const cel = doc.layers[0].cels[0];
  return cel ? (doc.drawings[cel.drawingId] as PixelDrawing) : undefined;
};

describe('brush on a pixel layer', () => {
  it('paints hard pixels in the current colour and commits a new array', () => {
    const s = pixelStore();
    s.setUi({ color: '#ff0000' });
    drag(brushTool, ctx(), [at(0, 0), at(1, 0), at(3, 0)]);
    const d = pixelsNow()!;
    expect(d.width).toBe(8);
    for (const x of [0, 1, 2, 3]) expect(getPx(d.pixels, 8, x, 0)).toEqual([255, 0, 0, 255]);
    expect(getPx(d.pixels, 8, 4, 0)).toEqual([0, 0, 0, 0]);
    expect(getPx(d.pixels, 8, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it('is one undo step, and never edits the old array in place', () => {
    const s = pixelStore();
    drag(brushTool, ctx(), [at(0, 0), at(2, 0)]);
    const first = pixelsNow()!.pixels;
    drag(brushTool, ctx(), [at(0, 3), at(2, 3)]);
    const second = pixelsNow()!.pixels;
    expect(second).not.toBe(first);
    expect(getPx(first, 8, 0, 3)).toEqual([0, 0, 0, 0]);
    s.undo();
    expect(pixelsNow()!.pixels).toBe(first);
  });

  it('removes the L-shaped corner doubles with pixel perfect on, and keeps them off', () => {
    const s = pixelStore();
    s.setUi({ color: '#00ff00' });
    const stairs = [at(0, 0), at(1, 0), at(1, 1), at(2, 1), at(2, 2)];
    setToolSettings({ pixelPerfect: true });
    drag(brushTool, ctx(), stairs);
    let d = pixelsNow()!;
    expect(getPx(d.pixels, 8, 1, 0)[3]).toBe(0);
    expect(getPx(d.pixels, 8, 2, 1)[3]).toBe(0);
    expect([getPx(d.pixels, 8, 0, 0)[3], getPx(d.pixels, 8, 1, 1)[3], getPx(d.pixels, 8, 2, 2)[3]]).toEqual([255, 255, 255]);

    s.undo();
    setToolSettings({ pixelPerfect: false });
    drag(brushTool, ctx(), stairs);
    d = pixelsNow()!;
    expect(getPx(d.pixels, 8, 1, 0)[3]).toBe(255);
    expect(getPx(d.pixels, 8, 2, 1)[3]).toBe(255);
  });

  it('keeps pixels the line passes back over when it drops a corner', () => {
    const s = pixelStore();
    s.setUi({ color: '#0000ff' });
    // Down the column, then back up beside it: the second pass crosses nothing, but draw over an existing pixel.
    drag(brushTool, ctx(), [at(1, 1), at(2, 1), at(2, 2), at(1, 2), at(1, 1)]);
    const d = pixelsNow()!;
    expect(getPx(d.pixels, 8, 1, 1)[3]).toBe(255);
  });

  it('paints a bigger footprint at bigger sizes', () => {
    const s = pixelStore();
    s.setUi({ color: '#ffffff' });
    setToolSettings({ pixelBrushSize: 3 });
    drag(brushTool, ctx(), [at(3, 3), at(3, 3)]);
    const d = pixelsNow()!;
    let n = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (getPx(d.pixels, 8, x, y)[3]) n++;
    expect(n).toBe(9);
  });

  it('draws a straight line from the last pixel with Shift+click', () => {
    const s = pixelStore();
    s.setUi({ color: '#ff00ff' });
    drag(brushTool, ctx(), [at(0, 0), at(0, 0)]);
    drag(brushTool, ctx(), [at(6, 0), at(6, 0)], { shift: true });
    const d = pixelsNow()!;
    for (let x = 0; x <= 6; x++) expect(getPx(d.pixels, 8, x, 0)[3]).toBe(255);
    // Two strokes, two undo steps.
    s.undo();
    const back = pixelsNow()!;
    expect(getPx(back.pixels, 8, 3, 0)[3]).toBe(0);
    expect(getPx(back.pixels, 8, 0, 0)[3]).toBe(255);
  });

  it('does not make a drawing when nothing changed', () => {
    const s = pixelStore();
    // Erasing an empty frame leaves nothing behind, not even an empty key.
    drag(eraserTool, ctx(), [at(1, 1), at(3, 3)]);
    expect(s.get().doc.layers[0].cels).toHaveLength(0);
    expect(s.canUndo()).toBe(false);
  });

  it('ignores points off the grid', () => {
    pixelStore();
    drag(brushTool, ctx(), [at(6, 6), [200, 200], at(7, 7)]);
    expect(pixelsNow()).toBeTruthy();
  });
});

describe('eraser', () => {
  it('clears pixels on a pixel layer', () => {
    const s = pixelStore();
    s.setUi({ color: '#ff0000' });
    drag(brushTool, ctx(), [at(0, 0), at(4, 0)]);
    drag(eraserTool, ctx(), [at(1, 0), at(2, 0)]);
    const d = pixelsNow()!;
    expect(getPx(d.pixels, 8, 0, 0)[3]).toBe(255);
    expect(getPx(d.pixels, 8, 1, 0)[3]).toBe(0);
    expect(getPx(d.pixels, 8, 2, 0)[3]).toBe(0);
    expect(getPx(d.pixels, 8, 3, 0)[3]).toBe(255);
  });

  it('removes whole strokes it touches on a vector layer, as one undo step', () => {
    const s = vectorStore();
    drag(brushTool, ctx(), [[10, 100], [100, 100], [200, 100]]);
    drag(brushTool, ctx(), [[10, 200], [100, 200], [200, 200]]);
    drag(brushTool, ctx(), [[10, 250], [100, 250], [200, 250]]);
    expect(shapesNow()).toHaveLength(3);
    // One swipe down across the first two.
    drag(eraserTool, ctx(), [[100, 90], [100, 150], [100, 205]]);
    expect(shapesNow()).toHaveLength(1);
    expect(s.undoLabel()).toBe('Erase lines');
    s.undo();
    expect(shapesNow()).toHaveLength(3);
  });

  it('does not jump over a thin line on a fast flick', () => {
    vectorStore();
    drag(brushTool, ctx(), [[10, 100], [100, 100], [200, 100]]);
    drag(eraserTool, ctx(), [[100, 40], [100, 160]]);
    expect(shapesNow()).toHaveLength(0);
  });

  it('erases nothing, and says nothing, on a blank frame', () => {
    const s = vectorStore();
    const c = ctx();
    drag(eraserTool, c, [[10, 10], [50, 50]]);
    expect(c.hint).not.toHaveBeenCalled();
    expect(s.canUndo()).toBe(false);
  });

  it('only touches shapes within reach', () => {
    vectorStore();
    addShapes();
    drag(brushTool, ctx(), [[10, 100], [200, 100]]);
    drag(eraserTool, ctx(), [[100, 140], [120, 140]]);
    expect(shapesNow()).toHaveLength(1);
  });
});
