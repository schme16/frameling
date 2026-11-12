// A layer in Lottie hangs off the camera, and the players scale and turn its effects with it: a Drop Shadow's distance
// and softness grow with the zoom and its direction turns with the camera, where the editor puts the effect on what the
// camera sees. So with a zooming or turning camera an effect goes on a precomp over the stage (not hung off the camera;
// its content is), which keeps it in stage pixels. scripts/e2e/shadow-clip.cjs plays the files (zoom, zoomMove, zoomStack).
import { describe, expect, it } from 'vitest';
import type { Doc, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { newCameraLayer, setCameraKey } from '../../src/core/camera';
import { defaultValues } from '../../src/effects/model';
import { lottieExport } from '../../src/export/lottie';
import { addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

type Json = any;
const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });

/** A shadowed box seen through a camera with these two views (the second is optional). */
function boxDoc(first: { x: number; y: number; zoom: number; rotation: number } | null, last?: { x: number; y: number; zoom: number; rotation: number }, effects: LayerEffect[] = [fx('shadow', { x: 12, y: 8, softness: 3 })]): Doc {
  const doc = newDoc({ width: 300, height: 200, length: 8, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Box');
  l.effects = effects;
  hold(l, vectorDrawing(doc, [fill([rectPath(110, 70, 40, 30)], '#9b7bff')]).id, 0, 8);
  if (first) {
    const { layer, drawing } = newCameraLayer(doc);
    doc.drawings[drawing.id] = drawing;
    doc.layers.push(layer);
    setCameraKey(doc, layer, 0, first);
    if (last) {
      setCameraKey(doc, layer, 7, last);
      layer.cels[0].tween = { ease: 'linear' };
    }
  }
  return doc;
}

const still = { x: 150, y: 100, zoom: 1, rotation: 0 };

/** The layer that carries the shadow, and whether it hangs off a camera null. */
function shadowed(data: Json): { layer: Json; inside: Json[] } {
  const layer = data.layers.find((l: Json) => l.ef?.some((e: Json) => e.ty === 25));
  expect(layer).toBeTruthy();
  return { layer, inside: layer.ty === 0 ? data.assets.find((a: Json) => a.id === layer.refId).layers : [] };
}

describe('Lottie effects behind a zooming or turning camera', () => {
  it('a still camera at the default view leaves the shadow on the shape layer', () => {
    const { layer } = shadowed(lottieExport(boxDoc(still)).data);
    expect(layer.ty).toBe(4);
  });

  it('a camera that only pans leaves it there too', () => {
    const { layer } = shadowed(lottieExport(boxDoc(still, { ...still, x: 200, y: 120 })).data);
    expect(layer.ty).toBe(4);
  });

  it('no camera at all: the shape layer, as before', () => {
    expect(shadowed(lottieExport(boxDoc(null)).data).layer.ty).toBe(4);
  });

  it('a zoomed camera puts the shadow on a precomp that is not hung off the camera', () => {
    const { data } = lottieExport(boxDoc({ ...still, zoom: 1.6 }));
    const { layer, inside } = shadowed(data);
    expect(layer.ty).toBe(0);
    expect(layer.parent).toBeUndefined();
    // The box, its room and the camera (with the zoom) are inside, so the effect sees stage pixels.
    expect(inside.some((l: Json) => l.nm === 'Box')).toBe(true);
    expect(inside.some((l: Json) => l.nm === 'Shadow room')).toBe(true);
    const cam = inside.find((l: Json) => l.ty === 3 && l.nm === 'Camera');
    expect(cam.ks.s.k).toEqual([160, 160]);
    // Shadow numbers are the editor's own, not divided by the zoom.
    const distance = layer.ef[0].ef.find((e: Json) => e.nm === 'Distance').v.k;
    expect(distance).toBeCloseTo(Math.hypot(12, 8), 2);
  });

  it('a zoom that comes and goes, or a turn on its own, does the same', () => {
    expect(shadowed(lottieExport(boxDoc(still, { ...still, zoom: 2 })).data).layer.ty).toBe(0);
    expect(shadowed(lottieExport(boxDoc(still, { ...still, rotation: 15 })).data).layer.ty).toBe(0);
  });

  it('a blur follows the same way (its radius would grow with the zoom too)', () => {
    const { layer } = shadowed(lottieExport(boxDoc({ ...still, zoom: 1.6 }, undefined, [fx('shadow', { x: 12, y: 8 }), fx('blur', { radius: 2 })])).data);
    expect(layer.ty).toBe(0);
    expect(layer.ef.map((e: Json) => e.ty)).toEqual([25, 29]);
  });

  it('layers without effects stay hung off the camera', () => {
    const { data } = lottieExport(boxDoc({ ...still, zoom: 1.6 }, undefined, []));
    const box = data.layers.find((l: Json) => l.nm === 'Box');
    expect(box.ty).toBe(4);
    expect(box.parent).toBeTruthy();
  });
});
