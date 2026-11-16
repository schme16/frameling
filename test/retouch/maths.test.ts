// The clone stamp's offset rules (aligned or not), and what a blur and a sharpen make of a pixel.
import { describe, expect, it } from 'vitest';
import { blurAt, blurRadius, chooseSource, copiedFrom, noAim, previewSpot, sharpenGain, sharpenOf, sharpenRadius, strokeOffset, StrokeMemo, type Reader } from '../../src/retouch/maths';
import { readerOf } from '../../src/retouch/source';

describe('choosing a source', () => {
  it('lands on whole pixels and forgets the offset of the last one', () => {
    const a = chooseSource({ x: 10.7, y: 4.2 });
    expect(a.source).toEqual({ x: 10, y: 4 });
    expect(a.offset).toBeNull();
  });
  it('has no offset with no source', () => {
    expect(strokeOffset(noAim(), { x: 3, y: 3 }, true)).toBeNull();
    expect(strokeOffset(noAim(), { x: 3, y: 3 }, false)).toBeNull();
  });
});

describe('the offset of a stroke', () => {
  const aim = chooseSource({ x: 10, y: 10 });

  it('is the gap from where you start painting to the source, on the first stroke either way', () => {
    expect(strokeOffset(aim, { x: 30, y: 12 }, true)).toEqual({ x: -20, y: -2 });
    expect(strokeOffset(aim, { x: 30, y: 12 }, false)).toEqual({ x: -20, y: -2 });
  });

  it('is kept for the next stroke when aligned, so the copy carries on in step', () => {
    const after = { ...aim, offset: { x: -20, y: -2 } };
    // A second stroke somewhere else copies from the same gap away, not from the source.
    expect(strokeOffset(after, { x: 50, y: 40 }, true)).toEqual({ x: -20, y: -2 });
    expect(copiedFrom({ x: 50, y: 40 }, { x: -20, y: -2 })).toEqual({ x: 30, y: 38 });
  });

  it('starts from the source again every stroke when it is not aligned', () => {
    const after = { ...aim, offset: { x: -20, y: -2 } };
    // The stroke starts at 50, 40, and the first pixel it paints copies the source itself.
    const o = strokeOffset(after, { x: 50, y: 40 }, false)!;
    expect(copiedFrom({ x: 50, y: 40 }, o)).toEqual({ x: 10, y: 10 });
  });

  it('copies a pixel from exactly the offset away, so the first dab of a stroke is a copy of the source', () => {
    const o = strokeOffset(aim, { x: 30.6, y: 12.9 }, true)!;
    expect(copiedFrom({ x: 30.6, y: 12.9 }, o)).toEqual({ x: 10, y: 10 });
  });
});

describe('where the ring shows before you paint', () => {
  it('is on the source when the next stroke will start there, and follows the hand when it is aligned', () => {
    const fresh = chooseSource({ x: 10, y: 10 });
    expect(previewSpot(fresh, { x: 40, y: 40 }, true)).toEqual({ x: 10, y: 10 });
    const going = { ...fresh, offset: { x: -20, y: -2 } };
    expect(previewSpot(going, { x: 50, y: 40 }, true)).toEqual({ x: 30, y: 38 });
    expect(previewSpot(going, { x: 50, y: 40 }, false)).toEqual({ x: 10, y: 10 });
    expect(previewSpot(noAim(), { x: 1, y: 1 }, true)).toBeNull();
  });
});

describe('the reader of a picture', () => {
  it('says see-through for anything off the picture', () => {
    const r = readerOf({ width: 2, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) });
    const o = new Uint8ClampedArray(4);
    r(1, 0, o);
    expect(Array.from(o)).toEqual([4, 5, 6, 255]);
    r(2, 0, o);
    expect(Array.from(o)).toEqual([0, 0, 0, 0]);
    r(-1, 0, o);
    expect(Array.from(o)).toEqual([0, 0, 0, 0]);
  });
});

/** A reader over a grid written as rows: '#' is solid black, 'w' solid white, '.' clear. */
function grid(rows: string[]): { read: Reader; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((r, y) => [...r].forEach((c, x) => px.set(c === '#' ? [0, 0, 0, 255] : c === 'w' ? [255, 255, 255, 255] : [0, 0, 0, 0], (y * w + x) * 4)));
  return { read: readerOf({ width: w, height: h, pixels: px }), w, h };
}

describe('blur', () => {
  it('turns a hard edge into a step between the two sides', () => {
    const g = grid(['wwww####', 'wwww####', 'wwww####', 'wwww####', 'wwww####']);
    const o = new Uint8ClampedArray(4);
    blurAt(g.read, g.w, g.h, 3, 2, 1, o);
    // The white pixel next to the edge picks up a third of the dark: 255 * 2/3.
    expect(o[0]).toBeGreaterThan(150);
    expect(o[0]).toBeLessThan(200);
    expect(o[3]).toBe(255);
    blurAt(g.read, g.w, g.h, 1, 2, 1, o);
    expect(o[0]).toBe(255);
  });

  it('leaves a flat colour as it is', () => {
    const g = grid(['wwww', 'wwww', 'wwww']);
    const o = new Uint8ClampedArray(4);
    blurAt(g.read, g.w, g.h, 1, 1, 3, o);
    expect(Array.from(o)).toEqual([255, 255, 255, 255]);
  });

  it('softens the edge of a shape without dragging dark into it: the colour stays, the see-through fades', () => {
    const g = grid(['....', '.ww.', '.ww.', '....']);
    const o = new Uint8ClampedArray(4);
    blurAt(g.read, g.w, g.h, 0, 1, 1, o);
    // Only white pixels have any colour to give, so it is white, a little see-through.
    expect([o[0], o[1], o[2]]).toEqual([255, 255, 255]);
    expect(o[3]).toBeGreaterThan(0);
    expect(o[3]).toBeLessThan(255);
  });

  it('gives clear for a clear patch', () => {
    const g = grid(['....', '....']);
    const o = new Uint8ClampedArray([9, 9, 9, 9]);
    blurAt(g.read, g.w, g.h, 1, 0, 2, o);
    expect(Array.from(o)).toEqual([0, 0, 0, 0]);
  });

  it('keeps to the picture: a pixel in the corner is not dragged toward clear by the space past the edge', () => {
    const g = grid(['ww', 'ww']);
    const o = new Uint8ClampedArray(4);
    blurAt(g.read, g.w, g.h, 0, 0, 4, o);
    expect(Array.from(o)).toEqual([255, 255, 255, 255]);
  });

  it('reaches further the more you ask for, from one pixel to six', () => {
    expect(blurRadius(0.05)).toBe(1);
    expect(blurRadius(0.5)).toBeGreaterThan(blurRadius(0.05));
    expect(blurRadius(1)).toBe(6);
    expect(blurRadius(5)).toBe(6);
  });
});

describe('sharpen', () => {
  it('pushes a pixel away from the average round it, and clamps to the colour range', () => {
    const o = new Uint8ClampedArray(4);
    sharpenOf([120, 120, 120, 255], [100, 100, 100, 255], 1, o);
    expect(Array.from(o)).toEqual([140, 140, 140, 255]);
    sharpenOf([250, 10, 120, 255], [100, 100, 100, 255], 3, o);
    expect(Array.from(o)).toEqual([255, 0, 180, 255]);
  });

  it('does nothing where there is nothing to push away from, or nothing there', () => {
    const o = new Uint8ClampedArray(4);
    sharpenOf([80, 80, 80, 255], [80, 80, 80, 255], 3, o);
    expect(Array.from(o)).toEqual([80, 80, 80, 255]);
    sharpenOf([5, 6, 7, 0], [100, 100, 100, 255], 3, o);
    expect(Array.from(o)).toEqual([5, 6, 7, 0]);
  });

  it('keeps the see-through it had', () => {
    const o = new Uint8ClampedArray(4);
    sharpenOf([100, 100, 100, 128], [90, 90, 90, 128], 1, o);
    expect(o[3]).toBe(128);
  });

  it('is stronger for a higher amount, and looks wider for a strong one', () => {
    expect(sharpenGain(1)).toBeGreaterThan(sharpenGain(0.3));
    expect(sharpenGain(0)).toBe(0);
    expect(sharpenRadius(0.3)).toBe(1);
    expect(sharpenRadius(1)).toBe(2);
  });
});

describe('the memory of a stroke', () => {
  it('works a pixel out once, however many dabs reach it', () => {
    const m = new StrokeMemo(10);
    let calls = 0;
    const out = new Uint8ClampedArray(4);
    for (let i = 0; i < 5; i++) m.get(3, 4, (t) => { calls++; t.set([200, 100, 50, 255]); }, out);
    expect(calls).toBe(1);
    expect(Array.from(out)).toEqual([200, 100, 50, 255]);
    m.get(4, 4, (t) => { calls++; t.set([1, 2, 3, 4]); }, out);
    expect(calls).toBe(2);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });
});
