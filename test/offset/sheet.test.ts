import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { docToSheet } from '../../scripts/mascot/sheet';
import { blendOnto } from '../../src/effects/blendPure';

const W = 4;

/** A pixel layer with one drawing: a list of [x, y, rgba] dots, held for `length` frames. */
function addLayer(doc: Doc, name: string, dots: [number, number, number[]][], opts: Partial<PixelLayer> = {}, length = doc.length): PixelLayer {
  const l = { ...newPixelLayer(name, 1), ...opts };
  const d = newPixelDrawing(W, W);
  for (const [x, y, c] of dots) d.pixels.set(c, (y * W + x) * 4);
  doc.drawings[d.id] = d;
  l.cels.push({ id: `${name}-c`, start: 0, length, drawingId: d.id });
  doc.layers.push(l);
  return l;
}

const blank = () => {
  const doc = newDoc({ width: W, height: W, length: 1, background: null });
  doc.layers = [];
  return doc;
};

/** The first tile's pixel at x, y. */
function pixel(doc: Doc, x: number, y: number, tile = 0): number[] {
  const { image } = docToSheet(doc);
  const at = ((Math.floor(tile / 8) * W + y) * image.width + (tile % 8) * W + x) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

describe('the sheet builder and folders', () => {
  const RED = [255, 0, 0, 255];
  const BLUE = [0, 0, 255, 255];

  it('fades a folder as one picture, so its layers do not show through each other', () => {
    const doc = blank();
    addLayer(doc, 'a', [[0, 0, RED]], { folder: 'f' });
    addLayer(doc, 'b', [[0, 0, BLUE]], { folder: 'f' });
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 0.5 } };
    // Blue covers red, then the pair fades once: blue at half strength, nothing of the red.
    expect(pixel(doc, 0, 0)).toEqual([0, 0, 255, 128]);
  });

  it('a plain folder changes nothing', () => {
    const doc = blank();
    addLayer(doc, 'a', [[0, 0, RED]], { folder: 'f' });
    addLayer(doc, 'b', [[1, 0, BLUE]], { folder: 'f' });
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 1 } };
    expect(pixel(doc, 0, 0)).toEqual(RED);
    expect(pixel(doc, 1, 0)).toEqual(BLUE);
  });

  it('applies a folder\'s blend mode to what is under it', () => {
    const doc = blank();
    addLayer(doc, 'under', [[0, 0, [200, 100, 50, 255]]]);
    addLayer(doc, 'over', [[0, 0, [128, 128, 128, 255]]], { folder: 'f' });
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 1, blend: 'multiply' } };
    const [r, g, b, a] = pixel(doc, 0, 0);
    expect([r, g, b, a]).toEqual([Math.round((200 * 128) / 255), Math.round((100 * 128) / 255), Math.round((50 * 128) / 255), 255]);
  });

  it('applies a layer\'s own blend mode too, and folders inside folders', () => {
    const doc = blank();
    addLayer(doc, 'under', [[0, 0, [200, 100, 50, 255]]]);
    addLayer(doc, 'over', [[0, 0, [128, 128, 128, 255]]], { blend: 'multiply', folder: 'inner' });
    doc.folders = { outer: { id: 'outer', name: 'O', visible: true, opacity: 1 }, inner: { id: 'inner', name: 'I', visible: true, opacity: 1, parent: 'outer' } };
    doc.layers[1].folder = 'inner';
    expect(pixel(doc, 0, 0)[0]).toBe(Math.round((200 * 128) / 255));
  });

  it('still leaves out a hidden folder and a hidden layer', () => {
    const doc = blank();
    addLayer(doc, 'a', [[0, 0, RED]], { folder: 'f' });
    addLayer(doc, 'b', [[1, 0, BLUE]], { visible: false });
    doc.folders = { f: { id: 'f', name: 'F', visible: false, opacity: 1 } };
    expect(pixel(doc, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(doc, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it('says what it does not apply instead of quietly differing from the canvas', () => {
    const doc = blank();
    addLayer(doc, 'glow', [[0, 0, RED]], { effects: [{ id: 'e', kind: 'blur', on: true, values: {} } as never] });
    addLayer(doc, 'clipped', [[0, 0, RED]], { clipToBelow: true });
    const { warnings } = docToSheet(doc);
    expect(warnings.some((w) => /glow.*effects/.test(w))).toBe(true);
    expect(warnings.some((w) => /clipped.*clipping/.test(w))).toBe(true);
  });
});

describe('the sheet builder and moved drawings', () => {
  it('draws a moved drawing in its new place', () => {
    const doc = blank();
    const l = addLayer(doc, 'a', [[0, 0, [255, 0, 0, 255]]]);
    l.cels[0].offset = { x: 2, y: 1 };
    expect(pixel(doc, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(doc, 2, 1)).toEqual([255, 0, 0, 255]);
  });

  it('one drawing in three places is three pictures; the same place twice is one', () => {
    const doc = newDoc({ width: W, height: W, length: 4, background: null });
    doc.layers = [];
    const l = addLayer(doc, 'a', [[0, 0, [255, 0, 0, 255]]], {}, 1);
    const drawingId = l.cels[0].drawingId;
    l.cels = [
      { id: 'k0', start: 0, length: 1, drawingId },
      { id: 'k1', start: 1, length: 1, drawingId, offset: { x: 1, y: 0 } },
      { id: 'k2', start: 2, length: 1, drawingId },
      { id: 'k3', start: 3, length: 1, drawingId, offset: { x: 1, y: 0 } },
    ];
    const { meta, image } = docToSheet(doc);
    const frames = meta.anims.idle.frames;
    expect(frames).toHaveLength(4);
    expect(new Set(frames.map((f) => `${f.x},${f.y}`)).size).toBe(2);
    expect(image.width / W).toBeGreaterThanOrEqual(2);
  });

  it('a shift off the edge loses what slides off and nothing wraps round', () => {
    const doc = blank();
    const l = addLayer(doc, 'a', [[3, 3, [255, 0, 0, 255]], [0, 0, [0, 255, 0, 255]]]);
    l.cels[0].offset = { x: 1, y: 0 };
    expect(pixel(doc, 0, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(doc, 1, 0)).toEqual([0, 255, 0, 255]);
    l.cels[0].offset = { x: -9, y: 9 };
    expect(pixel(doc, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('every blend mode on plain bytes', () => {
  const mix = (mode: Parameters<typeof blendOnto>[2], b: number[], s: number[], alpha = 1) => {
    const dst = Uint8ClampedArray.from(b);
    blendOnto(dst, Uint8ClampedArray.from(s), mode, alpha);
    return [...dst];
  };
  it('matches the W3C formulas on opaque colours', () => {
    expect(mix('multiply', [200, 100, 50, 255], [128, 128, 128, 255])).toEqual([100, 50, 25, 255]);
    expect(mix('screen', [100, 100, 100, 255], [100, 100, 100, 255])).toEqual([161, 161, 161, 255]);
    expect(mix('darken', [10, 200, 50, 255], [100, 100, 100, 255])).toEqual([10, 100, 50, 255]);
    expect(mix('lighten', [10, 200, 50, 255], [100, 100, 100, 255])).toEqual([100, 200, 100, 255]);
    expect(mix('difference', [10, 200, 50, 255], [100, 100, 100, 255])).toEqual([90, 100, 50, 255]);
    expect(mix('exclusion', [255, 0, 0, 255], [255, 255, 255, 255])).toEqual([0, 255, 255, 255]);
    expect(mix('overlay', [64, 64, 64, 255], [128, 128, 128, 255])[0]).toBe(64);
    expect(mix('hard-light', [100, 100, 100, 255], [255, 255, 255, 255])).toEqual([255, 255, 255, 255]);
    expect(mix('color-dodge', [0, 0, 0, 255], [255, 255, 255, 255])).toEqual([0, 0, 0, 255]);
    expect(mix('color-burn', [255, 255, 255, 255], [0, 0, 0, 255])).toEqual([255, 255, 255, 255]);
    expect(mix('add', [100, 100, 100, 255], [200, 100, 0, 255])).toEqual([255, 200, 100, 255]);
  });
  it('luminosity keeps the colour under and takes the light of the one over', () => {
    const [r, g, b] = mix('luminosity', [255, 0, 0, 255], [128, 128, 128, 255]);
    expect(r).toBeGreaterThan(g);
    expect(Math.round(0.3 * r + 0.59 * g + 0.11 * b)).toBeGreaterThanOrEqual(126);
    expect(Math.round(0.3 * r + 0.59 * g + 0.11 * b)).toBeLessThanOrEqual(130);
  });
  it('leaves the colour under alone where there is nothing over it, and takes it where there is nothing under', () => {
    expect(mix('multiply', [10, 20, 30, 255], [99, 99, 99, 0])).toEqual([10, 20, 30, 255]);
    expect(mix('multiply', [0, 0, 0, 0], [99, 80, 70, 255])).toEqual([99, 80, 70, 255]);
  });
  it('hands the three pixel-only modes to their own code', () => {
    expect(mix('subtract', [200, 200, 200, 255], [50, 100, 250, 255])).toEqual([150, 100, 0, 255]);
  });
});
