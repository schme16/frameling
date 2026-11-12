import { gridPixels } from '../../src/core/pixelBounds';
import type { PixelDrawing } from '../../src/core/format';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { Doc, StrokeShape } from '../../src/core/format';
import { Store } from '../../src/core/store';
import { applyOps, OpProblem } from '../../src/plugins/ops';

const stroke = (x: number): StrokeShape => ({ id: 's' + x, type: 'stroke', points: [{ x, y: 10, p: 0.5 }, { x: x + 10, y: 20, p: 0.5 }], brush: { size: 4, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: '#ff0000', opacity: 1 });

function setup() {
  const doc: Doc = newDoc({ width: 100, height: 50 });
  const v = { ...newVectorDrawing(), id: 'dv', shapes: [stroke(10)] };
  const p = { ...newPixelDrawing(4, 2), id: 'dp' };
  p.pixels[0] = 255;
  p.pixels[3] = 255;
  doc.drawings = { dv: v, dp: p };
  return new Store(doc);
}

const edit = (s: Store, ops: unknown) => s.update('Plugin', (d) => applyOps(d, ops));

describe('plugin ops', () => {
  it('flips vector drawings around the stage and pixel drawings around the grid, as one undo step', () => {
    const s = setup();
    edit(s, [
      { op: 'flipDrawing', drawingId: 'dv', axis: 'horizontal' },
      { op: 'flipDrawing', drawingId: 'dp', axis: 'horizontal' },
    ]);
    const v = s.get().doc.drawings.dv as { shapes: StrokeShape[] };
    expect(v.shapes[0].points.map((q) => q.x)).toEqual([90, 80]);
    // The drawing is on no layer here, so it is flipped across the block it holds (4 x 2).
    const p = gridPixels(s.get().doc.drawings.dp as PixelDrawing, 4, 2);
    expect(p[0]).toBe(0);
    expect(p[12]).toBe(255);
    expect(s.undoLabel()).toBe('Plugin');
    s.undo();
    expect((s.get().doc.drawings.dv as { shapes: StrokeShape[] }).shapes[0].points[0].x).toBe(10);
    expect((s.get().doc.drawings.dp as { pixels: Uint8ClampedArray }).pixels[0]).toBe(255);
  });

  it('changes nothing when any op in the batch is wrong', () => {
    const s = setup();
    const before = s.get().doc;
    expect(() => edit(s, [{ op: 'setDocument', name: 'Changed' }, { op: 'flipDrawing', drawingId: 'nope', axis: 'horizontal' }])).toThrow(OpProblem);
    expect(s.get().doc).toBe(before);
    expect(s.canUndo()).toBe(false);
  });

  it('refuses ops it does not know, wrong sizes and wrong values', () => {
    const s = setup();
    expect(() => edit(s, [{ op: 'eval', code: '1' }])).toThrow(/can't do "eval"/);
    expect(() => edit(s, [{ op: 'setPixels', drawingId: 'dp', pixels: new Uint8ClampedArray(3) }])).toThrow(/32 bytes/);
    expect(() => edit(s, [{ op: 'transformDrawing', drawingId: 'dv', matrix: [1, 0, 0, 1, NaN, 0] }])).toThrow(/six numbers/);
    expect(() => edit(s, [{ op: 'setDocument', fps: 0 }])).toThrow(/fps/);
    expect(() => edit(s, [{ op: 'setDocument', background: 'red' }])).toThrow(/colour/);
    expect(() => edit(s, [{ op: 'addMarker', frame: 99, name: 'x' }])).toThrow(/frame/);
    expect(() => edit(s, 'not a list')).toThrow(/list/);
    expect(s.canUndo()).toBe(false);
  });

  it('sets pixels as a fresh array, and layer, document, marker, clip and swatch values', () => {
    const s = setup();
    const px = new Uint8ClampedArray(32).fill(7);
    const layerId = s.get().doc.layers[0].id;
    edit(s, [
      { op: 'setPixels', drawingId: 'dp', pixels: px },
      { op: 'setLayer', layerId, name: 'Renamed', visible: false, opacity: 5 },
      { op: 'setDocument', name: 'New name', fps: 24, background: null },
      { op: 'addMarker', frame: 0, name: 'Hit' },
      { op: 'addClip', name: 'Idle', start: 0, end: 0 },
      { op: 'addSwatch', name: 'Teal', color: '#00aaaa' },
      { op: 'setShapeStyle', drawingId: 'dv', shapeId: 's10', color: '#00ff00', opacity: 0.5 },
    ]);
    const d = s.get().doc;
    const got = (d.drawings.dp as { pixels: Uint8ClampedArray }).pixels;
    expect(got).toEqual(px);
    expect(got).not.toBe(px);
    expect(d.layers[0]).toMatchObject({ name: 'Renamed', visible: false, opacity: 1 });
    expect(d).toMatchObject({ name: 'New name', fps: 24, background: null });
    expect(d.markers.at(-1)).toMatchObject({ name: 'Hit', frame: 0 });
    expect(d.clips.at(-1)).toMatchObject({ name: 'Idle', start: 0, end: 0, loop: true });
    expect(d.swatches.at(-1)).toMatchObject({ name: 'Teal', color: '#00aaaa' });
    expect(d.clips.at(-1)).not.toHaveProperty('direction');
    expect(d.clips.at(-1)).not.toHaveProperty('repeat');
    expect((d.drawings.dv as { shapes: StrokeShape[] }).shapes[0]).toMatchObject({ color: '#00ff00', opacity: 0.5 });
  });

  it('cuts a pixel block that reaches past the art grid, and keeps one that fits', () => {
    const s = setup();
    // A 100 x 50 stage with 10-pixel art cells is a 10 x 5 grid.
    s.update('Layer', (d) => {
      const l = newPixelLayer('P', 10);
      l.cels = [{ id: 'cp', start: 0, length: 1, drawingId: 'dp' }];
      d.layers.push(l as never);
    });
    const red = [255, 0, 0, 255];
    // 4 x 3 block at (8, 3): only columns 8 and 9 and rows 3 and 4 are on the grid.
    edit(s, [{ op: 'setPixels', drawingId: 'dp', x: 8, y: 3, width: 4, height: 3, pixels: Array.from({ length: 12 }, () => red).flat() }]);
    const d = s.get().doc.drawings.dp as PixelDrawing;
    expect([d.x, d.y, d.width, d.height]).toEqual([8, 3, 2, 2]);
    expect(d.pixels.length).toBe(2 * 2 * 4);
    edit(s, [{ op: 'setPixels', drawingId: 'dp', x: 1, y: 1, width: 2, height: 2, pixels: new Array(16).fill(9) }]);
    const e = s.get().doc.drawings.dp as PixelDrawing;
    expect([e.x, e.y, e.width, e.height]).toEqual([1, 1, 2, 2]);
  });

  it('addClip sets how the clip plays: direction and repeat, checked, and older calls stay as they were', () => {
    const s = setup();
    edit(s, [
      { op: 'addClip', name: 'Back', start: 0, end: 0, direction: 'reverse' },
      { op: 'addClip', name: 'Twice', start: 0, end: 0, repeat: 2 },
      { op: 'addClip', name: 'Once', start: 0, end: 0, loop: false },
      { op: 'addClip', name: 'Ping', start: 0, end: 0, loop: false, repeat: 3, direction: 'pingpong' },
      { op: 'addClip', name: 'Forever', start: 0, end: 0, loop: true, repeat: 5, direction: 'forward' },
    ]);
    const c = s.get().doc.clips.slice(-5);
    expect(c[0]).toMatchObject({ name: 'Back', loop: true, direction: 'reverse' });
    expect(c[0]).not.toHaveProperty('repeat');
    expect(c[1]).toMatchObject({ name: 'Twice', loop: false, repeat: 2 });
    expect(c[2]).toMatchObject({ name: 'Once', loop: false });
    expect(c[2]).not.toHaveProperty('repeat');
    expect(c[3]).toMatchObject({ name: 'Ping', loop: false, repeat: 3, direction: 'pingpong' });
    expect(c[4]).toMatchObject({ name: 'Forever', loop: true });
    expect(c[4]).not.toHaveProperty('repeat');
    expect(c[4]).not.toHaveProperty('direction');
    const before = s.get().doc.clips.length;
    expect(() => edit(s, [{ op: 'addClip', name: 'x', start: 0, end: 0, direction: 'sideways' }])).toThrow(OpProblem);
    expect(() => edit(s, [{ op: 'addClip', name: 'x', start: 0, end: 0, repeat: 0 }])).toThrow(OpProblem);
    expect(() => edit(s, [{ op: 'addClip', name: 'x', start: 0, end: 0, repeat: 'twice' }])).toThrow(/repeat/);
    expect(s.get().doc.clips.length).toBe(before);
  });
});
