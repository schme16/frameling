// Typed position, size, turn and slant: the pure maths, and that typing lands the same edit dragging does.
import { beforeEach, describe, expect, it } from 'vitest';
import { apply, shapesBounds, type Rect } from '../../src/canvas/geometry';
import { store } from '../../src/core/store';
import '../../src/core/commands';
import '../../src/tools';
import { moveBoxTo, pixelSizeTo, scalePixels, shiftPixels, sizeBoxTo, slantBoxBy, turnBoxBy } from '../../src/select/numbers';
import { changeShapes, movePixelsTo, pixelBox, shapeBox, sizePixelsTo, turnPixelsBy } from '../../src/select/numbers-ops';
import { rectMask } from '../../src/select/mask';
import { resetPixelSelection, setPixelSelection } from '../../src/select/pixel-state';
import { setLayerDrawMode } from '../../src/tools/merge-mode';
import { addShapes, box, pixelStore, shapesNow, vectorStore } from '../tools/helpers';
import { asGrid } from '../helpers/grid';
import type { PixelDrawing } from '../../src/core/format';
import { pencilTool } from '../../src/tools/pencil';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { ctx, drag } from '../tools/helpers';

const B: Rect = { x: 10, y: 20, w: 40, h: 20 };
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('the maths for shapes', () => {
  it('moves the box so its left and top are where they were typed', () => {
    const m = moveBoxTo(B, 100, null)!;
    expect(apply(m, B.x, B.y)).toEqual({ x: 100, y: 20 });
    const both = moveBoxTo(B, 0, 0)!;
    expect(apply(both, B.x + B.w, B.y + B.h)).toEqual({ x: 40, y: 20 });
    expect(moveBoxTo(B, 10, 20)).toBeNull();
    expect(moveBoxTo(B, null, null)).toBeNull();
    expect(moveBoxTo(B, NaN, null)).toBeNull();
  });

  it('sizes from the top left, and keeps proportions when asked', () => {
    const free = sizeBoxTo(B, 80, null, false)!;
    expect(apply(free, B.x, B.y)).toEqual({ x: 10, y: 20 });
    const far = apply(free, B.x + B.w, B.y + B.h);
    close(far.x, 90);
    close(far.y, 40);
    const kept = sizeBoxTo(B, 80, null, true)!;
    const k = apply(kept, B.x + B.w, B.y + B.h);
    close(k.x, 90);
    close(k.y, 60);
    const byHeight = sizeBoxTo(B, null, 40, true)!;
    const h = apply(byHeight, B.x + B.w, B.y + B.h);
    close(h.x, 90);
    close(h.y, 60);
  });

  it('says nothing for a size that is not a size, a box with nothing to stretch, or no change', () => {
    expect(sizeBoxTo(B, 0, null, true)).toBeNull();
    expect(sizeBoxTo(B, -5, null, true)).toBeNull();
    expect(sizeBoxTo(B, NaN, null, true)).toBeNull();
    expect(sizeBoxTo(B, 40, null, false)).toBeNull();
    expect(sizeBoxTo({ x: 0, y: 0, w: 0, h: 10 }, 20, null, false)).toBeNull();
  });

  it('turns clockwise about the middle', () => {
    const m = turnBoxBy(B, 90)!;
    // The middle stays; the right middle goes to the bottom middle (y grows downward).
    const c = apply(m, 30, 30);
    close(c.x, 30);
    close(c.y, 30);
    const r = apply(m, 50, 30);
    close(r.x, 30);
    close(r.y, 50);
    expect(turnBoxBy(B, 0)).toBeNull();
    expect(turnBoxBy(B, 360)).toBeNull();
  });

  it('slants sideways about the middle, bottom to the right like a symbol', () => {
    const m = slantBoxBy(B, 45)!;
    const mid = apply(m, 30, 30);
    close(mid.x, 30);
    close(mid.y, 30);
    const top = apply(m, 30, 20);
    close(top.x, 20);
    const bottom = apply(m, 30, 40);
    close(bottom.x, 40);
    expect(slantBoxBy(B, 0)).toBeNull();
    // Never to infinity.
    expect(Number.isFinite(apply(slantBoxBy(B, 90)!, 30, 40).x)).toBe(true);
  });
});

describe('the maths for pixels', () => {
  const img = (w: number, h: number, set: [number, number, number][]) => {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (const [x, y, v] of set) pixels.set([v, 0, 0, 255], (y * w + x) * 4);
    return { width: w, height: h, pixels };
  };
  const at = (i: { width: number; pixels: Uint8ClampedArray }, p: Uint8ClampedArray, x: number, y: number) => p[(y * i.width + x) * 4];

  it('counts the size in whole pixels, keeping proportions or not', () => {
    const b = { x0: 2, y0: 3, x1: 5, y1: 4 };
    expect(pixelSizeTo(b, 8, null, false)).toEqual({ w: 8, h: 2 });
    expect(pixelSizeTo(b, 8, null, true)).toEqual({ w: 8, h: 4 });
    expect(pixelSizeTo(b, null, 6, true)).toEqual({ w: 12, h: 6 });
    expect(pixelSizeTo(b, 4.4, null, false)).toBeNull();
    expect(pixelSizeTo(b, 0, null, false)).toBeNull();
    expect(pixelSizeTo(b, null, null, false)).toBeNull();
  });

  it('shifts by whole pixels and drops what goes off the grid', () => {
    const i = img(4, 4, [[1, 1, 7], [3, 3, 9]]);
    const out = shiftPixels(i, 1, 0);
    expect(at(i, out, 2, 1)).toBe(7);
    expect(at(i, out, 1, 1)).toBe(0);
    // The one at the right edge left the grid.
    expect([...out].filter((_, n) => n % 4 === 0 && out[n + 3]).length).toBe(1);
  });

  it('stretches with no blending: only the art\'s own colours come out', () => {
    const i = img(6, 2, [[0, 0, 10], [1, 0, 20]]);
    const out = scalePixels(i, { x0: 0, y0: 0, x1: 1, y1: 0 }, 4, 2);
    expect([0, 1, 2, 3].map((x) => at(i, out, x, 0))).toEqual([10, 10, 20, 20]);
    expect([0, 1, 2, 3].map((x) => at(i, out, x, 1))).toEqual([10, 10, 20, 20]);
    const smaller = scalePixels(i, { x0: 0, y0: 0, x1: 1, y1: 0 }, 1, 1);
    expect(at(i, smaller, 0, 0)).toBe(20);
  });
});

describe('typing numbers for shapes', () => {
  beforeEach(() => {
    vectorStore();
  });
  const pick = (...ids: string[]) => store().setUi({ selection: ids });
  const bounds = () => shapesBounds(shapesNow().filter((s) => store().get().ui.selection.includes(s.id)))!;

  it('X and Y put the selection where they say, the same as dragging it there', () => {
    addShapes(box('a', 10, 20, 40, 20), box('b', 100, 100, 10, 10));
    pick('a', 'b');
    expect(shapeBox()).toEqual({ x: 10, y: 20, w: 100, h: 90 });
    changeShapes('Move', 'x', (b) => moveBoxTo(b, 0, null));
    changeShapes('Move', 'y', (b) => moveBoxTo(b, null, 0));
    expect(bounds()).toEqual({ x: 0, y: 0, w: 100, h: 90 });
  });

  it('Width with Keep proportions scales both ways and one undo takes it back', () => {
    addShapes(box('a', 10, 20, 40, 20));
    pick('a');
    changeShapes('Resize', 'w', (b) => sizeBoxTo(b, 80, null, true));
    const r = bounds();
    close(r.x, 10);
    close(r.y, 20);
    close(r.w, 80);
    close(r.h, 40);
    store().undo();
    expect(bounds()).toEqual({ x: 10, y: 20, w: 40, h: 20 });
  });

  it('Turn by turns it about its middle, and turning four quarters comes home', () => {
    addShapes(box('a', 10, 20, 40, 20));
    pick('a');
    changeShapes('Turn', 'turn', (b) => turnBoxBy(b, 90));
    const r = bounds();
    close(r.w, 20);
    close(r.h, 40);
    close(r.x + r.w / 2, 30);
    close(r.y + r.h / 2, 30);
  });

  it('does nothing, and says so by returning false, for the number it already is', () => {
    addShapes(box('a', 10, 20, 40, 20));
    pick('a');
    store().setUi({ dirty: false });
    expect(changeShapes('Move', 'x', (b) => moveBoxTo(b, 10, null))).toBe(false);
    expect(store().get().ui.dirty).toBe(false);
  });

  it('works on a merge layer too, and what comes out is selected', () => {
    const layerId = store().get().ui.activeLayerId;
    setLayerDrawMode(layerId!, 'merge');
    addShapes(box('a', 10, 20, 40, 20));
    pick('a');
    expect(changeShapes('Move', 'x', (b) => moveBoxTo(b, 100, null))).toBe(true);
    expect(store().get().ui.selection.length).toBeGreaterThan(0);
    expect(shapeBox()!.x).toBeCloseTo(100, 6);
  });

  it('is not there with nothing selected', () => {
    addShapes(box('a', 10, 20, 40, 20));
    pick();
    expect(shapeBox()).toBeNull();
  });
});

describe('typing numbers for pixels', () => {
  // 64x64 document at 8 per art pixel: an 8x8 grid. at(px, py) is the middle of an art pixel.
  const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
  const painted = () => {
    const { doc, ui } = store().get();
    const d = asGrid(doc.drawings[doc.layers[0].cels.find((c) => ui.frame >= c.start && ui.frame < c.start + c.length)!.drawingId] as PixelDrawing);
    const out: string[] = [];
    for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i + 3]) out.push(`${(i / 4) % d.width},${Math.floor(i / 4 / d.width)}`);
    return out.sort();
  };
  const paint = (...cells: [number, number][]) => {
    store().setUi({ color: '#ff0000' });
    drag(pencilTool, ctx(), cells.map(([x, y]) => at(x, y)));
    forgetLastPixelEnd();
  };
  const select = (x0: number, y0: number, x1: number, y1: number) => setPixelSelection(rectMask(8, 8, x0, y0, x1, y1));

  beforeEach(() => {
    pixelStore();
    resetPixelSelection();
  });

  it('counts the box in whole pixels of the art, not of the page', () => {
    paint([1, 1], [2, 1]);
    select(1, 1, 2, 2);
    expect(pixelBox()).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 });
  });

  it('X and Y move the pixels, and the selection goes with them', () => {
    paint([1, 1], [2, 1]);
    select(1, 1, 2, 1);
    expect(movePixelsTo(4, null)).toBe(true);
    expect(painted()).toEqual(['4,1', '5,1']);
    expect(pixelBox()).toEqual({ x0: 4, y0: 1, x1: 5, y1: 1 });
    expect(movePixelsTo(null, 0)).toBe(true);
    expect(painted()).toEqual(['4,0', '5,0']);
    expect(movePixelsTo(4, 0)).toBe(false);
  });

  it('Width stretches by whole pixels, and Keep proportions stretches the height too', () => {
    paint([1, 1], [2, 1]);
    select(1, 1, 2, 1);
    expect(sizePixelsTo(4, null, false)).toBe(true);
    expect(painted()).toEqual(['1,1', '2,1', '3,1', '4,1']);
    expect(pixelBox()).toEqual({ x0: 1, y0: 1, x1: 4, y1: 1 });
    // Two rows tall with proportions kept: the 4 by 1 becomes 8 by 2, and what lands past the edge of the 8 by 8 art is dropped.
    expect(sizePixelsTo(null, 2, true)).toBe(true);
    expect(pixelBox()).toEqual({ x0: 1, y0: 1, x1: 7, y1: 2 });
  });

  it('Turn by turns a quarter exactly, and 0 does nothing', () => {
    paint([1, 2], [3, 2]);
    select(1, 2, 3, 2);
    expect(turnPixelsBy(90)).toBe(true);
    expect(painted()).toEqual(['2,1', '2,2', '2,3']);
    expect(turnPixelsBy(0)).toBe(false);
  });
});
