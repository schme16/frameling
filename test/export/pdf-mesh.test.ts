import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { Doc, Layer, PathShape, VectorDrawing, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isPosed, poseAt } from '../../src/core/symbols';
import { addBone, attachLayer, bendLayer, ensureRig, setPose } from '../../src/rig/ops';
import { setChoice } from '../../src/core/choices';
import { drawingHasMesh, flatPlan, needsPicture, soloDoc } from '../../src/export/layered';
import { writePdf } from '../../src/export/pdf';
import type { RawImage } from '../../src/io/png';

function box(id: string, x: number, y: number, w: number, h: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

/** A stage with a vector "Arm", a pixel "Sprite" and a bones layer with two bones along them. */
function setup() {
  const doc = newDoc({ width: 200, height: 200, length: 20 });
  const d = newVectorDrawing();
  d.shapes.push(box('bar', 0, -5, 100, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].name = 'Arm';
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  const px = Object.assign(newPixelLayer('Sprite', 4), { id: 'sprite' });
  const pd = newPixelDrawing(10, 4);
  for (let i = 0; i < 40; i++) pd.pixels.set([0, 0, 255, 255], i * 4);
  doc.drawings[pd.id] = pd;
  px.cels.push({ id: 'c2', start: 0, length: 20, drawingId: pd.id });
  doc.layers.push(px);
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  addBone(rigId, { x: 0, y: 0 }, { x: 20, y: 0 }, null, 'Upper');
  const s = store().get().doc;
  const upper = (s.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones[0].id;
  addBone(rigId, { x: 20, y: 0 }, { x: 40, y: 0 }, upper, 'Lower');
  const lower = (store().get().doc.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones[1].id;
  return { armId: doc.layers[0].id, spriteId: 'sprite', rigId, lower };
}

const cur = (): Doc => store().get().doc;
const layer = (id: string) => cur().layers.find((l) => l.id === id)! as Layer;
const tiny: RawImage = { width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(255) };

describe('PDF with art bent on bones', () => {
  let ids: ReturnType<typeof setup>;
  beforeEach(() => {
    setChoice('rig.newPose', 'glide');
    ids = setup();
  });

  it('a vector layer bent on a mesh becomes a picture; one that only moves with a bone stays vector', () => {
    expect(needsPicture(layer(ids.armId), 0, cur())).toBe(false);
    attachLayer(ids.armId, ids.rigId, ids.lower);
    setPose(ids.rigId, { [ids.lower]: { r: 45 } });
    expect(needsPicture(layer(ids.armId), 0, cur())).toBe(false);
    expect(bendLayer(ids.armId, ids.rigId)).toBeUndefined();
    // Posing again gives a fresh state (poses are cached per state, so the check sees the bend).
    setPose(ids.rigId, { [ids.lower]: { r: 30 } });
    expect(needsPicture(layer(ids.armId), 0, cur())).toBe(true);
    const plan = flatPlan(cur(), 0);
    const arm = plan.find((u) => u.kind === 'picture' && u.layers[0].id === ids.armId);
    expect(arm).toBeTruthy();
    // The layer's own opacity and blend ride on the picture, as for a layer with effects.
    expect(arm!.kind === 'picture' && arm!.own?.id).toBe(ids.armId);
  });

  it('a bent pixel layer goes through the renderer too', () => {
    expect(bendLayer(ids.spriteId, ids.rigId)).toBeUndefined();
    setPose(ids.rigId, { [ids.lower]: { r: 45 } });
    const plan = flatPlan(cur(), 0);
    expect(plan.some((u) => u.kind === 'picture' && u.layers[0].id === ids.spriteId)).toBe(true);
    expect(drawingHasMesh(poseAt(cur(), layer(ids.spriteId), 0))).toBe(true);
  });

  it('asks the renderer for the bent layer when writing the PDF', () => {
    bendLayer(ids.armId, ids.rigId);
    setPose(ids.rigId, { [ids.lower]: { r: 45 } });
    const asked: string[][] = [];
    const bytes = writePdf(cur(), {
      frames: [0],
      scale: 1,
      background: '#ffffff',
      title: 'T',
      picture: (_f, layers) => {
        asked.push(layers.map((l) => l.id));
        return tiny;
      },
    });
    expect(asked).toEqual([[ids.armId], [ids.spriteId]]);
    expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image');
  });

  it('finds a mesh inside a symbol instance, however deep', () => {
    const inner: VectorDrawing = { id: 'in', kind: 'vector', shapes: [] };
    const posedLayer = (mesh: boolean, drawing: VectorDrawing | null) => ({ drawing: drawing ?? inner, opacity: 1, pixelSize: 1, ...(mesh ? { mesh: { src: [0, 0], dst: [0, 0], triangles: [] } } : {}) });
    const inst = (layers: ReturnType<typeof posedLayer>[]) => ({ id: 'i', type: 'instance' as const, symbolId: '', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'single' as const, firstFrame: 0, posed: { matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number], layers } });
    const flat: VectorDrawing = { id: 'f', kind: 'vector', shapes: [inst([posedLayer(false, null)])] };
    const bent: VectorDrawing = { id: 'b', kind: 'vector', shapes: [inst([posedLayer(true, null)])] };
    const deep: VectorDrawing = { id: 'd', kind: 'vector', shapes: [inst([posedLayer(false, bent)])] };
    expect(drawingHasMesh(flat)).toBe(false);
    expect(drawingHasMesh(bent)).toBe(true);
    expect(drawingHasMesh(deep)).toBe(true);
    expect(drawingHasMesh(undefined)).toBe(false);
    expect(isPosed(bent.shapes[0])).toBe(true);
  });

  it('a layer picture on its own still sees its bones, so it comes out bent', () => {
    attachLayer(ids.armId, ids.rigId, ids.lower);
    bendLayer(ids.armId, ids.rigId);
    setPose(ids.rigId, { [ids.lower]: { r: 45 } });
    const arm = layer(ids.armId);
    const solo = soloDoc(cur(), arm);
    const shown = poseAt(solo, solo.layers.find((l) => l.id === ids.armId)!, 0);
    expect(drawingHasMesh(shown)).toBe(true);
    // Without the bones layer kept, the art would come out straight (what used to happen).
    const naive = { ...cur(), layers: [{ ...arm, folder: undefined }] };
    expect(drawingHasMesh(poseAt(naive, naive.layers[0], 0))).toBe(false);
  });
});
