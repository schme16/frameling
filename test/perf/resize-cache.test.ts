// A resize of the canvas (switching workspace, opening a panel) must not throw away the layer bitmaps: they are made for
// the stage's size on screen, so a view that keeps its zoom finds them all still good, and going back to a size seen a
// moment ago finds them too. Counted builds and hits against the fake canvas, never time.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FramePainter, KEEP_OTHER_SCALES, type FrameParams } from '../../src/canvas/pipeline';
import { DEFAULT_BRUSH, newDoc, newVectorLayer, uid } from '../../src/core/doc';
import type { Doc, StrokeShape, VectorDrawing } from '../../src/core/format';
import { installFakeCanvas, mainCtx, removeFakeCanvas, resetCounts } from './fakeCanvas';

beforeAll(installFakeCanvas);
afterAll(removeFakeCanvas);
beforeEach(resetCounts);

const stroke = (i: number): StrokeShape => ({
  id: uid('sh'),
  type: 'stroke',
  points: [
    { x: i, y: 0, p: 0.5 },
    { x: i + 9, y: 20, p: 0.5 },
  ],
  brush: { ...DEFAULT_BRUSH },
  color: '#000000',
  opacity: 1,
});

function makeDoc(layers: number): Doc {
  const doc = newDoc({ width: 400, height: 300, length: 1 });
  doc.layers = [];
  for (let l = 0; l < layers; l++) {
    const layer = newVectorLayer('L' + l);
    const d: VectorDrawing = { id: uid('dr'), kind: 'vector', shapes: [stroke(l), stroke(l + 3)] };
    doc.drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start: 0, length: 1, drawingId: d.id });
    doc.layers.push(layer);
  }
  return doc;
}

const at = (doc: Doc, w: number, h: number): FrameParams => ({
  doc,
  frame: 0,
  rect: { x: 10, y: 10, w, h },
  width: w + 20,
  height: h + 20,
  live: null,
  onion: { enabled: false, before: 2, after: 1, opacity: 0.35, beforeColor: '#f00', afterColor: '#0f0', tint: true },
  playing: false,
  zooming: false,
});

describe('resizing the canvas', () => {
  it('keeps the layer bitmaps, so a view that keeps its stage size rebuilds nothing', () => {
    const doc = makeDoc(3);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, at(doc, 400, 300));
    expect(p.cache.builds).toBe(3);
    p.resized();
    p.paint(g, at(doc, 400, 300));
    expect(p.cache.builds).toBe(3);
    expect(p.cache.hits).toBe(3);
  });

  it('a full clear still throws everything away', () => {
    const doc = makeDoc(2);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, at(doc, 400, 300));
    p.clear();
    p.paint(g, at(doc, 400, 300));
    expect(p.cache.builds).toBe(4);
  });

  it('going back to the size just left finds its bitmaps', () => {
    const doc = makeDoc(3);
    const p = new FramePainter();
    const g = mainCtx();
    const sizes: [number, number][] = [[400, 300], [500, 375], [320, 240], [400, 300], [500, 375]];
    for (const [w, h] of sizes) {
      p.resized();
      p.paint(g, at(doc, w, h));
    }
    // Three sizes are made once (9 bitmaps); the two returns are all hits.
    expect(p.cache.builds).toBe(9);
    expect(p.cache.hits).toBe(6);
  });

  it('keeps only a few other sizes per drawing', () => {
    const doc = makeDoc(1);
    const p = new FramePainter();
    const g = mainCtx();
    const n = KEEP_OTHER_SCALES + 4;
    for (let i = 0; i < n; i++) p.paint(g, at(doc, 400 + i * 20, 300 + i * 15));
    expect(p.cache.size.entries).toBe(KEEP_OTHER_SCALES + 1);
    // The newest size is the one that stays crisp: painting it again is a hit.
    p.paint(g, at(doc, 400 + (n - 1) * 20, 300 + (n - 1) * 15));
    expect(p.cache.hits).toBe(1);
  });
});
