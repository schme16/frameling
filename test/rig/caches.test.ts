import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, Layer, PathShape, PixelLayer, VectorDrawing, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isPosed, poseAt } from '../../src/core/symbols';
import { addBone, attachLayer, bendLayer, ensureRig, setPose } from '../../src/rig/ops';
import { setLayerMesh } from '../../src/rig/weightsTool';
import { setChoice } from '../../src/core/choices';
import { drawMeshed, meshStats } from '../../src/core/render';
import { compositePlan, EffectCache } from '../../src/effects/composite';
import { buildPlan } from '../../src/effects/plan';
import { newParticles } from '../../src/particles/model';
import { installFakeCanvas, mainCtx, removeFakeCanvas } from '../perf/fakeCanvas';

function box(id: string, x: number, y: number, w: number, h: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

function setup(): { armId: string; rigId: string; upper: string; lower: string } {
  const doc = newDoc({ width: 200, height: 200, length: 20 });
  const d = newVectorDrawing();
  d.shapes.push(box('bar', 0, -5, 100, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  const upper = addBone(rigId, { x: 0, y: 0 }, { x: 50, y: 0 }, null, 'Upper')!;
  const lower = addBone(rigId, { x: 50, y: 0 }, { x: 100, y: 0 }, upper, 'Lower')!;
  return { armId: doc.layers[0].id, rigId, upper, lower };
}

const layer = (id: string) => store().get().doc.layers.find((l) => l.id === id)! as Layer;
const posedGroup = (id: string) => {
  const d = poseAt(store().get().doc, layer(id), 0) as VectorDrawing;
  const g = d.shapes[0];
  return isPosed(g) ? g.posed : undefined;
};

describe('attached drawings follow changes to the attachment', () => {
  let ids: ReturnType<typeof setup>;
  beforeEach(() => {
    setChoice('rig.newPose', 'glide');
    ids = setup();
    // Lower arm turned, upper at rest: the two bones give different pictures from one rig state.
    setPose(ids.rigId, { [ids.lower]: { r: 90 } });
  });

  it('re-attaching to another bone shows the new bone', () => {
    attachLayer(ids.armId, ids.rigId, ids.lower);
    const onLower = posedGroup(ids.armId);
    expect(onLower?.matrix[1]).toBeCloseTo(1);
    attachLayer(ids.armId, ids.rigId, ids.upper);
    // The upper bone is at rest, so the plain drawing comes back.
    const doc = store().get().doc;
    expect(poseAt(doc, layer(ids.armId), 0)).toBe(doc.drawings[layer(ids.armId).cels[0].drawingId]);
    attachLayer(ids.armId, ids.rigId, ids.lower);
    expect(posedGroup(ids.armId)?.matrix[1]).toBeCloseTo(1);
  });

  it('switching to bending and back changes the picture', () => {
    attachLayer(ids.armId, ids.rigId, ids.lower);
    expect(posedGroup(ids.armId)?.layers[0].mesh).toBeUndefined();
    bendLayer(ids.armId, ids.rigId);
    expect(posedGroup(ids.armId)?.layers[0].mesh).toBeTruthy();
    attachLayer(ids.armId, ids.rigId, ids.lower);
    expect(posedGroup(ids.armId)?.layers[0].mesh).toBeUndefined();
  });

  it('painting weights bends the art differently, and undo and redo bring each picture back', () => {
    bendLayer(ids.armId, ids.rigId);
    const before = posedGroup(ids.armId)!.layers[0].mesh!.dst.slice();
    const mesh = layer(ids.armId).bind!.mesh!;
    // Everything on the upper bone (at rest): the posed points go back to where they are at rest.
    const ui = mesh.bones.indexOf(ids.upper);
    const bones = ui >= 0 ? mesh.bones : [...mesh.bones, ids.upper];
    const bi = ui >= 0 ? ui : bones.length - 1;
    setLayerMesh(ids.armId, { ...mesh, bones, weights: mesh.weights.map(() => [bi, 1]) }, 'Paint bending');
    const after = posedGroup(ids.armId)!.layers[0].mesh!.dst;
    expect(after).not.toEqual(before);
    for (let i = 0; i < after.length; i++) expect(after[i]).toBeCloseTo(mesh.points[i]);
    store().undo();
    expect(posedGroup(ids.armId)!.layers[0].mesh!.dst).toEqual(before);
    store().redo();
    expect(posedGroup(ids.armId)!.layers[0].mesh!.dst).toEqual(after);
  });

  it('undoing a re-attach shows the old bone again', () => {
    attachLayer(ids.armId, ids.rigId, ids.lower);
    const first = poseAt(store().get().doc, layer(ids.armId), 0);
    attachLayer(ids.armId, ids.rigId, ids.upper);
    expect(poseAt(store().get().doc, layer(ids.armId), 0)).not.toBe(first);
    store().undo();
    const was = (first as VectorDrawing).shapes[0];
    expect(isPosed(was)).toBe(true);
    expect(posedGroup(ids.armId)?.matrix).toEqual(isPosed(was) ? was.posed.matrix : null);
  });

  it('an attached pixel layer follows its pixel size', () => {
    store().update('pixel', (d) => {
      const pl = newPixelLayer('Px', 2) as PixelLayer;
      const pd = newPixelDrawing(10, 10);
      d.drawings[pd.id] = pd;
      pl.cels = [{ id: 'pc', start: 0, length: 20, drawingId: pd.id }];
      pl.bind = { rig: ids.rigId, bone: ids.lower };
      d.layers.unshift(pl);
    });
    const id = store().get().doc.layers[0].id;
    expect(posedGroup(id)?.layers[0].pixelSize).toBe(2);
    store().update('size', (d) => {
      (d.layers[0] as PixelLayer).pixelSize = 4;
    });
    expect(posedGroup(id)?.layers[0].pixelSize).toBe(4);
  });
});

describe('other drawing caches', () => {
  beforeEach(installFakeCanvas);
  afterEach(removeFakeCanvas);

  it('a bent picture is cut again when the mesh points move', () => {
    const d = newVectorDrawing();
    d.shapes.push(box('b', 0, 0, 10, 10));
    const tri = [0, 1, 2];
    const a = [0, 0, 10, 0, 0, 10];
    const g = mainCtx() as never;
    const n = meshStats.textures;
    drawMeshed(g, d, 1, { src: a, dst: a, triangles: tri });
    drawMeshed(g, d, 1, { src: a, dst: a, triangles: tri });
    expect(meshStats.textures).toBe(n + 1);
    const b = [0, 0, 40, 0, 0, 40];
    drawMeshed(g, d, 1, { src: b, dst: b, triangles: tri });
    expect(meshStats.textures).toBe(n + 2);
  });

  it('effect results are redone when a pixel layer changes pixel size', () => {
    const doc: Doc = newDoc({ width: 50, height: 50 });
    const pl = newPixelLayer('Px', 2) as PixelLayer;
    const pd = newPixelDrawing(10, 10);
    doc.drawings[pd.id] = pd;
    pl.cels = [{ id: 'pc', start: 0, length: 10, drawingId: pd.id }];
    pl.effects = [{ id: 'e', kind: 'blur', values: { size: 4 } }];
    doc.layers = [pl];
    const cache = new EffectCache();
    let painted = 0;
    const hooks = { paint: () => void painted++, key: (l: Layer) => poseAt(doc, l, 0) };
    const run = (d: Doc) => compositePlan(mainCtx(50, 50) as never, d, 0, buildPlan(d, () => true), hooks, cache);
    run(doc);
    run(doc);
    expect(painted).toBe(1);
    const bigger: Doc = { ...doc, layers: [{ ...pl, pixelSize: 4 }] };
    run(bigger);
    expect(painted).toBe(2);
  });

  it('particles move to match a new frame rate', () => {
    const doc = newDoc({ width: 100, height: 100, fps: 10 });
    const l = newVectorLayer('P') as VectorLayer;
    doc.drawings.v = { id: 'v', kind: 'vector', shapes: [newParticles('p1', 'sparkle', { x: 50, y: 50 })] } as VectorDrawing;
    l.cels = [{ id: 'c', start: 0, length: 20, drawingId: 'v' }];
    doc.layers = [l];
    const t = (d: Doc) => ((poseAt(d, l, 6) as VectorDrawing).shapes[0] as unknown as { posedTime: number }).posedTime;
    expect(t(doc)).toBeCloseTo(0.6);
    expect(t({ ...doc, fps: 20 })).toBeCloseTo(0.3);
  });
});
