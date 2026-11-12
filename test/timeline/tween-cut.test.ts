import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { CameraDrawing, Doc, Easing, InstanceShape, Layer, MotionPath, PathShape, Tween, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { newCameraDrawing, newCameraLayer, cameraViewOn, plainView } from '../../src/core/camera';
import { celAt } from '../../src/core/doc';
import { isInstance, shownDrawing } from '../../src/core/symbols';
import { cutProblem, cutTween, splitPath } from '../../src/core/tweenCut';
import { tweenEase } from '../../src/core/ease';
import { editActiveDrawing } from '../../src/tools/edit';
import { retimeKeys } from '../../src/timeline/keys';
import { layerTracks } from '../../src/timeline/tracks';

const WAVY: MotionPath = {
  orient: false,
  points: [
    { x: 10, y: 50 },
    { x: 60, y: 160, c1: { x: 10, y: 150 }, c2: { x: 20, y: 200 } },
    { x: 140, y: 40, c1: { x: 100, y: 120 }, c2: { x: 90, y: -20 } },
    { x: 200, y: 90 },
  ],
};

// A gentle quarter-turn arc, for the heading checks: the follower faces along 16 straight steps per curve.
const ARC: MotionPath = {
  orient: true,
  points: [
    { x: 10, y: 50 },
    { x: 110, y: 150, c1: { x: 65, y: 50 }, c2: { x: 110, y: 95 } },
  ],
};

/** A square symbol on a layer: key 0 at (10,50) and key 10 at (110,150), turned 30 degrees and twice the size. */
function symbolDoc(tween: Tween): Doc {
  const doc = newDoc({ width: 400, height: 300, length: 12 });
  const sq: PathShape = { id: 'sq', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
  const inner = newVectorDrawing();
  inner.shapes.push(sq);
  doc.drawings[inner.id] = inner;
  doc.symbols = { y: { id: 'y', name: 'Box', length: 1, origin: { x: 10, y: 10 }, layers: [{ id: 'il', name: 'L', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'ic', start: 0, length: 1, drawingId: inner.id }] }] } };
  const inst = (x: number, y: number, rotation: number, s: number): InstanceShape => ({ id: 'i', type: 'instance', symbolId: 'y', transform: { x, y, scaleX: s, scaleY: s, rotation, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 });
  const a = newVectorDrawing();
  a.shapes.push(inst(10, 50, 0, 1));
  const b = newVectorDrawing();
  b.shapes.push(inst(110, 150, 30, 2));
  doc.drawings[a.id] = a;
  doc.drawings[b.id] = b;
  doc.layers[0].cels = [
    { id: 'ka', start: 0, length: 10, drawingId: a.id, tween },
    { id: 'kb', start: 10, length: 2, drawingId: b.id },
  ];
  return doc;
}

type Pose = { x: number; y: number; rotation: number };
const poseOf = (doc: Doc, layer: Layer, frame: number): Pose => {
  const d = shownDrawing(doc, layer, frame) as VectorDrawing;
  return d.shapes.find(isInstance)!.transform;
};
/** Where the symbol is on every frame of the span (0..10). */
const sample = (doc: Doc): Pose[] => Array.from({ length: 11 }, (_, f) => ({ ...poseOf(doc, doc.layers[0], f) }));
/** The turn between two angles, 0..180. */
const turnBetween = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
/** Largest gap in place (px) and in turn (degrees) between two samples. */
function gap(a: Pose[], b: Pose[]): { px: number; deg: number } {
  let px = 0;
  let deg = 0;
  a.forEach((p, i) => {
    px = Math.max(px, Math.hypot(p.x - b[i].x, p.y - b[i].y));
    deg = Math.max(deg, turnBetween(p.rotation, b[i].rotation));
  });
  return { px, deg };
}

// The follower measures distance along the path exactly and faces the curve's own tangent, so the pieces of a cut path
// play the same motion as the whole, to well under these bounds (px, degrees).
const PX = 0.01;
const stepDeg = 0.05;
const degFor = (_t: Tween) => stepDeg;

const EASES: Easing[] = ['linear', 'easeInOut', 'bounceOut', [0.2, 0.9, 0.3, 1]];
const TWEENS: [string, (ease: Easing) => Tween][] = [
  ['no extras', (ease) => ({ ease })],
  ['two spins', (ease) => ({ ease, spin: 2 })],
  ['a backwards spin', (ease) => ({ ease, spin: -3 })],
  ['a motion path', (ease) => ({ ease, path: structuredClone(WAVY) })],
  ['a path that turns to face along it', (ease) => ({ ease, path: structuredClone(ARC) })],
  ['a path, orient and two spins', (ease) => ({ ease, spin: 2, path: structuredClone(ARC) })],
];

describe('cutting a tween by time keeps the motion', () => {
  beforeEach(() => setChoice('draw.tweenFrame', 'new-key'));
  afterEach(() => setChoice('draw.tweenFrame', undefined));

  for (const [name, make] of TWEENS) {
    for (const ease of EASES) {
      it(`drawing mid-span: ${name}, ${typeof ease === 'string' ? ease : 'custom curve'}`, () => {
        let cuts = 0;
        for (const cutAt of [1, 3, 5, 7, 9]) {
          const doc = symbolDoc(make(ease));
          const before = sample(doc);
          resetStore(doc);
          store().setUi({ activeLayerId: doc.layers[0].id, frame: cutAt });
          const refused = cutProblem(doc.layers[0].cels[0].tween, cutAt / 10, 10);
          expect(editActiveDrawing('Draw', 'vector', () => {})).toBe(refused ? 'overshoot' : 'ok');
          if (refused) {
            expect(store().get().doc.layers[0].cels).toHaveLength(2);
            continue;
          }
          cuts++;
          const after = store().get().doc;
          expect(after.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, cutAt], [cutAt, 10 - cutAt], [10, 2]]);
          const g = gap(before, sample(after));
          expect(g.px).toBeLessThan(PX);
          expect(g.deg).toBeLessThan(degFor(after.layers[0].cels[0].tween!));
        }
        expect(cuts).toBeGreaterThan(1);
      });
    }
  }

  it('cutting the second half again still matches (slices of slices)', () => {
    const doc = symbolDoc({ ease: 'easeInOut', spin: 2, path: structuredClone(ARC) });
    const before = sample(doc);
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 3 });
    editActiveDrawing('Draw', 'vector', () => {});
    store().setUi({ frame: 7 });
    editActiveDrawing('Draw', 'vector', () => {});
    store().setUi({ frame: 5 });
    editActiveDrawing('Draw', 'vector', () => {});
    const after = store().get().doc;
    expect(after.layers[0].cels.map((c) => c.start)).toEqual([0, 3, 5, 7, 10]);
    const g = gap(before, sample(after));
    expect(g.px).toBeLessThan(PX);
    expect(g.deg).toBeLessThan(stepDeg);
  });

  it('shares the spin by whole turns and keeps the easing slices', () => {
    const { first, second, turns } = cutTween({ ease: 'linear', spin: 2 }, 0.5);
    expect([turns, first.spin, second.spin]).toEqual([1, 1, 1]);
    // 25% of two turns is half a turn: it shows on the new key, and the second half carries the rest.
    const q = cutTween({ ease: 'linear', spin: 2 }, 0.25);
    expect([q.turns, q.first.spin, q.second.spin]).toEqual([0, undefined, 2]);
    expect(q.first.slice).toEqual([0, 0.25]);
    expect(q.second.slice).toEqual([0.25, 1]);
  });

  it('uses the eased progress, so with easing the split matches what shows', () => {
    // Ease in-out has gone only 0.1 of the way a fifth in.
    const e = tweenEase({ ease: 'easeInOut' }, 0.4);
    const { first, second } = cutTween({ ease: 'easeInOut', spin: 10 }, 0.4);
    expect(e).toBeCloseTo(0.256, 3);
    expect((first.spin ?? 0) + (second.spin ?? 0)).toBe(10);
    expect(first.spin).toBe(2);
  });

  it('hands each half its piece of the path, joined where the object was', () => {
    const [a, b] = splitPath(WAVY.points, 0.4);
    expect(a[0]).toEqual(WAVY.points[0]);
    expect(b[b.length - 1]).toEqual(WAVY.points[3]);
    expect(a[a.length - 1].x).toBeCloseTo(b[0].x, 9);
    expect(a[a.length - 1].y).toBeCloseTo(b[0].y, 9);
    expect(cutTween({ ease: 'linear', path: WAVY }, 0.4).first.path?.orient).toBe(false);
    expect(cutTween({ ease: 'linear', path: { ...WAVY, orient: true } }, 0.4).second.path?.orient).toBe(true);
  });

  it('refuses a morph, and a path where the easing swings past its end', () => {
    expect(cutProblem({ kind: 'shape', ease: 'linear' }, 0.5, 10)).toMatch(/morph/);
    expect(cutProblem({ ease: 'linear', hints: [{ id: 'h', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }] }, 0.5, 10)).toMatch(/morph/);
    expect(cutProblem({ ease: 'linear', path: WAVY }, 0.5, 10)).toBeNull();
    expect(cutProblem({ ease: 'easeInOut', path: WAVY }, 0.5, 10)).toBeNull();
    // A bounce runs back over the path after the first landing, so only a cut before it is clean.
    expect(cutProblem({ ease: 'bounceOut', path: WAVY }, 0.2, 10)).toBeNull();
    expect(cutProblem({ ease: 'bounceOut', path: WAVY }, 0.6, 10)).toMatch(/back and forth/);
    expect(cutProblem({ ease: 'elasticOut', path: WAVY }, 0.1, 10)).toMatch(/back and forth/);
    // Spin has no such limit: it is the same linear share whatever the easing does.
    expect(cutProblem({ ease: 'elasticOut', spin: 1 }, 0.1, 10)).toBeNull();
  });

  it('drawing inside a morph says so in plain words and changes nothing', () => {
    const doc = symbolDoc({ kind: 'shape', ease: 'linear' });
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 4 });
    expect(editActiveDrawing('Draw', 'vector', () => {})).toBe('morph');
    expect(store().get().doc.layers[0].cels).toHaveLength(2);
  });

  describe('moving a key of another row into the span', () => {
    for (const [name, make] of TWEENS) {
      for (const ease of EASES.slice(0, 3)) {
        it(`${name}, ${typeof ease === 'string' ? ease : 'custom curve'}`, () => {
          for (const cutAt of [2, 5, 8]) {
            const doc = symbolDoc(make(ease));
            const before = sample(doc);
            const layer = doc.layers[0];
            const ref = layerTracks(structuredClone(doc), structuredClone(doc).layers[0]);
            const scaleKey = ref.find((t) => t.id === 'scale')!.keys.find((k) => k.frame === 10)!.ref;
            if (cutProblem(layer.cels[0].tween, cutAt / 10, 10)) {
              expect(retimeKeys(doc, [scaleKey], () => cutAt)).toBeNull();
              continue;
            }
            expect(retimeKeys(doc, [scaleKey], () => cutAt)).not.toBeNull();
            expect(layer.cels.map((c) => c.start)).toEqual([0, cutAt, 10]);
            const g = gap(before, sample(doc));
            expect(g.px).toBeLessThan(PX);
            expect(g.deg).toBeLessThan(degFor(layer.cels[0].tween!));
          }
        });
      }
    }

    it('refuses inside a morph with a plain message', () => {
      const doc = symbolDoc({ kind: 'shape', ease: 'linear' });
      const scaleKey = layerTracks(structuredClone(doc), structuredClone(doc).layers[0]).find((t) => t.id === 'scale')!.keys.find((k) => k.frame === 10)!.ref;
      expect(retimeKeys(doc, [scaleKey], () => 5)).toBeNull();
    });
  });

  describe('on the camera', () => {
    function cameraDoc(tween: Tween): Doc {
      const doc = newDoc({ width: 400, height: 300, length: 12 });
      const { layer, drawing } = newCameraLayer(doc);
      const b: CameraDrawing = newCameraDrawing({ ...plainView(doc), x: 180, y: 120, zoom: 2, rotation: 20 });
      doc.drawings[drawing.id] = drawing;
      doc.drawings[b.id] = b;
      layer.cels = [
        { id: 'c0', start: 0, length: 10, drawingId: drawing.id, tween },
        { id: 'c1', start: 10, length: 2, drawingId: b.id },
      ];
      doc.layers.push(layer);
      return doc;
    }
    const view = (doc: Doc, f: number) => cameraViewOn(doc, doc.layers.find((l) => l.kind === 'camera')!, f)!;
    for (const [name, make] of [['a spin', (e: Easing): Tween => ({ ease: e, spin: 2 })], ['a path', (e: Easing): Tween => ({ ease: e, path: structuredClone(WAVY) })]] as const) {
      for (const ease of ['linear', 'easeInOut'] as Easing[]) {
        it(`${name}, ${ease}`, () => {
          const doc = cameraDoc(make(ease));
          const cam = doc.layers.find((l) => l.kind === 'camera')!;
          const before = Array.from({ length: 11 }, (_, f) => ({ ...view(doc, f) }));
          const zoomKey = layerTracks(structuredClone(doc), structuredClone(cam)).find((t) => t.id === 'cam-zoom')!.keys.find((k) => k.frame === 10)!.ref;
          expect(retimeKeys(doc, [zoomKey], () => 4)).not.toBeNull();
          expect(celAt(cam, 4)!.start).toBe(4);
          for (let f = 0; f <= 10; f++) {
            const v = view(doc, f);
            expect(Math.hypot(v.x - before[f].x, v.y - before[f].y)).toBeLessThan(PX);
            expect(turnBetween(v.rotation, before[f].rotation)).toBeLessThan(0.01);
          }
        });
      }
    }
  });
});
