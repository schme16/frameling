import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, Layer, ParticlesShape, Shape, TextShape, VectorDrawing } from '../../src/core/format';
import { morphNotes } from '../../src/core/shape-tween';
import { poseAt, poseStats } from '../../src/core/symbols';
import { newParticles } from '../../src/particles/model';
import { newAnimator, newTextShape } from '../../src/text/model';
import { ellipsePath, fill } from '../../src/templates/build';

const text = (patch: Partial<TextShape> = {}): TextShape => newTextShape('t1', { x: 0, y: 0 }, { text: 'Hello', ...patch });
const emitter = (patch: Partial<ParticlesShape> = {}): ParticlesShape => ({ ...newParticles('p1', 'smoke', { x: 100, y: 100 }, { width: 400, height: 300 }, 3), ...patch });

/** A morph from frame 0 to frame 10 (keys 0 to 9 hold, then the end key starts at 10), fps 10. */
function morphDoc(a: Shape[], b: Shape[]): { doc: Doc; layer: Layer } {
  const doc = newDoc({ width: 400, height: 300, fps: 10, length: 20 });
  const layer = newVectorLayer('L');
  doc.drawings.a = { id: 'a', kind: 'vector', shapes: a } as VectorDrawing;
  doc.drawings.b = { id: 'b', kind: 'vector', shapes: b } as VectorDrawing;
  layer.cels = [
    { id: 'c1', start: 0, length: 10, drawingId: 'a', tween: { kind: 'shape', ease: 'linear' } },
    { id: 'c2', start: 10, length: 10, drawingId: 'b' },
  ];
  doc.layers = [layer];
  return { doc, layer };
}

const shapesAt = (doc: Doc, layer: Layer, frame: number): Shape[] => {
  const d = poseAt(doc, layer, frame);
  return d?.kind === 'vector' ? d.shapes : [];
};

describe('shape tweens: text', () => {
  it('moves, resizes, recolours and fades text between the keys', () => {
    const a = text({ size: 20, color: '#ff0000', opacity: 1, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });
    const b = text({ size: 60, color: '#0000ff', opacity: 0.5, letterSpacing: 10, transform: { x: 100, y: 40, scaleX: 2, scaleY: 2, rotation: 90, skew: 0 } });
    const { doc, layer } = morphDoc([a], [b]);
    const [mid] = shapesAt(doc, layer, 5) as TextShape[];
    expect(mid.type).toBe('text');
    expect(mid.transform.x).toBeCloseTo(50);
    expect(mid.transform.y).toBeCloseTo(20);
    expect(mid.transform.scaleX).toBeCloseTo(1.5);
    expect(mid.transform.rotation).toBeCloseTo(45);
    expect(mid.size).toBeCloseTo(40);
    expect(mid.letterSpacing).toBeCloseTo(5);
    expect(mid.opacity).toBeCloseTo(0.75);
    expect(mid.color).toBe('#800080');
    expect(mid.text).toBe('Hello');
  });

  it('is exactly the start key on its own frame and follows extra spins', () => {
    const a = text();
    const b = text({ transform: { ...a.transform, x: 80 } });
    const { doc, layer } = morphDoc([a], [b]);
    expect(shapesAt(doc, layer, 0)[0]).toBe(a);
    layer.cels[0].tween = { kind: 'shape', ease: 'linear', spin: 1 };
    const [m] = shapesAt(doc, layer, 5) as TextShape[];
    expect(m.transform.rotation).toBeCloseTo(180);
  });

  it('keeps animated text posed on in-between frames', () => {
    const a = text({ animators: [newAnimator('fade', 'an1')] });
    const b = text({ animators: [newAnimator('fade', 'an1')], transform: { ...a.transform, x: 50 } });
    const { doc, layer } = morphDoc([a], [b]);
    const f3 = shapesAt(doc, layer, 3)[0] as TextShape & { posedFrame: number };
    const f4 = shapesAt(doc, layer, 4)[0] as TextShape & { posedFrame: number };
    expect(f3.posedFrame).toBe(3);
    expect(f4.posedFrame).toBe(4);
    // Same frame twice comes from the cache, not a rebuild.
    const built = poseStats.built;
    shapesAt(doc, layer, 4);
    expect(poseStats.built).toBe(built);
  });

  it('pairs text with text in order and fades a spare out, and a new one in', () => {
    const t1 = text({ id: 't1' });
    const t2 = text({ id: 't2', text: 'Spare' });
    const { doc, layer } = morphDoc([t1, t2], [text({ id: 'x1' })]);
    const mid = shapesAt(doc, layer, 5) as TextShape[];
    expect(mid).toHaveLength(2);
    expect(mid[1].text).toBe('Spare');
    expect(mid[1].opacity).toBeCloseTo(0.5);
    const inn = morphDoc([text({ id: 'only' })], [text({ id: 'x1' }), text({ id: 'x2', text: 'New' })]);
    const m2 = shapesAt(inn.doc, inn.layer, 5) as TextShape[];
    expect(m2.map((s) => s.text)).toEqual(['Hello', 'New']);
    expect(m2[1].opacity).toBeCloseTo(0.5);
  });

  it('crossfades text with different words instead of morphing letters', () => {
    const { doc, layer } = morphDoc([text({ text: 'One' })], [text({ text: 'Two', transform: { ...text().transform, x: 100 } })]);
    const mid = shapesAt(doc, layer, 5) as TextShape[];
    expect(mid.map((s) => s.text)).toEqual(['One', 'Two']);
    expect(mid[0].opacity).toBeCloseTo(0.5);
    expect(mid[1].opacity).toBeCloseTo(0.5);
    expect(mid[0].transform.x).toBeCloseTo(50);
    expect(mid[1].transform.x).toBeCloseTo(50);
    expect(new Set(mid.map((s) => s.id)).size).toBe(2);
  });

  it('keeps text in step with the outlines morphing beside it', () => {
    const a = fill([ellipsePath(50, 50, 20, 20)], '#ff0000');
    const b = fill([ellipsePath(150, 50, 20, 20)], '#0000ff');
    const { doc, layer } = morphDoc([a, text({ transform: { ...text().transform, x: 10 } })], [b, text({ transform: { ...text().transform, x: 30 } })]);
    const shapes = shapesAt(doc, layer, 5);
    expect(shapes.map((s) => s.type)).toEqual(['fill', 'text']);
    expect((shapes[1] as TextShape).transform.x).toBeCloseTo(20);
  });
});

describe('shape tweens: particles', () => {
  it('slides the emitter and blends its settings, keeping the count and seed', () => {
    const a = emitter({ transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, speed: 100, sizeStart: 10, colorStart: '#ff0000', rate: 10, seed: 3, opacity: 1 });
    const b = emitter({ transform: { x: 200, y: 60, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, speed: 300, sizeStart: 30, colorStart: '#0000ff', rate: 50, seed: 9, opacity: 0.5 });
    const { doc, layer } = morphDoc([a], [b]);
    const [mid] = shapesAt(doc, layer, 5) as ParticlesShape[];
    expect(mid.type).toBe('particles');
    expect(mid.transform.x).toBeCloseTo(100);
    expect(mid.transform.y).toBeCloseTo(30);
    expect(mid.speed).toBeCloseTo(200);
    expect(mid.sizeStart).toBeCloseTo(20);
    expect(mid.colorStart).toBe('#800080');
    expect(mid.opacity).toBeCloseTo(0.75);
    expect(mid.rate).toBe(10);
    expect(mid.seed).toBe(3);
  });

  it('keeps the emitter clock running from its key start (no restart)', () => {
    const { doc, layer } = morphDoc([emitter()], [emitter({ transform: { ...emitter().transform, x: 300 } })]);
    for (const f of [1, 4, 7]) {
      const s = shapesAt(doc, layer, f)[0] as ParticlesShape & { posedTime: number };
      expect(s.posedTime).toBeCloseTo(f / 10);
    }
  });

  it('keeps time running on a later key too', () => {
    const { doc, layer } = morphDoc([emitter()], [emitter({ transform: { ...emitter().transform, x: 300 } })]);
    // Move the whole tween to start at frame 4.
    layer.cels = [
      { id: 'c0', start: 0, length: 4, drawingId: 'a' },
      { id: 'c1', start: 4, length: 10, drawingId: 'a', tween: { kind: 'shape', ease: 'linear' } },
      { id: 'c2', start: 14, length: 6, drawingId: 'b' },
    ];
    const s = shapesAt(doc, layer, 9)[0] as ParticlesShape & { posedTime: number };
    expect(s.posedTime).toBeCloseTo(0.5);
  });

  it('fades a spare emitter in or out, and poses it every frame', () => {
    const { doc, layer } = morphDoc([], [emitter({ id: 'new' })]);
    const s5 = shapesAt(doc, layer, 5)[0] as ParticlesShape & { posedTime: number };
    const s6 = shapesAt(doc, layer, 6)[0] as ParticlesShape & { posedTime: number };
    expect(s5.opacity).toBeCloseTo(0.5);
    expect(s5.posedTime).toBeCloseTo(0.5);
    expect(s6.posedTime).toBeCloseTo(0.6);
    const out = morphDoc([emitter()], []);
    expect((shapesAt(out.doc, out.layer, 5)[0] as ParticlesShape).opacity).toBeCloseTo(0.5);
  });
});

describe('morphNotes', () => {
  const vd = (shapes: Shape[]): VectorDrawing => ({ id: 'x', kind: 'vector', shapes });
  it('is empty when nothing is lost', () => {
    expect(morphNotes(vd([text(), emitter()]), vd([text(), emitter({ speed: 5 })]))).toEqual([]);
  });
  it('says what is held, crossfaded or faded', () => {
    expect(morphNotes(vd([text({ text: 'A' })]), vd([text({ text: 'B' })])).join(' ')).toMatch(/crossfades/);
    expect(morphNotes(vd([emitter()]), vd([emitter({ rate: 99 })])).join(' ')).toMatch(/keep the first key/);
    expect(morphNotes(vd([text()]), vd([])).join(' ')).toMatch(/fades/);
    expect(morphNotes(vd([]), vd([emitter()])).join(' ')).toMatch(/fades/);
  });
});
