// Cheap, deterministic checks that the canvas does no more drawing than it has to. They count bitmap builds, cache
// hits and fills against a counting fake canvas, never wall-clock time.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FramePainter, BUDGET_PIXELS, type FrameParams } from '../../src/canvas/pipeline';
import { DEFAULT_BRUSH, newDoc, newVectorLayer, uid } from '../../src/core/doc';
import type { Doc, Layer, PathShape, StrokeShape, VectorDrawing } from '../../src/core/format';
import { drawLayerAt, fadeStats } from '../../src/core/render';
import { neighbourFrames, upcomingFrames } from '../../src/timeline/playback';
import { counts, installFakeCanvas, mainCtx, removeFakeCanvas, resetCounts } from './fakeCanvas';

beforeAll(installFakeCanvas);
afterAll(removeFakeCanvas);
beforeEach(resetCounts);

const stroke = (i: number): StrokeShape => ({
  id: uid('sh'),
  type: 'stroke',
  points: [
    { x: i, y: 0, p: 0.5 },
    { x: i + 5, y: 9, p: 0.5 },
    { x: i + 9, y: 20, p: 0.5 },
  ],
  brush: { ...DEFAULT_BRUSH },
  color: '#000000',
  opacity: 1,
});

/** A shape reaching from corner to corner of the 400 x 300 test stage. */
const spanning = (): PathShape[] => [
  { id: uid('sh'), type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }], fill: '#123456', stroke: null, opacity: 1 },
];

/** frames x layers, each cel a different drawing of `n` strokes. */
function makeDoc(frames: number, layers = 1, n = 5): Doc {
  const doc = newDoc({ width: 400, height: 300, length: frames });
  doc.layers = [];
  for (let l = 0; l < layers; l++) {
    const layer = newVectorLayer('L' + l);
    for (let f = 0; f < frames; f++) {
      const d: VectorDrawing = { id: uid('dr'), kind: 'vector', shapes: Array.from({ length: n }, (_, i) => stroke(i + f)) };
      doc.drawings[d.id] = d;
      layer.cels.push({ id: uid('c'), start: f, length: 1, drawingId: d.id });
    }
    doc.layers.push(layer);
  }
  return doc;
}

const params = (doc: Doc, frame: number, over: Partial<FrameParams> = {}): FrameParams => ({
  doc,
  frame,
  rect: { x: 10, y: 10, w: 400, h: 300 },
  width: 800,
  height: 600,
  live: null,
  onion: { enabled: false, before: 2, after: 1, opacity: 0.35, beforeColor: '#f00', afterColor: '#0f0', tint: true },
  playing: false,
  zooming: false,
  ...over,
});

describe('bitmap cache', () => {
  it('rasterises a drawing once however many times the frame is painted', () => {
    const doc = makeDoc(3);
    const p = new FramePainter();
    const g = mainCtx();
    for (let i = 0; i < 20; i++) p.paint(g, params(doc, 1));
    expect(p.cache.builds).toBe(1);
    expect(p.cache.hits).toBe(19);
  });

  it('a new stroke on top of a cached drawing draws only that stroke', () => {
    const doc = makeDoc(1, 1, 40);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, params(doc, 0));
    expect(counts.fills).toBe(40);
    resetCounts();
    // What an edit leaves behind: a new drawing object that shares every old shape and has one more.
    const layer = doc.layers[0];
    const old = doc.drawings[layer.cels[0].drawingId] as VectorDrawing;
    const grown: VectorDrawing = { ...old, shapes: [...old.shapes, stroke(99)] };
    const doc2: Doc = { ...doc, drawings: { ...doc.drawings, [grown.id]: grown } };
    p.paint(g, params(doc2, 0));
    expect(p.cache.builds).toBe(2);
    expect(p.cache.appends).toBe(1);
    expect(counts.fills).toBe(1);
  });

  it('a changed drawing (not just grown) is rasterised in full', () => {
    const doc = makeDoc(1, 1, 10);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, params(doc, 0));
    resetCounts();
    const old = doc.drawings[doc.layers[0].cels[0].drawingId] as VectorDrawing;
    const edited: VectorDrawing = { ...old, shapes: [stroke(77), ...old.shapes.slice(1), stroke(78)] };
    p.paint(g, params({ ...doc, drawings: { ...doc.drawings, [edited.id]: edited } }, 0));
    expect(p.cache.appends).toBe(0);
    expect(counts.fills).toBe(11);
  });

  it('keeps inside its memory budget by dropping the oldest bitmaps', () => {
    const doc = makeDoc(8);
    // Each frame's drawing spans the whole stage, so each bitmap is a whole frame.
    for (const d of Object.values(doc.drawings)) if (d.kind === 'vector') d.shapes.push(...spanning());
    const p = new FramePainter();
    const g = mainCtx();
    // 3000x3000 stage bitmaps: only a few fit in 40M pixels.
    const big = { rect: { x: 0, y: 0, w: 3000, h: 3000 }, width: 3200, height: 3200 };
    for (let f = 0; f < 8; f++) p.paint(g, params(doc, f, big));
    expect(p.cache.size.pixels).toBeLessThanOrEqual(BUDGET_PIXELS);
    expect(p.cache.evictions).toBeGreaterThan(0);
    // The newest frames survived, the oldest did not.
    resetCounts();
    p.paint(g, params(doc, 7, big));
    expect(counts.fills).toBe(0);
    p.paint(g, params(doc, 0, big));
    expect(counts.fills).toBeGreaterThan(0);
  });
});

describe('cropped bitmaps', () => {
  it('makes a layer bitmap only as big as its drawing', () => {
    const doc = makeDoc(1, 1, 3);
    const p = new FramePainter();
    p.paint(mainCtx(), params(doc, 0));
    const small = p.cache.size.pixels;
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(0.1 * 400 * 300);
    // The old way, for comparison: a whole frame.
    const full = new FramePainter();
    full.cache.crop = false;
    full.paint(mainCtx(), params(doc, 0));
    expect(full.cache.size.pixels).toBe(400 * 300);
  });

  it('keeps a whole frame for drawings whose reach is not known', () => {
    const doc = makeDoc(1, 1, 1);
    const d = Object.values(doc.drawings)[0] as VectorDrawing;
    d.shapes.push({ id: uid('sh'), type: 'text' } as never);
    const p = new FramePainter();
    p.paint(mainCtx(), params(doc, 0));
    expect(p.cache.size.pixels).toBe(400 * 300);
  });

  it('holds many frames of small drawings where whole frames would be thrown out', () => {
    const doc = makeDoc(40, 5, 3);
    const p = new FramePainter();
    const g = mainCtx();
    const big = { rect: { x: 0, y: 0, w: 3000, h: 3000 }, width: 3200, height: 3200 };
    for (let f = 0; f < 40; f++) p.paint(g, params(doc, f, big));
    expect(p.cache.evictions).toBe(0);
    expect(p.cache.size.entries).toBe(200);
    // Scrubbing back over them rasterises nothing.
    resetCounts();
    for (let f = 39; f >= 0; f--) p.paint(g, params(doc, f, big));
    expect(counts.fills).toBe(0);
    expect(p.cache.builds).toBe(200);
  });

  it('grows the bitmap to take in a stroke added outside it', () => {
    const doc = makeDoc(1, 1, 2);
    const layer = doc.layers[0];
    const d0 = Object.values(doc.drawings)[0] as VectorDrawing;
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, params(doc, 0));
    const before = p.cache.size.pixels;
    // The same shapes plus one far away, as a finished brush stroke is.
    const far = { ...stroke(0), id: uid('sh'), points: [{ x: 350, y: 250, p: 0.5 }, { x: 380, y: 280, p: 0.5 }] };
    const d1: VectorDrawing = { id: uid('dr'), kind: 'vector', shapes: [...d0.shapes, far] };
    const doc2 = { ...doc, drawings: { [d1.id]: d1 } };
    layer.cels = [{ ...layer.cels[0], drawingId: d1.id }];
    p.paint(g, params(doc2, 0));
    expect(p.cache.appends).toBe(1);
    expect(p.cache.size.pixels).toBeGreaterThan(before);
    expect(p.cache.size.pixels).toBeLessThanOrEqual(400 * 300 + before);
  });
});

describe('playback look-ahead', () => {
  it('rasterises upcoming frames so playing them is only blits', () => {
    const doc = makeDoc(30, 3);
    const p = new FramePainter();
    const g = mainCtx();
    const rect = { x: 10, y: 10, w: 400, h: 300 };
    p.paint(g, params(doc, 0, { playing: true }));
    const ahead = [1, 2, 3, 4, 5, 6];
    expect(p.warm(doc, ahead, rect, 800, 600, Infinity)).toBe(true);
    expect(p.cache.builds).toBe(3 + 6 * 3);
    resetCounts();
    for (const f of ahead) p.paint(g, params(doc, f, { playing: true }));
    expect(counts.fills).toBe(0);
    expect(p.cache.builds).toBe(3 + 6 * 3);
  });

  it('stops at the deadline and carries on next time', () => {
    const doc = makeDoc(10, 2);
    const p = new FramePainter();
    const rect = { x: 10, y: 10, w: 400, h: 300 };
    expect(p.warm(doc, [1, 2, 3], rect, 800, 600, -1)).toBe(false);
    expect(p.cache.builds).toBe(0);
    expect(p.warm(doc, [1, 2, 3], rect, 800, 600, Infinity)).toBe(true);
    expect(p.cache.builds).toBe(6);
    // Nothing left to do the next time.
    expect(p.warm(doc, [1, 2, 3], rect, 800, 600, Infinity)).toBe(true);
    expect(p.cache.builds).toBe(6);
  });

  it('keeps the look-ahead within the budget, whatever the stage size', () => {
    const doc = makeDoc(100, 5);
    const p = new FramePainter();
    const small = p.warmDepth(doc, { x: 0, y: 0, w: 400, h: 300 });
    const huge = p.warmDepth(doc, { x: 0, y: 0, w: 1920, h: 1080 });
    expect(small).toBeLessThanOrEqual(48);
    expect(huge).toBeGreaterThan(0);
    expect(huge * 5 * 1920 * 1080).toBeLessThanOrEqual(BUDGET_PIXELS * 0.5);
    expect(huge).toBeLessThan(small);
  });

  it('works out the frames coming up, following the loop', () => {
    const doc = makeDoc(10);
    expect(upcomingFrames(doc, 3, 4, true, null)).toEqual([4, 5, 6, 7]);
    expect(upcomingFrames(doc, 8, 4, true, null)).toEqual([9, 0, 1, 2]);
    expect(upcomingFrames(doc, 8, 4, false, null)).toEqual([9]);
    expect(upcomingFrames(doc, 50, 4, true, null)).toEqual([]);
  });
});

describe('idle look-around', () => {
  it('lists the frames either side, nearest first, inside the animation', () => {
    expect(neighbourFrames(5, 10, 2)).toEqual([6, 4, 7, 3]);
    expect(neighbourFrames(0, 10, 2)).toEqual([1, 2]);
    expect(neighbourFrames(9, 10, 2)).toEqual([8, 7]);
    expect(neighbourFrames(0, 1, 2)).toEqual([]);
    expect(neighbourFrames(3, 10, 0)).toEqual([]);
  });
});

describe('onion skin', () => {
  const onion = { enabled: true, before: 1, after: 0, opacity: 0.35, beforeColor: '#f00', afterColor: '#0f0', tint: true };

  it('ghosts every visible layer by default', () => {
    const doc = makeDoc(3, 2, 4);
    new FramePainter().paint(mainCtx(), params(doc, 1, { onion }));
    // 2 layers x 4 strokes for the current frame, and the same again for the ghost.
    expect(counts.fills).toBe(16);
  });

  it('leaves out layers with onion switched off', () => {
    const doc = makeDoc(3, 2, 4);
    (doc.layers[0] as Layer).onion = false;
    new FramePainter().paint(mainCtx(), params(doc, 1, { onion }));
    expect(counts.fills).toBe(8 + 4);
  });

  it('ghosts come from the bitmaps of frames already shown, so scrubbing forward rasterises one frame a step', () => {
    const doc = makeDoc(6, 2, 10);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, params(doc, 1, { onion }));
    p.paint(g, params(doc, 2, { onion }));
    resetCounts();
    // Frame 3 is new (2 layers x 10 strokes). Its ghost is frame 2, which is already a bitmap per layer.
    p.paint(g, params(doc, 3, { onion }));
    expect(counts.fills).toBe(20);
  });

  it('reuses a ghost bitmap it has already made', () => {
    const doc = makeDoc(3, 1, 4);
    const p = new FramePainter();
    const g = mainCtx();
    p.paint(g, params(doc, 1, { onion }));
    resetCounts();
    p.paint(g, params(doc, 1, { onion }));
    expect(counts.fills).toBe(0);
  });
});

describe('faded layers in the shared renderer', () => {
  it('reuse one buffer instead of allocating a canvas per call', () => {
    const doc = makeDoc(1, 1, 2);
    doc.layers[0].opacity = 0.5;
    const g = mainCtx(400, 300);
    resetCounts();
    const before = fadeStats.allocated;
    for (let i = 0; i < 25; i++) drawLayerAt(g, doc, doc.layers[0], 0);
    expect(fadeStats.allocated - before).toBeLessThanOrEqual(1);
    expect(counts.canvases).toBeLessThanOrEqual(1);
  });
});
