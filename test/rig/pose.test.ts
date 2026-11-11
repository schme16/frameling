import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, Layer, PathShape, VectorDrawing, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isPosed, poseAt } from '../../src/core/symbols';
import { boneBetween } from '../../src/rig/math';
import { rigPoseAt, toLayerSpace } from '../../src/rig/pose';
import { addBone, applySavedPose, attachLayer, autoAttach, bendLayer, currentPose, deleteBone, ensureRig, mirrorCurrentPose, moveJoint, savePose, setPose, writePose } from '../../src/rig/ops';
import { loadFile, saveFile } from '../../src/io/file';
import { setChoice } from '../../src/core/choices';

function box(id: string, x: number, y: number, w: number, h: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

/** A stage with an "arm" layer (a bar from 0 to 100 along y = 0) and a bones layer with two bones along it. */
function setup(): { doc: Doc; armId: string; rigId: string } {
  const doc = newDoc({ width: 200, height: 200, length: 20 });
  const d = newVectorDrawing();
  d.shapes.push(box('bar', 0, -5, 100, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].name = 'Arm';
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  addBone(rigId, { x: 0, y: 0 }, { x: 50, y: 0 }, null, 'Upper');
  const s = store().get().doc;
  const upper = (s.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones[0].id;
  addBone(rigId, { x: 50, y: 0 }, { x: 100, y: 0 }, upper, 'Lower');
  return { doc: store().get().doc, armId: doc.layers[0].id, rigId };
}

const rigOf = (id: string) => (store().get().doc.layers.find((l) => l.id === id) as VectorLayer).rig!;
const layer = (id: string) => store().get().doc.layers.find((l) => l.id === id)! as Layer;

describe('bones in the document', () => {
  let ids: ReturnType<typeof setup>;
  beforeEach(() => {
    setChoice('rig.newPose', 'glide');
    ids = setup();
  });

  it('makes one bones layer on top, holding the whole length', () => {
    const doc = store().get().doc;
    const rigLayer = doc.layers[doc.layers.length - 1] as VectorLayer;
    expect(rigLayer.rig?.bones.map((b) => b.name)).toEqual(['Upper', 'Lower']);
    expect(rigLayer.cels).toHaveLength(1);
    expect(rigLayer.cels[0].length).toBe(20);
    expect(ensureRig()).toBe(ids.rigId);
  });

  it('posing on a new frame makes a key that glides from the last one', () => {
    const upper = rigOf(ids.rigId).bones[0].id;
    store().setUi({ frame: 10 });
    setPose(ids.rigId, { [upper]: { r: 90 } });
    const rl = layer(ids.rigId);
    expect(rl.cels.map((c) => [c.start, c.length])).toEqual([
      [0, 10],
      [10, 10],
    ]);
    expect(rl.cels[0].tween?.ease).toBe('easeInOut');
    const doc = store().get().doc;
    expect(rigPoseAt(doc, rl, 0)).toEqual({});
    expect(rigPoseAt(doc, rl, 10)[upper].r).toBe(90);
    const mid = rigPoseAt(doc, rl, 5)[upper].r;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(90);
    // Past the last key it holds.
    expect(rigPoseAt(doc, rl, 30)[upper].r).toBe(90);
  });

  it('"jump" makes stepped keys with no in-betweens', () => {
    const upper = rigOf(ids.rigId).bones[0].id;
    store().setUi({ frame: 10 });
    store().update('x', (d) => writePose(d, ids.rigId, 10, { [upper]: { r: 90 } }, false));
    const rl = layer(ids.rigId);
    expect(rl.cels[0].tween).toBeUndefined();
    expect(rigPoseAt(store().get().doc, rl, 9)).toEqual({});
  });

  it('attached layers move with their bone; at rest they draw unchanged', () => {
    const upper = rigOf(ids.rigId).bones[0].id;
    attachLayer(ids.armId, ids.rigId, upper);
    const doc = store().get().doc;
    const arm = layer(ids.armId);
    const plain = doc.drawings[arm.cels[0].drawingId];
    expect(poseAt(doc, arm, 0)).toBe(plain);
    store().setUi({ frame: 4 });
    setPose(ids.rigId, { [upper]: { r: 90 } });
    const d2 = store().get().doc;
    const posed = poseAt(d2, layer(ids.armId), 4) as VectorDrawing;
    expect(posed).not.toBe(plain);
    const g = posed.shapes[0];
    expect(isPosed(g)).toBe(true);
    if (!isPosed(g)) return;
    // A quarter turn clockwise about the shoulder.
    expect(g.posed.matrix[0]).toBeCloseTo(0);
    expect(g.posed.matrix[1]).toBeCloseTo(1);
    // The same frame twice is the same object (so the canvas can reuse its picture).
    expect(poseAt(d2, layer(ids.armId), 4)).toBe(posed);
  });

  it('a layer that bends gets a mesh with weights, and is drawn through it', () => {
    expect(bendLayer(ids.armId, ids.rigId)).toBeUndefined();
    const arm = layer(ids.armId);
    expect(arm.bind?.mesh?.triangles.length).toBeGreaterThan(0);
    expect(arm.bind?.mesh?.weights.length).toBe(arm.bind!.mesh!.points.length / 2);
    const lower = rigOf(ids.rigId).bones[1].id;
    setPose(ids.rigId, { [lower]: { r: 45 } });
    const posed = poseAt(store().get().doc, layer(ids.armId), 0) as VectorDrawing;
    const g = posed.shapes[0];
    expect(isPosed(g) && g.posed.layers[0].mesh?.dst.length).toBe(arm.bind!.mesh!.points.length);
  });

  it('auto attach picks the nearest bone for each part', () => {
    const doc = store().get().doc;
    // A second part near the end of the arm.
    store().update('add', (d) => {
      const dr = newVectorDrawing();
      dr.shapes.push(box('hand', 90, -4, 8, 8));
      d.drawings[dr.id] = dr;
      d.layers.splice(1, 0, { id: 'hand', name: 'Hand', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'hc', start: 0, length: 20, drawingId: dr.id }] });
    });
    expect(doc).toBeTruthy();
    expect(autoAttach()).toBe(2);
    const rig = rigOf(ids.rigId);
    expect(layer('hand').bind?.bone).toBe(rig.bones[1].id);
    expect(layer(ids.armId).bind).toBeTruthy();
    expect(autoAttach()).toBe(0);
  });

  it('drawing on a turned part lands on the part', () => {
    const upper = rigOf(ids.rigId).bones[0].id;
    attachLayer(ids.armId, ids.rigId, upper);
    setPose(ids.rigId, { [upper]: { r: 90 } });
    const doc = store().get().doc;
    // On screen the arm points down; a point 30 below the shoulder is 30 along the arm at rest.
    const p = toLayerSpace(doc, ids.armId, 0, 'brush', { x: 0, y: 30 });
    expect(p.x).toBeCloseTo(30);
    expect(p.y).toBeCloseTo(0);
    expect(toLayerSpace(doc, ids.armId, 0, 'pose', { x: 0, y: 30 })).toEqual({ x: 0, y: 30 });
  });

  it('moving a tip drags the joints hanging from it', () => {
    const [upper, lower] = rigOf(ids.rigId).bones;
    moveJoint(ids.rigId, upper.id, 'tip', { x: 60, y: 0 });
    const after = rigOf(ids.rigId);
    expect(after.bones[0].length).toBeCloseTo(60);
    expect(after.bones[1].x).toBeCloseTo(60);
    expect(after.bones[1].length).toBeCloseTo(40);
    expect(lower.parent).toBe(upper.id);
  });

  it('deleting a bone hands its children and parts to its parent', () => {
    const [upper, lower] = rigOf(ids.rigId).bones;
    attachLayer(ids.armId, ids.rigId, lower.id);
    deleteBone(ids.rigId, upper.id);
    const rig = rigOf(ids.rigId);
    expect(rig.bones.map((b) => b.name)).toEqual(['Lower']);
    expect(rig.bones[0].parent).toBeNull();
    deleteBone(ids.rigId, lower.id);
    expect(layer(ids.armId).bind).toBeUndefined();
  });

  it('saves, applies and mirrors poses', () => {
    store().update('names', (d) => {
      const r = (d.layers.find((l) => l.id === ids.rigId) as VectorLayer).rig!;
      r.bones[0].name = 'Left arm';
      r.bones.push(boneBetween('rb', 'Right arm', { x: 0, y: 0 }, { x: -50, y: 0 }, null));
    });
    const left = rigOf(ids.rigId).bones[0].id;
    setPose(ids.rigId, { [left]: { r: 30 } });
    savePose('Wave');
    const saved = rigOf(ids.rigId).poses!;
    expect(saved.map((p) => p.name)).toEqual(['Wave']);
    store().setUi({ frame: 8 });
    applySavedPose(saved[0].id, true);
    expect(currentPose()).toEqual({ rb: { r: -30 } });
    mirrorCurrentPose();
    expect(currentPose()).toEqual({ [left]: { r: 30 } });
  });

  it('survives saving and opening', () => {
    const upper = rigOf(ids.rigId).bones[0].id;
    bendLayer(ids.armId, ids.rigId);
    store().setUi({ frame: 6 });
    setPose(ids.rigId, { [upper]: { r: 20, x: 3 } });
    savePose();
    const back = loadFile(saveFile(store().get().doc)).doc;
    const rl = back.layers.find((l) => l.id === ids.rigId) as VectorLayer;
    expect(rl.rig?.bones).toEqual(rigOf(ids.rigId).bones);
    expect(rl.rig?.poses?.[0].pose).toEqual({ [upper]: { r: 20, x: 3 } });
    expect(rigPoseAt(back, rl, 6)).toEqual({ [upper]: { r: 20, x: 3 } });
    expect(rl.cels[0].tween?.ease).toBe('easeInOut');
    const arm = back.layers.find((l) => l.id === ids.armId)!;
    expect(arm.bind).toEqual(layer(ids.armId).bind);
  });
});

describe('auto attach leaves scenery alone', () => {
  it('skips a floor much wider than the skeleton', () => {
    setup();
    store().update('floor', (d) => {
      const dr = newVectorDrawing();
      dr.shapes.push(box('floor', -400, 150, 1000, 40));
      d.drawings[dr.id] = dr;
      d.layers.unshift({ id: 'floor', name: 'Floor', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'fc', start: 0, length: 20, drawingId: dr.id }] });
    });
    expect(autoAttach()).toBe(1);
    expect(layer('floor').bind).toBeUndefined();
  });
});
