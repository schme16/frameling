// The shape kind registry: the renderer, posing, selection and the file reader ask it, so text and particles are not
// imported by core. A kind of a made-up type shows that each hook is called, and the real kinds show they are wired.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hitShape, shapeBounds, transformShape } from '../../src/canvas/geometry';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, Shape, VectorDrawing } from '../../src/core/format';
import { drawingBox, drawShape } from '../../src/core/render';
import { hasShapeKind, kindOf, registerShapeKind, shapeKind, type ShapeKind } from '../../src/core/shapeKinds';
import { hasMoving, poseMovingShape } from '../../src/core/symbols';
import { loadFile, saveFile } from '../../src/io/file';
import { newParticles } from '../../src/particles/model';
import { newTextShape } from '../../src/text/model';

type Fake = { id: string; type: 'fake'; at: number };

const calls: string[] = [];
const fake: ShapeKind<never> = {
  type: 'fake' as never,
  draw: () => void calls.push('draw'),
  extend: (_s, grow) => {
    calls.push('extend');
    grow(5, 6, 1);
  },
  bounds: () => ({ x: 1, y: 2, w: 3, h: 4 }),
  hit: (_s, x) => x > 0,
  transform: (s) => ({ ...(s as object), moved: true }) as never,
  moving: () => true,
  pose: (_d, s, local) => ({ ...(s as object), posed: local }) as never,
  read: (raw) => ({ id: String(raw.id), type: 'fake', at: Number(raw.at) }) as never,
};
registerShapeKind(fake);
const shape = { id: 'f1', type: 'fake', at: 3 } as unknown as Shape;
afterEach(() => (calls.length = 0));

const docWith = (shapes: Shape[]): Doc => {
  const doc = newDoc({ width: 100, height: 60, length: 4 });
  const layer = newVectorLayer('L');
  doc.drawings.d = { id: 'd', kind: 'vector', shapes } as VectorDrawing;
  layer.cels = [{ id: 'c', start: 0, length: 4, drawingId: 'd' }];
  doc.layers = [layer];
  return doc;
};

describe('a registered kind', () => {
  it('is found by type, and the drawing basics are not kinds', () => {
    expect(hasShapeKind('fake')).toBe(true);
    expect(kindOf(shape)).toBe(fake);
    expect(shapeKind('stroke')).toBeUndefined();
    expect(kindOf({ id: 's', type: 'stroke' } as Shape)).toBeUndefined();
  });

  it('is drawn, boxed, hit, moved and posed through its hooks', () => {
    const g = {} as CanvasRenderingContext2D;
    drawShape(g, shape);
    expect(calls).toContain('draw');
    expect(shapeBounds(shape)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(hitShape(shape, 2, 3, 0)).toBe(true);
    expect(transformShape(shape, [1, 0, 0, 1, 5, 5])).toMatchObject({ moved: true });
    const d = { id: 'd', kind: 'vector', shapes: [shape] } as VectorDrawing;
    expect(hasMoving(d)).toBe(true);
    expect(poseMovingShape(newDoc(), shape, 7)).toMatchObject({ posed: 7 });
    const box = drawingBox(d);
    expect(calls).toContain('extend');
    expect(box.x1).toBeGreaterThanOrEqual(6);
  });

  it('reads itself from a file and the file keeps it', () => {
    const doc = docWith([shape]);
    const back = loadFile(saveFile(doc, 'test'));
    expect(back.doc.drawings.d).toMatchObject({ shapes: [{ id: 'f1', type: 'fake', at: 3 }] });
    expect(back.warnings).toEqual([]);
  });
});

describe('text and particles', () => {
  it('are registered kinds, so core never imports them', () => {
    expect(hasShapeKind('text')).toBe(true);
    expect(hasShapeKind('particles')).toBe(true);
  });

  it('read back from a file, move, and stay in the drawing', () => {
    const text = newTextShape('t1', { x: 10, y: 10 }, { text: 'Hi' });
    const emitter = newParticles('p1', 'sparkle', { x: 40, y: 30 });
    const doc = docWith([text, emitter]);
    const back = loadFile(saveFile(doc, 'test')).doc.drawings.d as VectorDrawing;
    expect(back.shapes.map((s) => s.type)).toEqual(['text', 'particles']);
    expect(hasMoving(back)).toBe(true);
    const moved = transformShape(back.shapes[0], [1, 0, 0, 1, 20, 0]);
    expect((moved as typeof text).transform.x).toBeCloseTo(30);
    expect(hitShape(emitter, emitter.transform.x, emitter.transform.y, 0)).toBe(true);
  });

  it('draw nothing and measure nothing when a kind is missing (a type nobody registered)', () => {
    const odd = { id: 'o', type: 'nobody' } as unknown as Shape;
    const g = { fill: vi.fn(), save: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(() => drawShape(g, odd)).not.toThrow();
    expect(shapeBounds(odd)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(hitShape(odd, 0, 0, 5)).toBe(false);
  });
});
