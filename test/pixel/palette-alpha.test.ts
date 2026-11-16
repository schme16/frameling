// A palette colour can be see-through (#rrggbbaa). What that means for the palette lock, reducing to the palette, and
// changing a palette colour; and that a plain six digit palette behaves exactly as it always did.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, DocPalette, PixelDrawing } from '../../src/core/format';
import { readPalette } from '../../src/io/file';
import { changePaletteColor, setDocPalette } from '../../src/pixel/commands';
import { lockedInk, snapToPalette, solidInk } from '../../src/pixel/ink';
import { docPalette, paletteAlpha, paletteRgb, reduceToPalette } from '../../src/pixel/palette';
import { LOCKED_WHY, paletteLockedNow } from '../../src/pixel/colourRules';
import { resetStore, store } from '../../src/core/store';

const SOLID: DocPalette = { name: 'Plain', colors: ['#ff0000', '#00ff00', '#0000ff'] };
const GLASS: DocPalette = { name: 'Glass', colors: ['#ff0000', '#00ff0080', '#0000ff'] };

describe('how solid each palette colour is', () => {
  it('a six digit colour is solid, an eight digit one carries its amount', () => {
    expect([...paletteAlpha(SOLID.colors)]).toEqual([255, 255, 255]);
    expect([...paletteAlpha(GLASS.colors)]).toEqual([255, 128, 255]);
  });

  it('the colour matching still looks at the colour part only', () => {
    expect([...paletteRgb(GLASS.colors)].slice(3, 6)).toEqual([0, 255, 0]);
  });
});

describe('the palette lock', () => {
  const paint = (ink: ReturnType<typeof lockedInk>) => {
    const out = new Uint8Array(4);
    ink.color(0, 0, new Uint8ClampedArray(4), 0, out);
    return [...out];
  };

  it('a plain palette snaps every pixel to a solid colour, as before', () => {
    expect(paint(lockedInk(solidInk([10, 240, 10, 100]), SOLID))).toEqual([0, 255, 0, 255]);
    expect(snapToPalette([250, 5, 5, 40], SOLID)).toEqual([255, 0, 0, 255]);
  });

  it('a see-through palette colour paints at its own opacity, whatever you were painting with', () => {
    expect(paint(lockedInk(solidInk([10, 240, 10, 255]), GLASS))).toEqual([0, 255, 0, 128]);
    expect(paint(lockedInk(solidInk([10, 240, 10, 30]), GLASS))).toEqual([0, 255, 0, 128]);
    expect(snapToPalette([10, 240, 10, 255], GLASS)).toEqual([0, 255, 0, 128]);
    // The solid colours next to it are untouched.
    expect(snapToPalette([250, 5, 5, 255], GLASS)).toEqual([255, 0, 0, 255]);
  });

  it('clearing stays clearing', () => {
    expect(paint(lockedInk(solidInk([0, 0, 0, 0]), GLASS))).toEqual([0, 0, 0, 0]);
    expect(snapToPalette([0, 0, 0, 0], GLASS)).toEqual([0, 0, 0, 0]);
  });
});

describe('reducing a picture to the palette', () => {
  const pic = new Uint8ClampedArray([10, 240, 10, 255, 250, 5, 5, 255, 5, 5, 250, 20]);
  it('a plain palette makes every kept pixel solid, and drops the faint ones', () => {
    const r = reduceToPalette(pic, paletteRgb(SOLID.colors));
    expect([...r.pixels]).toEqual([0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0]);
  });

  it('a see-through palette colour gives its pixels that opacity', () => {
    const r = reduceToPalette(pic, paletteRgb(GLASS.colors), paletteAlpha(GLASS.colors));
    expect([...r.pixels]).toEqual([0, 255, 0, 128, 255, 0, 0, 255, 0, 0, 0, 0]);
    expect(r.changed).toBe(3);
  });
});

describe('reading a file', () => {
  it('keeps a see-through palette colour and leaves six digit ones as they were', () => {
    const p = readPalette({ name: 'Mixed', colors: ['#ff0000', '#00FF0080', '#nope', '#12345678'] }).palette!;
    expect(p.colors).toEqual(['#ff0000', '#00FF0080', '#12345678']);
  });
});

describe('changing a palette colour', () => {
  let drawingId = '';
  beforeEach(() => {
    resetStore(newDoc({ pixel: { pixelSize: 8 } }));
    const d = newPixelDrawing(4, 1);
    drawingId = d.id;
    store().update('Set up', (doc) => {
      (doc as Doc).drawings[d.id] = d;
      (doc as Doc).layers[0].cels = [{ id: 'c1', start: 0, length: 1, drawingId: d.id }];
      (doc.drawings[d.id] as PixelDrawing).pixels.set([255, 0, 0, 255]);
    });
    setDocPalette(SOLID, 'Palette');
  });

  it('only changing the opacity needs no question and leaves the painted pixels alone', () => {
    changePaletteColor(0, '#ff000080');
    expect(docPalette(store().get().doc).colors[0]).toBe('#ff000080');
    expect([...(store().get().doc.drawings[drawingId] as PixelDrawing).pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('putting the opacity back to 100% writes the plain six digit colour again', () => {
    changePaletteColor(0, '#ff000080');
    changePaletteColor(0, '#ff0000');
    expect(docPalette(store().get().doc).colors[0]).toBe('#ff0000');
  });
});

describe('what the picker says on a locked layer', () => {
  it('says to change the opacity on the palette colour', () => {
    expect(LOCKED_WHY).toMatch(/Palette panel/);
    expect(LOCKED_WHY).not.toMatch(/—/);
    resetStore(newDoc({ pixel: { pixelSize: 8 } }));
    expect(paletteLockedNow(store().get())).toBe(false);
    store().update('Lock', (d) => void ((d.layers[d.layers.length - 1] as { paletteLock?: boolean }).paletteLock = true));
    store().setUi({ activeLayerId: store().get().doc.layers[store().get().doc.layers.length - 1].id });
    expect(paletteLockedNow(store().get())).toBe(true);
  });
});
