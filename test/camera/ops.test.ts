import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { CameraLayer, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { cameraViewAt } from '../../src/core/camera';
import { addCamera, canvasCamera, lookingThrough, resetView, setDepth, setView, stageCamera, toggleThroughCamera } from '../../src/camera/ops';
import { makeTween } from '../../src/symbols/ops';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { renderFrame } from '../../src/core/render';

const square: PathShape = { id: 'q', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }], fill: '#ff0000', stroke: null, opacity: 1 };

beforeEach(() => {
  const doc = newDoc({ width: 200, height: 100, length: 20 });
  const d: VectorDrawing = { ...newVectorDrawing(), shapes: [square] };
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  resetStore(doc);
  setViewSettings({ throughCamera: false, cameraWhilePlaying: true });
});

describe('camera actions', () => {
  it('adds one camera on top, picks it, and is one undo step', () => {
    addCamera();
    const s = store().get();
    const cam = stageCamera(s.doc)!;
    expect(s.doc.layers[s.doc.layers.length - 1]).toBe(cam);
    expect(s.ui.activeLayerId).toBe(cam.id);
    expect(s.ui.tool).toBe('camera');
    addCamera();
    expect(store().get().doc.layers.filter((l) => l.kind === 'camera')).toHaveLength(1);
    store().undo();
    expect(stageCamera(store().get().doc)).toBeUndefined();
  });

  it('moving it on another frame makes a key there, and in-betweens glide', () => {
    addCamera();
    store().setUi({ frame: 10 });
    setView({ x: 150, zoom: 2 });
    let cam = stageCamera(store().get().doc) as CameraLayer;
    expect(cam.cels.map((c) => c.start)).toEqual([0, 10]);
    store().setUi({ frame: 0 });
    makeTween();
    cam = stageCamera(store().get().doc) as CameraLayer;
    expect(cam.cels[0].tween).toBeTruthy();
    const mid = cameraViewAt(store().get().doc, 5)!;
    expect(mid.x).toBeGreaterThan(100);
    expect(mid.x).toBeLessThan(150);
    store().setUi({ frame: 10 });
    resetView();
    expect(cameraViewAt(store().get().doc, 10)).toEqual({ x: 100, y: 50, zoom: 1, rotation: 0 });
  });

  it('a drag is one undo step', () => {
    addCamera();
    store().setUi({ frame: 4 });
    for (let i = 1; i <= 5; i++) setView({ x: 100 + i * 5 }, 'Move the camera', 'drag-1');
    expect(cameraViewAt(store().get().doc, 4)!.x).toBe(125);
    store().undo();
    expect((stageCamera(store().get().doc) as CameraLayer).cels).toHaveLength(1);
  });

  it('depth is stored only when it is not 0', () => {
    const id = store().get().doc.layers[0].id;
    setDepth(id, 2);
    expect(store().get().doc.layers[0].depth).toBe(2);
    setDepth(id, 0);
    expect('depth' in store().get().doc.layers[0]).toBe(false);
  });

  it('looks through the camera when asked, or while playing', () => {
    addCamera();
    expect(lookingThrough()).toBe(false);
    toggleThroughCamera(true);
    expect(lookingThrough()).toBe(true);
    expect(canvasCamera()?.view.zoom).toBe(1);
    toggleThroughCamera(false);
    store().setUi({ playing: true });
    expect(lookingThrough()).toBe(true);
    setViewSettings({ cameraWhilePlaying: false });
    expect(lookingThrough()).toBe(false);
  });
});

describe('rendering through the camera', () => {
  // Node has no canvas: a context that writes down the transforms it gets is enough to see the camera applied.
  function recorder() {
    const transforms: number[][] = [];
    const g: any = new Proxy({} as Record<string, unknown>, {
      get(t, name: string) {
        if (name in t) return t[name];
        if (name === 'transform') return (...a: number[]) => void transforms.push(a);
        if (name === 'getTransform') return () => ({});
        return () => {};
      },
      set(t, name: string, v) {
        t[name] = v;
        return true;
      },
    });
    return { g, transforms };
  }

  it('exports see what the camera sees (far layers less), the editor view can leave it out', () => {
    (globalThis as any).Path2D ??= class {
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      closePath() {}
    };
    addCamera();
    setView({ x: 5, y: 5, zoom: 10 });
    const doc = store().get().doc;
    const a = recorder();
    renderFrame(a.g, doc, 0);
    expect(a.transforms).toHaveLength(1);
    expect(a.transforms[0].map((v) => Math.round(v * 1000) / 1000 + 0)).toEqual([10, 0, 0, 10, 50, 0]);
    const b = recorder();
    renderFrame(b.g, doc, 0, { camera: false });
    expect(b.transforms).toHaveLength(0);
    // A far layer zooms less.
    setDepth(doc.layers[0].id, 1);
    const c = recorder();
    renderFrame(c.g, store().get().doc, 0);
    expect(c.transforms[0][0]).toBeCloseTo(Math.sqrt(10));
  });
});
