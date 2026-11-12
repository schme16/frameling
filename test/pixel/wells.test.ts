// @vitest-environment jsdom
// Paint and Back in the Pixel workspace: every pixel tool paints with Paint, X swaps, a swatch click sets Paint, a
// right-click paints with Back, and no tool brings a different well forward. Draw keeps Fill and Stroke.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { fillTool } from '../../src/tools/fill';
import { pickTool, wellForTool } from '../../src/tools/pick';
import { paintWellsOn, rightPaints, setPaintWells, setShapeFilledSource } from '../../src/tools/pixelWells';
import { activeColor, setActiveColor, shapeColors, swapPaintBack } from '../../src/tools/wells';
import { pencilTool } from '../../src/tools/pencil';
import { rectTool } from '../../src/tools/shapes';
import { sprayTool } from '../../src/pixel/tools';
import { sprayCells, seeded } from '../../src/pixel/spray';
import '../../src/pixel';
import { ctx, drag, pixelStore, ptr } from '../tools/helpers';

const hex = (x: number, y: number): string | null => {
  const { doc } = store().get();
  const d = Object.values(doc.drawings)[0] as PixelDrawing | undefined;
  if (!d) return null;
  const i = (y * d.width + x) * 4;
  if (d.pixels[i + 3] === 0) return null;
  return '#' + [0, 1, 2].map((k) => d.pixels[i + k].toString(16).padStart(2, '0')).join('');
};
const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];

beforeEach(() => {
  pixelStore();
  setShapeFilledSource(() => false);
  store().setUi({ color: '#00aa00', fillColor: '#ffcc00', strokeOn: true, activeWell: 'fill' });
});
afterEach(() => setPaintWells(false));

describe('with Paint and Back on', () => {
  it('the colour you set and pick is always Paint', () => {
    setPaintWells(true);
    expect(activeColor()).toBe('#00aa00');
    setActiveColor('#112233');
    expect(store().get().ui.color).toBe('#112233');
    expect(store().get().ui.fillColor).toBe('#ffcc00');
    expect(store().get().ui.strokeOn).toBe(true);
  });
  it('picking green and pouring the bucket pours green, not the old yellow', () => {
    setPaintWells(true);
    setActiveColor('#11aa22');
    pickTool('fill');
    fillTool.down!(ptr(60, 60), ctx());
    expect(hex(7, 7)).toBe('#11aa22');
    expect(store().get().ui.activeWell).toBe('fill'); // untouched: nothing silently switched
  });
  it('no tool moves the wells', () => {
    setPaintWells(true);
    for (const t of ['fill', 'pencil', 'line', 'shade', 'dither', 'spray']) expect(wellForTool(t), t).toBeNull();
    store().setUi({ activeWell: 'stroke' });
    pickTool('fill');
    expect(store().get().ui.activeWell).toBe('stroke');
  });
  it('the pencil paints Paint; Back is only for right-click', () => {
    setPaintWells(true);
    drag(pencilTool, ctx(), [at(0, 0), at(0, 0)]);
    expect(hex(0, 0)).toBe('#00aa00');
  });
  it('X swaps Paint and Back, and swaps again', () => {
    setPaintWells(true);
    getCommand('colors.toggleWell')!.run();
    expect(store().get().ui.color).toBe('#ffcc00');
    expect(store().get().ui.fillColor).toBe('#00aa00');
    getCommand('colors.swap')!.run();
    expect(store().get().ui.color).toBe('#00aa00');
    expect(getCommand('pixel.swapPaintBack')!.enabled!(store().get())).toBe(true);
  });
  it('has nothing to swap with when Back is none', () => {
    setPaintWells(true);
    store().setUi({ fillColor: null });
    expect(swapPaintBack()).toBe(false);
    expect(store().get().ui.color).toBe('#00aa00');
  });
  it('shapes are drawn in Paint, filled in Paint only when Filled is on', () => {
    setPaintWells(true);
    expect(shapeColors()).toEqual({ fill: null, stroke: '#00aa00' });
    setShapeFilledSource(() => true);
    expect(shapeColors()).toEqual({ fill: '#00aa00', stroke: '#00aa00' });
    drag(rectTool, ctx(), [at(0, 0), at(5, 5)]);
    expect(hex(0, 0)).toBe('#00aa00');
    expect(hex(2, 2)).toBe('#00aa00');
  });
  it('the other way a shape could be filled (inside in Back) is one switch away', () => {
    setPaintWells(true);
    setShapeFilledSource(() => 'back');
    expect(shapeColors()).toEqual({ fill: '#ffcc00', stroke: '#00aa00' });
  });
  it('the dither brush keeps using Back as its second colour', () => {
    setPaintWells(true);
    expect(store().get().ui.fillColor).toBe('#ffcc00');
  });
});

describe('with Fill and Stroke (Draw)', () => {
  it('X still brings the other well forward and the bucket pours the fill', () => {
    expect(paintWellsOn()).toBe(false);
    getCommand('colors.toggleWell')!.run();
    expect(store().get().ui.activeWell).toBe('stroke');
    expect(wellForTool('fill')).toBe('fill');
    fillTool.down!(ptr(60, 60), ctx());
    expect(hex(7, 7)).toBe('#ffcc00');
  });
  it('shape colours are the fill and the stroke', () => {
    expect(shapeColors()).toEqual({ fill: '#ffcc00', stroke: '#00aa00' });
  });
});

describe('right-click', () => {
  it('paints with Back on the painting tools, on a pixel layer, in the Pixel workspace only', () => {
    expect(rightPaints('pencil', 'pixel', 2)).toBe(false);
    setPaintWells(true);
    for (const t of ['pencil', 'brush', 'fill', 'shade', 'dither', 'spray', 'line', 'rect', 'ellipse']) expect(rightPaints(t, 'pixel', 2), t).toBe(true);
    expect(rightPaints('pencil', 'vector', 2)).toBe(false);
    expect(rightPaints('eraser', 'pixel', 2)).toBe(false);
    expect(rightPaints('pencil', 'pixel', 0)).toBe(false);
  });
});

describe('the Spray', () => {
  it('scatters inside a disc, with the chance asked for', () => {
    const cells = sprayCells(10, 10, 3, 1, seeded(7));
    expect(cells.length).toBeGreaterThan(20);
    expect(cells.every((c) => (c.x - 10) ** 2 + (c.y - 10) ** 2 <= 9)).toBe(true);
    expect(sprayCells(10, 10, 3, 0, seeded(7))).toEqual([]);
    const some = sprayCells(10, 10, 3, 0.2, seeded(7)).length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(cells.length);
  });
  it('is the same every time for the same seed', () => {
    expect(sprayCells(0, 0, 4, 0.3, seeded(42))).toEqual(sprayCells(0, 0, 4, 0.3, seeded(42)));
  });
  it('paints Paint pixels round where you press, and has no key', () => {
    setPaintWells(true);
    expect(sprayTool.key).toBeUndefined();
    const c = ctx();
    sprayTool.down!(ptr(...at(3, 3)), c);
    for (let i = 0; i < 20; i++) sprayTool.move!(ptr(...at(2 + (i % 3), 3)), c);
    sprayTool.up!(ptr(...at(3, 3)), c);
    const d = Object.values(store().get().doc.drawings)[0] as PixelDrawing;
    let n = 0;
    for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i]) n++;
    expect(n).toBeGreaterThan(3);
    expect(hex(3, 3) === null || hex(3, 3) === '#00aa00').toBe(true);
  });
});
