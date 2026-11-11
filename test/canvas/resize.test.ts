import { describe, expect, it } from 'vitest';
import type { CameraDrawing, Doc, PathShape, PixelLayer, VectorDrawing, VectorLayer } from '../../src/core/format';
import { newDoc, newPixelDrawing, newPixelLayer, newTilemapDrawing } from '../../src/core/doc';
import { anchorOffset, clampSize, pixelScaleStep, regridPixels, regridTiles, resizeCanvas, scaleArtwork, scaledSize, snapScale } from '../../src/canvas/resize';
import { rectSubPath } from '../../src/tools/shapes';
import { loadFile, saveFile } from '../../src/io/file';

const box = (id: string, x: number, y: number, w: number, h: number): PathShape => ({
  id,
  type: 'path',
  paths: [rectSubPath({ x, y, w, h })],
  fill: '#ff0000',
  stroke: { color: '#000000', width: 4, join: 'round', cap: 'round' },
  opacity: 1,
});

/** A 100 x 50 page with one square at (10, 10) on a vector layer. */
function vectorDoc(): Doc {
  const doc = newDoc({ width: 100, height: 50 });
  const layer = doc.layers[0] as VectorLayer;
  const d: VectorDrawing = { id: 'v1', kind: 'vector', shapes: [box('s1', 10, 10, 20, 20)] };
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 1, drawingId: d.id });
  return doc;
}

function pixelDoc(pixelSize: number, w = 8, h = 8): Doc {
  const doc = newDoc({ width: w * pixelSize, height: h * pixelSize, pixel: { pixelSize } });
  const layer = doc.layers[0] as PixelLayer;
  const d = newPixelDrawing(w, h);
  // One red pixel at art (1, 2).
  d.pixels.set([255, 0, 0, 255], (2 * w + 1) * 4);
  doc.drawings[d.id] = d;
  layer.cels.push({ id: 'c1', start: 0, length: 1, drawingId: d.id });
  return doc;
}

const firstShape = (doc: Doc) => (doc.drawings.v1 as VectorDrawing).shapes[0] as PathShape;
const redAt = (d: { width: number; pixels: Uint8ClampedArray }) => {
  for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i] === 255 && d.pixels[i + 3] === 255) return { x: (i / 4) % d.width, y: Math.floor(i / 4 / d.width) };
  return null;
};

describe('anchors', () => {
  it('puts the old page where the anchor says', () => {
    expect(anchorOffset(100, 50, 200, 150, 'nw')).toEqual({ dx: 0, dy: 0 });
    expect(anchorOffset(100, 50, 200, 150, 'c')).toEqual({ dx: 50, dy: 50 });
    expect(anchorOffset(100, 50, 200, 150, 'se')).toEqual({ dx: 100, dy: 100 });
    expect(anchorOffset(100, 50, 200, 150, 'n')).toEqual({ dx: 50, dy: 0 });
    expect(anchorOffset(100, 50, 200, 150, 'w')).toEqual({ dx: 0, dy: 50 });
    expect(anchorOffset(100, 50, 200, 150, 'sw')).toEqual({ dx: 0, dy: 100 });
    // Shrinking moves the other way.
    expect(anchorOffset(100, 50, 60, 30, 'se')).toEqual({ dx: -40, dy: -20 });
    expect(anchorOffset(100, 50, 60, 30, 'c')).toEqual({ dx: -20, dy: -10 });
  });

  it('keeps sizes sensible', () => {
    expect(clampSize(0)).toBe(1);
    expect(clampSize(12.6)).toBe(13);
    expect(clampSize(NaN)).toBe(1);
    expect(clampSize(1e9)).toBe(16384);
  });
});

describe('resize the canvas', () => {
  it('moves vector art with the anchor and leaves its size alone', () => {
    const doc = vectorDoc();
    const out = resizeCanvas(doc, 200, 150, 'c').doc;
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
    const p = firstShape(out).paths[0].points[0];
    expect(p).toMatchObject({ x: 60, y: 60 });
    expect(firstShape(out).stroke!.width).toBe(4);
    // The original isn't touched.
    expect(firstShape(doc).paths[0].points[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('top-left anchor moves nothing', () => {
    const doc = vectorDoc();
    const out = resizeCanvas(doc, 300, 300, 'nw').doc;
    expect(out.drawings.v1).toBe(doc.drawings.v1);
  });

  it('says when part of the drawing ends up outside', () => {
    expect(resizeCanvas(vectorDoc(), 50, 50, 'nw').notes).toContain('cropped');
    expect(resizeCanvas(vectorDoc(), 200, 200, 'nw').notes).not.toContain('cropped');
  });

  it('moves guides, motion paths, cameras and bones too', () => {
    const doc = vectorDoc();
    doc.guides = [
      { id: 'g1', axis: 'x', at: 50 },
      { id: 'g2', axis: 'y', at: 25 },
    ];
    const cam: CameraDrawing = { id: 'cam', kind: 'camera', view: { x: 50, y: 25, zoom: 1, rotation: 0 } };
    doc.drawings.cam = cam;
    doc.layers.push({ id: 'camL', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [{ id: 'cc', start: 0, length: 1, drawingId: 'cam' }] });
    doc.layers.push({ id: 'bones', name: 'Bones', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [], rig: { bones: [{ id: 'b', name: 'b', x: 5, y: 5, angle: 0, length: 10 }] } });
    (doc.layers[0] as VectorLayer).cels[0].tween = { ease: 'linear', path: { orient: false, points: [{ x: 1, y: 2 }] } };
    const out = resizeCanvas(doc, 120, 70, 'se').doc;
    expect(out.guides).toEqual([
      { id: 'g1', axis: 'x', at: 70 },
      { id: 'g2', axis: 'y', at: 45 },
    ]);
    expect((out.drawings.cam as CameraDrawing).view).toMatchObject({ x: 70, y: 45, zoom: 1 });
    const bones = out.layers.find((l) => l.id === 'bones') as VectorLayer;
    expect(bones.rig!.bones[0]).toMatchObject({ x: 25, y: 25, length: 10 });
    expect(out.layers[0].cels[0].tween!.path!.points[0]).toMatchObject({ x: 21, y: 22 });
  });

  it('moves pixel art by whole art pixels and regrows its grid', () => {
    const doc = pixelDoc(4);
    // 32 x 32 page, 8 x 8 art; grow to 48 x 40 anchored bottom right: moves 16, 8 = 4, 2 art pixels.
    const r = resizeCanvas(doc, 48, 40, 'se');
    const d = Object.values(r.doc.drawings)[0] as { width: number; height: number; pixels: Uint8ClampedArray };
    expect(d.width).toBe(12);
    expect(d.height).toBe(10);
    expect(redAt(d)).toEqual({ x: 5, y: 4 });
    expect(r.notes).not.toContain('pixel-shift');
  });

  it('notes when pixel art could not move exactly', () => {
    const doc = pixelDoc(4);
    // Centre anchor, 6 px wider: 3 px is less than an art pixel.
    expect(resizeCanvas(doc, 38, 32, 'c').notes).toContain('pixel-shift');
  });

  it('cuts pixels that fall off the page', () => {
    const doc = pixelDoc(1);
    const d = Object.values(resizeCanvas(doc, 4, 4, 'se').doc.drawings)[0] as { width: number; pixels: Uint8ClampedArray };
    expect(d.width).toBe(4);
    expect(redAt(d)).toBeNull();
  });
});

describe('regridding', () => {
  it('shifts and crops pixels', () => {
    const d = newPixelDrawing(3, 3);
    d.pixels.set([255, 0, 0, 255], 0);
    const out = regridPixels(d, 5, 5, 2, 1);
    expect(redAt(out)).toEqual({ x: 2, y: 1 });
    expect(regridPixels(d, 3, 3, 0, 0)).toBe(d);
    expect(redAt(regridPixels(d, 3, 3, -1, 0))).toBeNull();
  });

  it('shifts tiles', () => {
    const d = newTilemapDrawing(2, 2);
    d.cells[0] = 7;
    const out = regridTiles(d, 3, 3, 1, 1);
    expect(out.cells[1 * 3 + 1]).toBe(7);
    expect(out.cells.filter(Boolean).length).toBe(1);
  });
});

describe('scale the artwork', () => {
  it('scales vector art, outlines and guides with the page', () => {
    const doc = vectorDoc();
    doc.guides = [{ id: 'g', axis: 'x', at: 50 }];
    const out = scaleArtwork(doc, 200, 100).doc;
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
    expect(firstShape(out).paths[0].points[0]).toMatchObject({ x: 20, y: 20 });
    expect(firstShape(out).stroke!.width).toBeCloseTo(8);
    expect(out.guides![0].at).toBe(100);
  });

  it('can stretch vector-only art one way', () => {
    const out = scaleArtwork(vectorDoc(), 300, 50).doc;
    expect(firstShape(out).paths[0].points[0]).toMatchObject({ x: 30, y: 10 });
  });

  it('scales pixel layers by whole steps, by changing the pixel size only', () => {
    const doc = pixelDoc(1);
    expect(pixelScaleStep(doc)).toBe(1);
    // 8 x 8 asked to be 20 x 20 (2.5x): rounds to 3x.
    expect(scaledSize(doc, 20, 20)).toEqual({ w: 24, h: 24, k: 3 });
    const r = scaleArtwork(doc, 20, 20);
    expect(r.doc.width).toBe(24);
    expect((r.doc.layers[0] as PixelLayer).pixelSize).toBe(3);
    const d = Object.values(r.doc.drawings)[0] as { width: number; pixels: Uint8ClampedArray };
    // The art grid and its pixels are exactly as they were.
    expect(d.width).toBe(8);
    expect(redAt(d)).toEqual({ x: 1, y: 2 });
    expect(r.notes).toContain('rounded');
  });

  it('keeps pixel art square even when asked to stretch', () => {
    const r = scaleArtwork(pixelDoc(1), 16, 40);
    expect(r.doc.width / 8).toBe(r.doc.height / 8);
  });

  it('can shrink big art pixels in steps', () => {
    const doc = pixelDoc(4);
    doc.layers.push(newPixelLayer('Two', 6));
    expect(pixelScaleStep(doc)).toBe(2);
    expect(snapScale(0.7, 2)).toBe(0.5);
    const r = scaleArtwork(doc, 16, 16);
    expect((r.doc.layers[0] as PixelLayer).pixelSize).toBe(2);
    expect((r.doc.layers[1] as PixelLayer).pixelSize).toBe(3);
  });

  it('never scales pixel art below one step', () => {
    expect(snapScale(0.01, 1)).toBe(1);
    expect(snapScale(1.4, 0)).toBe(1.4);
  });
});

describe('guides in files', () => {
  it('round trip, and old files without them still open', () => {
    const doc = vectorDoc();
    doc.guides = [{ id: 'g1', axis: 'y', at: 12.5 }];
    expect(loadFile(saveFile(doc)).doc.guides).toEqual([{ id: 'g1', axis: 'y', at: 12.5 }]);
    expect(loadFile(saveFile(vectorDoc())).doc.guides).toBeUndefined();
  });
});
