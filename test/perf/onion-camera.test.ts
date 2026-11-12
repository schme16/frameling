// Onion skin stays on while looking through the camera, and goes through it (each layer by its own depth).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FramePainter, type FrameParams } from '../../src/canvas/pipeline';
import { DEFAULT_BRUSH, newDoc, newVectorLayer, uid } from '../../src/core/doc';
import type { Doc, VectorDrawing } from '../../src/core/format';
import { counts, installFakeCanvas, mainCtx, removeFakeCanvas, resetCounts } from './fakeCanvas';

beforeAll(installFakeCanvas);
afterAll(removeFakeCanvas);
beforeEach(resetCounts);

function makeDoc(frames: number): Doc {
  const doc = newDoc({ width: 400, height: 300, length: frames });
  doc.layers = [];
  const layer = newVectorLayer('L');
  for (let f = 0; f < frames; f++) {
    const d: VectorDrawing = {
      id: uid('dr'),
      kind: 'vector',
      shapes: [{ id: uid('sh'), type: 'stroke', points: [{ x: f, y: 0, p: 0.5 }, { x: f + 9, y: 20, p: 0.5 }], brush: { ...DEFAULT_BRUSH }, color: '#000000', opacity: 1 }],
    };
    doc.drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start: f, length: 1, drawingId: d.id });
  }
  doc.layers.push(layer);
  return doc;
}

const params = (doc: Doc, over: Partial<FrameParams> = {}): FrameParams => ({
  doc,
  frame: 1,
  rect: { x: 10, y: 10, w: 400, h: 300 },
  width: 800,
  height: 600,
  live: null,
  onion: { enabled: true, before: 1, after: 1, opacity: 0.35, beforeColor: '#f00', afterColor: '#0f0', tint: true },
  playing: false,
  zooming: false,
  ...over,
});

describe('onion skin through the camera', () => {
  it('draws the ghost frames as well as the current one', () => {
    const doc = makeDoc(3);
    const p = new FramePainter();
    p.paint(mainCtx(), params(doc, { camera: { x: 200, y: 150, zoom: 2, rotation: 0 } }));
    // The frame before, the frame after, and this one.
    expect(counts.fills).toBe(3);
  });

  it('shows nothing extra when the onion skin is off, or while playing', () => {
    const doc = makeDoc(3);
    const cam = { x: 200, y: 150, zoom: 2, rotation: 0 };
    new FramePainter().paint(mainCtx(), params(doc, { camera: cam, onion: { ...params(doc).onion, enabled: false } }));
    expect(counts.fills).toBe(1);
    resetCounts();
    new FramePainter().paint(mainCtx(), params(doc, { camera: cam, playing: true }));
    expect(counts.fills).toBe(1);
  });

  it('a camera that changes nothing (zoom 1, centred) still shows the onion skin as before', () => {
    const doc = makeDoc(3);
    new FramePainter().paint(mainCtx(), params(doc, { camera: { x: 200, y: 150, zoom: 1, rotation: 0 } }));
    expect(counts.fills).toBe(3);
  });

  it('keeps the ghost frames as bitmaps: a repaint with the same camera redraws only the current frame', () => {
    const doc = makeDoc(3);
    const p = new FramePainter();
    const cam = { x: 200, y: 150, zoom: 2, rotation: 0 };
    p.paint(mainCtx(), params(doc, { camera: cam }));
    expect(counts.fills).toBe(3);
    resetCounts();
    p.paint(mainCtx(), params(doc, { camera: { ...cam } }));
    expect(counts.fills).toBe(1);
  });

  it('builds the ghosts again when the camera, the zoom or the frame changes', () => {
    const doc = makeDoc(4);
    const p = new FramePainter();
    const cam = { x: 200, y: 150, zoom: 2, rotation: 0 };
    p.paint(mainCtx(), params(doc, { camera: cam }));
    resetCounts();
    p.paint(mainCtx(), params(doc, { camera: { ...cam, x: 260 } }));
    expect(counts.fills).toBe(3);
    resetCounts();
    p.paint(mainCtx(), params(doc, { camera: { ...cam, x: 260 }, rect: { x: 10, y: 10, w: 300, h: 225 } }));
    expect(counts.fills).toBe(3);
    resetCounts();
    // One frame on, the neighbours are other drawings (the frame ahead is new; the one behind was the current one).
    p.paint(mainCtx(), params(doc, { camera: { ...cam, x: 260 }, rect: { x: 10, y: 10, w: 300, h: 225 }, frame: 2 }));
    expect(counts.fills).toBe(3);
  });
});

describe('the light table and the empty frame ghost through the camera', () => {
  const cam = { x: 200, y: 150, zoom: 2, rotation: 0 };
  const off = (doc: Doc) => ({ ...params(doc).onion, enabled: false });

  it('show faintly through the camera instead of hiding', () => {
    const doc = makeDoc(3);
    const layer = doc.layers[0];
    const pinned = doc.drawings[layer.cels[0].drawingId];
    const items = [{ drawing: pinned, pixelSize: 1, layerId: layer.id }];
    new FramePainter().paint(mainCtx(), params(doc, { camera: cam, onion: off(doc), lightTable: { items, alpha: 0.3, tint: null } }));
    expect(counts.fills).toBe(2);
    resetCounts();
    new FramePainter().paint(mainCtx(), params(doc, { camera: cam, onion: off(doc), ghost: items }));
    expect(counts.fills).toBe(2);
  });

  it('are cached too, and follow a camera change', () => {
    const doc = makeDoc(3);
    const layer = doc.layers[0];
    const items = [{ drawing: doc.drawings[layer.cels[0].drawingId], pixelSize: 1, layerId: layer.id }];
    const p = new FramePainter();
    const at = (c: typeof cam) => params(doc, { camera: c, onion: off(doc), lightTable: { items, alpha: 0.3, tint: null } });
    p.paint(mainCtx(), at(cam));
    resetCounts();
    p.paint(mainCtx(), at({ ...cam }));
    expect(counts.fills).toBe(1);
    resetCounts();
    p.paint(mainCtx(), at({ ...cam, zoom: 3 }));
    expect(counts.fills).toBe(2);
  });

  it('go through the camera by their own layer depth', () => {
    const doc = makeDoc(3);
    const layer = doc.layers[0];
    layer.depth = 1;
    const items = [{ drawing: doc.drawings[layer.cels[0].drawingId], pixelSize: 1, layerId: layer.id }];
    const p = new FramePainter();
    p.paint(mainCtx(), params(doc, { camera: cam, onion: off(doc), ghost: items }));
    resetCounts();
    layer.depth = 2;
    p.paint(mainCtx(), params(doc, { camera: cam, onion: off(doc), ghost: items }));
    // A different depth is a different matrix, so the ghost is built again.
    expect(counts.fills).toBe(2);
  });
});
