import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, Layer, PathShape, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { activeId, artboardDoc, artboardsOf, findArtboard, switchArtboard } from '../../src/artboards/model';
import { aliasId, listDifferences, makeVariation, resetVariation, settleVariations } from '../../src/artboards/variations';
import { bindRig, rigStateAt, type RigLayer } from '../../src/rig/pose';
import { addBone, applySavedPose, attachLayer, bendLayer, currentRig, deleteBone, ensureRig, moveJoint, savePose, setPose } from '../../src/rig/ops';
import { setLayerMesh } from '../../src/rig/weightsTool';
import { loadFile, saveFile } from '../../src/io/file';

const box = (id: string, x: number, y: number, w: number, h: number): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill: '#ff0000', stroke: null, opacity: 1 });

const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));
const open = (id: string) => update('Go', (d) => void switchArtboard(d, id));
const root = () => artboardsOf(doc())[0].id;
const rigIn = (d: Doc, id: string) => d.layers.find((l) => l.id === id) as RigLayer;

/** A bar with two bones, a bound arm layer and a bent layer, posed at frame 10. Returns the ids. */
function setup() {
  const d0 = newDoc({ width: 200, height: 200, length: 20 });
  const d = newVectorDrawing();
  d.shapes.push(box('bar', 0, -5, 100, 10));
  d0.drawings[d.id] = d;
  d0.layers[0].name = 'Arm';
  d0.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  const d2 = newVectorDrawing();
  d2.shapes.push(box('bar2', 0, 20, 100, 10));
  d0.drawings[d2.id] = d2;
  const second: Layer = { ...(d0.layers[0] as Layer), id: 'Body', name: 'Body', cels: [{ id: 'c2', start: 0, length: 20, drawingId: d2.id }] } as Layer;
  d0.layers.push(second);
  resetStore(d0);
  store().setUi({ activeLayerId: d0.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  const upper = addBone(rigId, { x: 0, y: 0 }, { x: 50, y: 0 }, null, 'Upper')!;
  const lower = addBone(rigId, { x: 50, y: 0 }, { x: 100, y: 0 }, upper, 'Lower')!;
  attachLayer(d0.layers[0].id, rigId, lower);
  store().setUi({ frame: 10 });
  setPose(rigId, { [upper]: { r: 30 } });
  return { rigId, upper, lower, arm: d0.layers[0].id };
}

beforeEach(() => setChoice('rig.newPose', 'glide'));

describe('variations: rigs', () => {
  it('a pose changed in a variation stays in it, and the original keeps its own', () => {
    const { rigId, upper, arm } = setup();
    let v = '';
    update('Make', (d) => void (v = makeVariation(d, activeId(d))!));
    open(v);
    store().setUi({ activeLayerId: arm, frame: 10 });
    // The variation's picture of the skeleton at frame 10 starts as the original's.
    const was = rigStateAt(doc(), rigIn(doc(), rigId), 10).get(upper)!;
    setPose(rigId, { [upper]: { r: 80 } });
    const now = rigStateAt(doc(), rigIn(doc(), rigId), 10).get(upper)!;
    expect(now.base).toEqual(was.base);
    expect(now.tip).not.toEqual(was.tip);
    open(root());
    const orig = rigStateAt(artboardDoc(doc(), root()), rigIn(artboardDoc(doc(), root()), rigId), 10).get(upper)!;
    expect(orig.tip).toEqual(was.tip);
    const vd = artboardDoc(doc(), v);
    expect(rigStateAt(vd, rigIn(vd, rigId), 10).get(upper)!.tip).toEqual(now.tip);
    expect(settleVariations(doc())).toBeNull();
  });

  it('bones, joints, attachments and saved poses made in a variation are its own', () => {
    const { rigId, upper, lower, arm } = setup();
    let v = '';
    update('Make', (d) => void (v = makeVariation(d, activeId(d))!));
    open(v);
    store().setUi({ activeLayerId: rigId, frame: 10 });
    const hand = addBone(rigId, { x: 100, y: 0 }, { x: 130, y: 0 }, lower, 'Hand')!;
    moveJoint(rigId, upper, 'tip', { x: 40, y: 20 });
    savePose('Wave');
    attachLayer(arm, rigId, upper);
    expect(rigIn(doc(), rigId).rig.bones.map((b) => b.name)).toEqual(['Upper', 'Lower', 'Hand']);
    open(root());
    const orig = rigIn(doc(), rigId).rig;
    expect(orig.bones.map((b) => b.name)).toEqual(['Upper', 'Lower']);
    expect(orig.poses).toBeUndefined();
    expect(doc().layers.find((l) => l.id === arm)!.bind!.bone).toBe(lower);
    // In the closed variation, the root document finds the variation's own bones, not the original's.
    const closed = findArtboard(doc(), v)!.content!;
    const art = closed.layers.find((l) => l.id === arm)!;
    expect(art.bind!.bone).toBe(upper);
    expect(bindRig(doc(), art)).toBe(closed.layers.find((l) => l.id === rigId));
    expect(bindRig(doc(), art)!.rig.bones.map((b) => b.id)).toContain(hand);
    expect(bindRig(doc(), doc().layers.find((l) => l.id === arm)!)).toBe(doc().layers.find((l) => l.id === rigId));
    const labels = listDifferences(doc(), v).map((i) => i.label);
    expect(labels.some((l) => l.includes('bones'))).toBe(true);
    expect(labels.some((l) => l.includes('bone changed') || l.includes('Layer: bone'))).toBe(true);
    expect(settleVariations(doc())).toBeNull();
    // A later pose in the original still reaches the variation where the variation has not posed that key.
    store().setUi({ activeLayerId: rigId, frame: 15 });
    setPose(rigId, { [lower]: { r: 20 } });
    const key = (c: { layers: Layer[] }) => c.layers.find((l) => l.id === rigId)!.cels.map((x) => x.start);
    expect(key(findArtboard(doc(), v)!.content!)).toEqual(key(doc()));
  });

  it('a layer that bends keeps its own weights in a variation', () => {
    const { rigId, arm } = setup();
    store().setUi({ activeLayerId: arm });
    expect(bendLayer(arm, rigId)).toBeUndefined();
    let v = '';
    update('Make', (d) => void (v = makeVariation(d, activeId(d))!));
    open(v);
    const mesh = doc().layers.find((l) => l.id === arm)!.bind!.mesh!;
    const painted = { ...mesh, weights: mesh.weights.map((w) => [...w].reverse()) };
    setLayerMesh(arm, painted, 'Paint weights');
    open(root());
    expect(doc().layers.find((l) => l.id === arm)!.bind!.mesh!.weights).toEqual(mesh.weights);
    const mine = findArtboard(doc(), v)!.content!.layers.find((l) => l.id === arm)!;
    expect(mine.bind!.mesh!.weights).toEqual(painted.weights);
    // Each artboard's own picture of the layer is bent by its own weights.
    const frame = 10;
    const a = artboardDoc(doc(), root());
    const b = artboardDoc(doc(), v);
    expect(bindRig(a, a.layers.find((l) => l.id === arm)!)).toBeTruthy();
    expect(bindRig(b, b.layers.find((l) => l.id === arm)!)).toBeTruthy();
    expect(rigStateAt(b, rigIn(b, rigId), frame)).toBeTruthy();
    // Dropping the bones layer from the variation leaves the art with no skeleton, not the original's.
    open(v);
    update('Remove skeleton', (d) => void (d.layers = d.layers.filter((l) => l.id !== rigId)));
    const here = doc().layers.find((l) => l.id === arm)!;
    expect(bindRig(doc(), here)).toBeUndefined();
    open(root());
    expect(bindRig(doc(), findArtboard(doc(), v)!.content!.layers.find((l) => l.id === arm)!)).toBeUndefined();
    expect(bindRig(doc(), doc().layers.find((l) => l.id === arm)!)).toBeTruthy();
  });

  it('a variation with bones saves, opens and resets', () => {
    const { rigId, upper } = setup();
    let v = '';
    update('Make', (d) => void (v = makeVariation(d, activeId(d))!));
    open(v);
    store().setUi({ activeLayerId: rigId, frame: 10 });
    setPose(rigId, { [upper]: { r: 70 } });
    deleteBone(rigId, upper);
    open(root());
    const loaded = loadFile(saveFile(doc()));
    expect(loaded.warnings).toEqual([]);
    const c = findArtboard(loaded.doc, v)!.content!;
    expect((c.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones.map((b) => b.name)).toEqual(['Lower']);
    resetStore(loaded.doc);
    update('Reset', (d) => void resetVariation(d, v));
    expect((findArtboard(doc(), v)!.content!.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones).toHaveLength(2);
    expect(aliasId('x', v)).toContain(v);
    expect(currentRig()).toBeTruthy();
    expect(applySavedPose).toBeTypeOf('function');
  });
});
