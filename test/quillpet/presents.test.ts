// The presents Quill makes you: when he decides to, what he keeps to work from, and the crayon copy itself.
import { describe, expect, it } from 'vitest';
import {
  addPresent,
  apply,
  FRESH_PET,
  givenSincePresent,
  keepNewestSources,
  letGoOfPresent,
  MAX_PRESENTS,
  MAX_SOURCES,
  openPresent,
  presentDue,
  presentMark,
  sourceThing,
  stageOf,
  THANKS_DAYS,
  THANKS_THINGS,
  unopenedCount,
  type PetState,
  type PetThing,
  type Present,
} from '../../src/quillpet/model';
import { crayonDoc, crayonShapes, rng, scaleFor, wander, type ThingSource } from '../../src/quillpet/crayon';
import { quietNow, QUIET } from '../../src/quillpet/gifts';
import { sourceOf } from '../../src/quillpet/give';
import type { FillShape, Shape, StrokeShape } from '../../src/core/format';
import { newDoc, newVectorLayer, uid } from '../../src/core/doc';

const DAY = 86400000;
const AT = new Date(2026, 10, 13, 10, 0, 0).getTime();

const src = (): ThingSource => ({ width: 480, height: 480, background: '#ffffff', shapes: [] });

const thing = (id: string, givenAt: number, withSource = true): PetThing => ({
  id,
  name: id,
  picture: 'data:,',
  givenAt,
  ...(withSource ? { source: src() } : {}),
});

const pet = (over: Partial<PetState> = {}): PetState => ({ ...FRESH_PET, metAt: AT - 30 * DAY, ...over });

const present = (id: string, madeAt: number): Present => ({ id, kind: 'crayon', name: id, picture: 'data:,', source: src(), seed: 1, madeAt });

describe('what he keeps to work from', () => {
  it('keeps the shapes of the newest few only', () => {
    const things = [thing('a', 1), thing('b', 2), thing('c', 3), thing('d', 4), thing('e', 5)];
    const kept = keepNewestSources(things);
    expect(kept.filter((t) => t.source).map((t) => t.id)).toEqual(['c', 'd', 'e']);
    // Nothing else about them changes: every picture is still there.
    expect(kept.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(kept.every((t) => t.picture)).toBe(true);
  });

  it('leaves them alone while there are few enough', () => {
    const things = [thing('a', 1), thing('b', 2)];
    expect(keepNewestSources(things)).toBe(things);
  });

  it('trims as you give him more', () => {
    let state = FRESH_PET;
    for (let i = 0; i < 6; i++) state = apply(state, {}, { kind: 'gave', thing: thing(`t${i}`, AT + i) }, AT + i).pet;
    expect(state.things.filter((t) => t.source)).toHaveLength(MAX_SOURCES);
    expect(sourceThing(state)?.id).toBe('t5');
  });

  it('takes the vector shapes of the frame you are on, and skips what he cannot hold a crayon to', () => {
    const doc = newDoc({ width: 200, height: 100, background: null });
    doc.layers = [];
    const shape: FillShape = { id: uid('s'), type: 'fill', paths: [{ points: [{ x: 0, y: 0 }], closed: true }], color: '#f00', opacity: 1 };
    const seen = newVectorLayer('Seen');
    const hidden = newVectorLayer('Hidden');
    hidden.visible = false;
    for (const [layer, shapes] of [
      [seen, [shape]],
      [hidden, [{ ...shape, id: uid('s') }]],
    ] as const) {
      const d = { id: uid('v'), kind: 'vector' as const, shapes: [...shapes] };
      doc.drawings[d.id] = d;
      layer.cels = [{ id: uid('c'), start: 0, length: 1, drawingId: d.id }];
      doc.layers.push(layer);
    }
    const got = sourceOf(doc, 0);
    expect(got?.shapes).toHaveLength(1);
    expect(got).toMatchObject({ width: 200, height: 100, background: null });
  });

  it('keeps the picture alone when the drawing is too big to tuck away', () => {
    const doc = newDoc({ width: 100, height: 100 });
    const points = Array.from({ length: 4000 }, (_, i) => ({ x: i, y: i, p: 0.5 }));
    const big: StrokeShape = {
      id: uid('s'),
      type: 'stroke',
      points,
      brush: { size: 4, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true },
      color: '#000',
      opacity: 1,
    };
    const d = { id: uid('v'), kind: 'vector' as const, shapes: [big] };
    doc.drawings[d.id] = d;
    doc.layers[0].cels = [{ id: uid('c'), start: 0, length: 1, drawingId: d.id }];
    expect(sourceOf(doc, 0, 1000)).toBeUndefined();
    expect(sourceOf(doc, 0)).toBeDefined();
  });

  it('gives nothing back for an empty frame', () => {
    expect(sourceOf(newDoc({}), 0)).toBeUndefined();
  });
});

describe('when he decides to make one', () => {
  it('makes nothing without a drawing of yours to work from', () => {
    expect(presentDue(pet({ things: [thing('a', AT, false)] }), AT)).toBeNull();
  });

  it('marks a new step of knowing each other', () => {
    const p = pet({ closeness: 40, things: [thing('a', AT - DAY)] });
    expect(stageOf(p.closeness).id).toBe('friends');
    expect(presentDue(p, AT)).toBe('stage');
  });

  it('only marks each step once', () => {
    const p = pet({ closeness: 40, things: [thing('a', AT - DAY)], seen: [presentMark(stageOf(40))] });
    expect(presentDue(p, AT)).toBeNull();
  });

  it('makes one to say thank you after a few things and a wait', () => {
    const things = Array.from({ length: THANKS_THINGS }, (_, i) => thing(`t${i}`, AT - DAY));
    const p = pet({ things, lastPresentAt: AT - THANKS_DAYS * DAY, seen: [presentMark(stageOf(0))] });
    expect(givenSincePresent(p)).toBe(THANKS_THINGS);
    expect(presentDue(p, AT)).toBe('thanks');
  });

  it('waits when he has had too few, or not long enough', () => {
    const soon = pet({ things: [thing('a', AT - DAY), thing('b', AT - DAY), thing('c', AT - DAY)], lastPresentAt: AT - 1000 });
    expect(presentDue(soon, AT)).toBeNull();
    const few = pet({ things: [thing('a', AT - DAY)], lastPresentAt: AT - 9 * DAY });
    expect(presentDue(few, AT)).toBeNull();
  });

  it('never makes two in a day', () => {
    const p = pet({ closeness: 400, things: [thing('a', AT - DAY)], lastPresentAt: AT - 60000 });
    expect(presentDue(p, AT)).toBeNull();
  });

  it('waits for a quiet moment', () => {
    expect(quietNow(QUIET + 1, false)).toBe(true);
    expect(quietNow(1000, false)).toBe(false);
    expect(quietNow(QUIET + 1, true)).toBe(false);
  });
});

describe('his shelf', () => {
  it('keeps the newest few and remembers when the last one was', () => {
    let p = pet();
    for (let i = 0; i < MAX_PRESENTS + 3; i++) p = addPresent(p, present(`g${i}`, AT + i));
    expect(p.presents).toHaveLength(MAX_PRESENTS);
    expect(p.presents[0].id).toBe('g3');
    expect(p.lastPresentAt).toBe(AT + MAX_PRESENTS + 2);
  });

  it('marks one opened, once', () => {
    const p = addPresent(pet(), present('g1', AT));
    expect(unopenedCount(p)).toBe(1);
    const after = openPresent(p, 'g1');
    expect(unopenedCount(after)).toBe(0);
    expect(openPresent(after, 'g1')).toBe(after);
  });

  it('lets one go without touching anything else', () => {
    const p = addPresent(addPresent(pet({ closeness: 50 }), present('g1', AT)), present('g2', AT + 1));
    const after = letGoOfPresent(p, 'g1');
    expect(after.presents.map((x) => x.id)).toEqual(['g2']);
    expect(after.closeness).toBe(50);
    expect(after.lastPresentAt).toBe(p.lastPresentAt);
  });
});

describe('the crayon copy', () => {
  const stroke = (): StrokeShape => ({
    id: 's1',
    type: 'stroke',
    points: Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 50, p: 0.5 })),
    brush: { size: 6, thinning: 0, smoothing: 0.3, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true },
    color: '#204060',
    opacity: 1,
  });
  const fill = (): FillShape => ({
    id: 'f1',
    type: 'fill',
    paths: [{ points: [{ x: 0, y: 0 }, { x: 40, y: 0, c1: { x: 10, y: 5 }, c2: { x: 30, y: 5 } }, { x: 40, y: 40 }], closed: true }],
    color: '#c0d080',
    opacity: 1,
  });

  it('is the same copy every time, for the same seed', () => {
    const a = crayonShapes([stroke(), fill()], 7);
    const b = crayonShapes([stroke(), fill()], 7);
    expect(a).toEqual(b);
    expect(crayonShapes([stroke()], 8)).not.toEqual(crayonShapes([stroke()], 7));
  });

  it('leaves the drawing where it was, only wobblier', () => {
    const [out] = crayonShapes([stroke()], 3) as [StrokeShape];
    const was = stroke();
    expect(out.points).toHaveLength(was.points.length);
    expect(out.color).toBe(was.color);
    for (const [i, p] of out.points.entries()) {
      expect(Math.abs(p.x - was.points[i].x)).toBeLessThan(6);
      expect(Math.abs(p.y - was.points[i].y)).toBeLessThan(6);
      expect(p.p).toBeGreaterThan(0);
      expect(p.p).toBeLessThanOrEqual(1);
    }
    // Something actually moved.
    expect(out.points.some((p, i) => p.x !== was.points[i].x)).toBe(true);
  });

  it('keeps a curve a curve', () => {
    const [out] = crayonShapes([fill()], 5) as [FillShape];
    expect(out.paths[0].points[1].c1).toBeDefined();
    expect(out.paths[0].points[1].c2).toBeDefined();
    expect(out.paths[0].closed).toBe(true);
  });

  it('never drops a shape it cannot hold a crayon to', () => {
    const odd = { id: 'x', type: 'text', text: 'hello' } as unknown as Shape;
    const out = crayonShapes([odd, stroke()], 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(odd);
  });

  it('does not change what you gave it', () => {
    const shapes = [stroke(), fill()];
    const before = JSON.stringify(shapes);
    crayonShapes(shapes, 11);
    expect(JSON.stringify(shapes)).toBe(before);
  });

  it('wobbles a big drawing more than a small one', () => {
    expect(scaleFor({ width: 1920, height: 1080 })).toBeGreaterThan(scaleFor({ width: 240, height: 240 }));
    expect(scaleFor({ width: 20, height: 20 })).toBeGreaterThanOrEqual(0.35);
    expect(scaleFor({ width: 9000, height: 9000 })).toBeLessThanOrEqual(3);
  });

  it('opens as a document of your own', () => {
    const doc = crayonDoc({ width: 320, height: 240, background: '#101020', shapes: [stroke(), fill()] }, 'Hat', 4);
    expect(doc).toMatchObject({ width: 320, height: 240, background: '#101020', name: 'Hat' });
    expect(doc.layers).toHaveLength(1);
    const cel = doc.layers[0].cels[0];
    const drawing = doc.drawings[cel.drawingId];
    expect(drawing.kind).toBe('vector');
    expect(drawing.kind === 'vector' && drawing.shapes).toHaveLength(2);
  });

  it('wanders smoothly rather than jumping about', () => {
    const w = wander(9);
    for (let t = 0; t < 10; t += 0.25) expect(Math.abs(w(t + 0.25) - w(t))).toBeLessThan(1);
    for (let t = 0; t < 5; t += 0.5) expect(w(t)).toBe(wander(9)(t));
  });

  it('gives numbers in range, from any seed', () => {
    for (const seed of [0, 1, 7, 12345, 0xffffffff]) {
      const r = rng(seed);
      for (let i = 0; i < 50; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});
