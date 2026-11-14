// Synthetic pen samples through the real tools: pressure, tilt and the per-tool switches change what lands in the document.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, StrokeShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { brushTool } from '../../src/tools/brush';
import { pencilTool } from '../../src/tools/pencil';
import { setChoice } from '../../src/core/choices';
import { eraserTool } from '../../src/tools/eraser';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { sprayTool } from '../../src/pixel/tools';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { resetPen, setPenDevice, setToolPen } from '../../src/tablet/settings';
import { flowFactor, opacityFactor, pressureSize, sizeFactor, tiltSize } from '../../src/tablet/dynamics';
import { strokeOutline } from '../../src/core/render';
import { ctx, drag, pixelStore, ptr, shapesNow, vectorStore } from '../tools/helpers';
import '../../src/pixel';

const pen = (x: number, y: number, pressure: number, extra: Partial<Parameters<typeof ptr>[2]> = {}) => ptr(x, y, { hasPressure: true, pressure, pointerType: 'pen', ...extra });

/** A pen stroke along y = 50 whose pressure goes through `pressures`, as a real tablet would send it. */
function stroke(tool: typeof brushTool, pressures: number[], extra: Partial<Parameters<typeof ptr>[2]> = {}, y = 50): void {
  const c = ctx();
  const at = (i: number) => 20 + i * 10;
  tool.down?.(pen(at(0), y, pressures[0], extra), c);
  for (let i = 1; i < pressures.length - 1; i++) tool.move?.(pen(at(i), y, pressures[i], extra), c);
  const n = pressures.length - 1;
  tool.up?.(pen(at(n), y, pressures[n], extra), c);
}

const lastStroke = () => shapesNow().at(-1) as StrokeShape;
/** How wide the drawn line really is: the height of its outline, for a stroke drawn along a straight horizontal line. */
function thickness(s: StrokeShape): number {
  const ys = strokeOutline(s).map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}
const ramp = [0.05, 0.2, 0.4, 0.6, 0.8, 1];

beforeEach(() => {
  resetPen();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  forgetLastPixelEnd();
});

describe('the factors', () => {
  const e = pen(0, 0, 0.5, { tiltX: 0, tiltY: 0 });
  it('are all 1 until a switch is on', () => {
    expect(pressureSize('pencil', e)).toBe(1);
    expect(opacityFactor('pencil', e)).toBe(1);
    expect(flowFactor('pencil', e)).toBe(1);
    expect(tiltSize('pencil', e)).toBe(1);
  });
  it('follow pressure when on, from faint to full, and ignore a device with no pressure', () => {
    setToolPen('pencil', { size: true, opacity: true, flow: true });
    expect(pressureSize('pencil', pen(0, 0, 0))).toBeCloseTo(0.15);
    expect(pressureSize('pencil', pen(0, 0, 1))).toBe(1);
    expect(opacityFactor('pencil', pen(0, 0, 0.5))).toBeCloseTo(0.575);
    expect(flowFactor('pencil', pen(0, 0, 1))).toBeCloseTo(1.75);
    expect(pressureSize('pencil', ptr(0, 0))).toBe(1);
    expect(opacityFactor('pencil', ptr(0, 0))).toBe(1);
  });
  it('lean makes it bigger, more with a bigger amount, and a mouse has none', () => {
    setToolPen('pencil', { tilt: true });
    const flat = tiltSize('pencil', { tiltX: 80, tiltY: 0 });
    expect(flat).toBeGreaterThan(1.5);
    expect(tiltSize('pencil', { tiltX: 0, tiltY: 0 })).toBe(1);
    setPenDevice({ tiltAmount: 10 });
    expect(tiltSize('pencil', { tiltX: 80, tiltY: 0 })).toBeLessThan(flat);
    expect(tiltSize('pencil', {})).toBe(1);
    expect(sizeFactor('pencil', pen(0, 0, 1, { tiltX: 0, tiltY: 0 }))).toBe(1);
  });
});

describe('vector brush with a pen', () => {
  it('stores the pressure of every sample, so the line swells and thins as it was drawn', () => {
    vectorStore();
    stroke(brushTool, ramp);
    expect(lastStroke().points.map((p) => p.p)).toEqual(ramp);
    expect(lastStroke().opacity).toBe(1);
  });
  it('a mouse still gets the middle value', () => {
    vectorStore();
    const c = ctx();
    brushTool.down?.(ptr(10, 10), c);
    brushTool.move?.(ptr(40, 12), c);
    brushTool.up?.(ptr(80, 20), c);
    expect(lastStroke().points.every((p) => p.p === 0.5)).toBe(true);
  });
  it('can make a light line fainter, and a hard one solid', () => {
    vectorStore();
    setToolPen('brush', { opacity: true });
    stroke(brushTool, [0.1, 0.1, 0.1, 0.1], {}, 40);
    const light = lastStroke().opacity;
    stroke(brushTool, [0.95, 0.95, 0.95, 0.95], {}, 90);
    const hard = lastStroke().opacity;
    expect(light).toBeLessThan(0.35);
    expect(hard).toBeGreaterThan(0.9);
    // A mouse ignores it.
    const c = ctx();
    brushTool.down?.(ptr(10, 150), c);
    brushTool.up?.(ptr(60, 150), c);
    expect(lastStroke().opacity).toBe(1);
  });
  it('leaning makes the line wider where the pen lies over, and wakes up thinning', () => {
    const s = vectorStore();
    s.setUi({ brush: { ...s.get().ui.brush, thinning: 0 } });
    setToolPen('brush', { tilt: true, size: false });
    stroke(brushTool, [0.5, 0.5, 0.5, 0.5], { tiltX: 0, tiltY: 0 }, 40);
    const upright = lastStroke();
    stroke(brushTool, [0.5, 0.5, 0.5, 0.5], { tiltX: 70, tiltY: 0 }, 90);
    const leaning = lastStroke();
    expect(upright.points.every((p) => p.p === 0.5)).toBe(true);
    expect(leaning.points[0].p).toBeGreaterThan(0.7);
    expect(leaning.brush.thinning).toBeGreaterThan(0.3);
    // A mouse stroke is left exactly as it was.
    const c = ctx();
    brushTool.down?.(ptr(10, 150), c);
    brushTool.up?.(ptr(60, 150), c);
    expect(lastStroke().brush.thinning).toBe(0);
  });

  it('draws a line about twice as wide with the pen laid over, and a steady one upright', () => {
    const s = vectorStore();
    s.setUi({ brush: { ...s.get().ui.brush, thinning: 0, taperStart: 0, taperEnd: 0, streamline: 0 } });
    setToolPen('brush', { tilt: true, size: false });
    stroke(brushTool, [0.5, 0.5, 0.5, 0.5], { tiltX: 0, tiltY: 0 }, 40);
    const upright = thickness(lastStroke());
    stroke(brushTool, [0.5, 0.5, 0.5, 0.5], { tiltX: 80, tiltY: 0 }, 90);
    const leaning = thickness(lastStroke());
    expect(leaning / upright).toBeGreaterThan(1.8);
    // Upright, the line is the size it is set to and stays even: no widths worked out from how fast it was drawn.
    expect(upright).toBeCloseTo(s.get().ui.brush.size, 0);
    expect(lastStroke().realPressure).toBe(true);
  });
});

describe('pencil with a pen', () => {
  it('stays the same width by default, and follows pressure when switched on', () => {
    vectorStore();
    stroke(pencilTool, ramp, {}, 40);
    expect(new Set(lastStroke().points.map((p) => p.p))).toEqual(new Set([0.5]));
    setToolPen('pencil', { size: true });
    stroke(pencilTool, ramp, {}, 90);
    expect(lastStroke().points.map((p) => p.p)).toEqual(ramp);
    expect(lastStroke().brush.thinning).toBeGreaterThanOrEqual(0.5);
  });
});

describe('eraser with a pen', () => {
  it('reaches further with a harder press when pressure sizes it', () => {
    setChoice('eraser.vectorWay', 'whole');
    const st = vectorStore();
    st.setUi({ brush: { ...st.get().ui.brush, size: 3 } });
    setToolSettings({ eraserSize: 40 });
    // A line the eraser passes 14 px above: out of reach at a light press (radius ~3), inside at a hard one (radius 20).
    drag(brushTool, ctx(), [[10, 114], [100, 114], [200, 114]]);
    setToolPen('eraser', { size: true });
    stroke(eraserTool as typeof brushTool, [0.05, 0.05, 0.05, 0.05, 0.05], {}, 100);
    expect(shapesNow()).toHaveLength(1);
    stroke(eraserTool as typeof brushTool, [1, 1, 1, 1], {}, 100);
    expect(shapesNow()).toHaveLength(0);
  });
});

describe('pixel tools with a pen', () => {
  const painted = () => {
    const d = Object.values(store().get().doc.drawings)[0] as PixelDrawing;
    let n = 0;
    for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i]) n++;
    return n;
  };
  it('the pixel brush gets bigger with a harder press when switched on', () => {
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 8, pixelPerfect: false });
    stroke(brushTool, [0.1, 0.1, 0.1, 0.1], {}, 10);
    const off = painted();
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 8, pixelPerfect: false });
    setToolPen('brush', { size: true });
    stroke(brushTool, [0.1, 0.1, 0.1, 0.1], {}, 10);
    const light = painted();
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 8, pixelPerfect: false });
    setToolPen('brush', { size: true });
    stroke(brushTool, [1, 1, 1, 1], {}, 10);
    const hard = painted();
    expect(light).toBeLessThan(hard);
    expect(hard).toBe(off);
  });
  it('a one pixel pixel perfect line keeps its size however hard you press', () => {
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 1, pixelPerfect: true });
    setToolPen('brush', { size: true, tilt: true });
    stroke(brushTool, [1, 1, 1, 1], { tiltX: 80, tiltY: 0 }, 10);
    expect(painted()).toBeLessThan(40);
  });
  it('the spray lays down more with a harder press when flow is on', () => {
    pixelStore(1);
    setPixelSettings({ spraySize: 12 });
    setToolPen('spray', { flow: true });
    const run = (p: number, y: number) => {
      const c = ctx();
      sprayTool.down?.(pen(2, y, p), c);
      for (let x = 3; x < 60; x++) sprayTool.move?.(pen(x, y, p), c);
      sprayTool.up?.(pen(60, y, p), c);
    };
    run(0.05, 20);
    const light = painted();
    run(1, 45);
    const total = painted();
    expect(total - light).toBeGreaterThan(light * 2);
  });
});
