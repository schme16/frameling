import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { CameraLayer, Doc } from '../../src/core/format';
import { activeCamera, cameraFrameCorners, cameraMatrix, cameraViewAt, mixViews, newCameraLayer, parallaxFactor, plainView, setCameraKey } from '../../src/core/camera';
import { applyMat } from '../../src/core/symbols';
import { saveFile, loadFile } from '../../src/io/file';

function withCamera(): { doc: Doc; cam: CameraLayer } {
  const doc = newDoc({ width: 200, height: 100, length: 20 });
  const { layer, drawing } = newCameraLayer(doc);
  doc.drawings[drawing.id] = drawing;
  doc.layers.push(layer);
  return { doc, cam: layer };
}

describe('camera maths', () => {
  it('the plain view changes nothing', () => {
    const m = cameraMatrix({ width: 200, height: 100 }, plainView({ width: 200, height: 100 }));
    expect(m.map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('zoom 2 on a point puts it in the middle, twice as big', () => {
    const doc = { width: 200, height: 100 };
    const m = cameraMatrix(doc, { x: 40, y: 30, zoom: 2, rotation: 0 });
    const p = applyMat(m, 40, 30);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
    const q = applyMat(m, 50, 30);
    expect(q.x).toBeCloseTo(120);
  });

  it('turning the camera clockwise turns the picture the other way', () => {
    const doc = { width: 200, height: 100 };
    const m = cameraMatrix(doc, { x: 100, y: 50, zoom: 1, rotation: 90 });
    // A point to the right of the centre ends up above it.
    const p = applyMat(m, 110, 50);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(40);
  });

  it('the frame corners are the stage rectangle the camera sees', () => {
    const doc = { width: 200, height: 100 };
    const c = cameraFrameCorners(doc, { x: 100, y: 50, zoom: 2, rotation: 0 });
    expect(c[0].x).toBeCloseTo(50);
    expect(c[0].y).toBeCloseTo(25);
    expect(c[2].x).toBeCloseTo(150);
    expect(c[2].y).toBeCloseTo(75);
  });

  it('far layers move less (parallax)', () => {
    expect(parallaxFactor(undefined)).toBe(1);
    expect(parallaxFactor(1)).toBe(0.5);
    const doc = { width: 200, height: 100 };
    const view = { x: 150, y: 50, zoom: 1, rotation: 0 };
    const near = applyMat(cameraMatrix(doc, view, 1), 100, 50);
    const far = applyMat(cameraMatrix(doc, view, 0.5), 100, 50);
    expect(near.x).toBeCloseTo(50);
    expect(far.x).toBeCloseTo(75);
  });

  it('zoom blends evenly in ratio', () => {
    const v = mixViews({ x: 0, y: 0, zoom: 1, rotation: 0 }, { x: 10, y: 0, zoom: 4, rotation: 90 }, 0.5);
    expect(v.zoom).toBeCloseTo(2);
    expect(v.x).toBe(5);
    expect(v.rotation).toBe(45);
  });
});

describe('camera keys', () => {
  it('a new camera layer holds the plain view for the whole length', () => {
    const { doc, cam } = withCamera();
    expect(activeCamera(doc)).toBe(cam);
    expect(cameraViewAt(doc, 19)).toEqual(plainView(doc));
  });

  it('setting a view mid-hold makes a key there and keeps the in-betweens going', () => {
    const { doc, cam } = withCamera();
    cam.cels[0].tween = { ease: 'linear' };
    setCameraKey(doc, cam, 10, { x: 50, y: 50, zoom: 2, rotation: 0 });
    expect(cam.cels.map((c) => [c.start, c.length])).toEqual([
      [0, 10],
      [10, 10],
    ]);
    expect(cam.cels[1].tween?.ease).toBe('linear');
    const mid = cameraViewAt(doc, 5)!;
    expect(mid.x).toBeCloseTo(75);
    expect(mid.zoom).toBeCloseTo(Math.SQRT2);
    // On the key's own frame it changes that key.
    setCameraKey(doc, cam, 10, { x: 60, y: 50, zoom: 2, rotation: 0 });
    expect(cam.cels).toHaveLength(2);
    expect(cameraViewAt(doc, 10)!.x).toBe(60);
  });

  it('hiding the camera layer turns the camera off', () => {
    const { doc, cam } = withCamera();
    cam.visible = false;
    expect(cameraViewAt(doc, 0)).toBeUndefined();
  });

  it('saves and opens camera layers, depth, shape tweens with hints and the clip flow', () => {
    const { doc, cam } = withCamera();
    setCameraKey(doc, cam, 5, { x: 10, y: 20, zoom: 3, rotation: 15 });
    doc.layers[0].depth = 2;
    doc.layers[0].cels.push({ id: 'v1', start: 0, length: 5, drawingId: 'dv', tween: { kind: 'shape', ease: 'easeOut', hints: [{ id: 'h', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }] } });
    doc.drawings.dv = { id: 'dv', kind: 'vector', shapes: [] };
    doc.clips = [
      { id: 'idle', name: 'idle', start: 0, end: 4, loop: true },
      { id: 'jump', name: 'jump', start: 5, end: 9, loop: false },
    ];
    doc.flow = { start: 'idle', transitions: [{ id: 't1', from: 'idle', to: 'jump', when: 'trigger', trigger: 'jump' }, { id: 't2', from: 'jump', to: 'idle', when: 'end' }, { id: 'bad', from: 'idle', to: 'nope', when: 'end' }] };
    const back = loadFile(saveFile(doc)).doc;
    const c = back.layers.find((l) => l.kind === 'camera')!;
    expect(c.cels).toHaveLength(2);
    expect(cameraViewAt(back, 5)).toEqual({ x: 10, y: 20, zoom: 3, rotation: 15 });
    expect(back.layers[0].depth).toBe(2);
    expect(back.layers[0].cels[0].tween).toEqual({ kind: 'shape', ease: 'easeOut', hints: [{ id: 'h', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }] });
    expect(back.flow?.start).toBe('idle');
    expect(back.flow?.transitions.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(back.flow?.transitions[0].trigger).toBe('jump');
  });
});
