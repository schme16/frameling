// What the picture window shows, worked out from what it was told. Pure functions, so every decision is testable.
import type { CameraView, Doc, Layer, StrokeShape } from '../core/format';
import { rootDoc } from '../core/symbols';
import { cameraLayerOf, cameraViewOn, layerCameraMatrix } from '../core/camera';
import { overlayMatrix } from '../rig/pose';
import { fitView, stageDeviceRect, type Rect } from '../canvas/view';
import type { FrameParams } from '../canvas/pipeline';
import type { Live } from '../canvas/controller';
import type { LiveDrawing } from './protocol';
import type { Mat } from '../core/symbols';

/** What the window does about a camera. */
export type CameraChoice = 'camera' | 'same';
/** What the window does about marks. */
export type MarksChoice = 'hide' | 'show';

/**
 * The page the window shows. While a symbol is open for editing the drawing window shows the inside of the symbol; the
 * picture window keeps showing the whole page, with the symbol in it, at the frame the playhead had outside.
 */
export function pageOf(doc: Doc): Doc {
  return rootDoc(doc);
}

/** The frame the picture window shows: the playhead, or (inside a symbol) the playhead outside it. */
export function shownFrame(doc: Doc, frame: number): number {
  const outer = doc.editing?.[0]?.frame ?? frame;
  return Math.max(0, Math.min(Math.max(0, pageOf(doc).length - 1), outer));
}

/**
 * Whether to look through the camera. With a camera that shows, "the camera" always does (it is what an export shows),
 * and "same" does what the drawing window does at that moment. No camera, or a hidden one: never.
 */
export function throughCamera(choice: CameraChoice, doc: Doc, mainLooksThrough: boolean): boolean {
  const cam = cameraLayerOf(pageOf(doc));
  if (!cam || !cam.visible) return false;
  return choice === 'camera' ? true : mainLooksThrough;
}

/** Marks show when asked for and the drawing is still: not while it plays, not looking through the camera (an export would not have them). */
export function marksVisible(choice: MarksChoice, playing: boolean, camera: boolean, mainShows: boolean): boolean {
  return choice === 'show' && mainShows && !playing && !camera;
}

/** The camera's view on a frame, when there is one. */
export function cameraAt(doc: Doc, frame: number): CameraView | undefined {
  const page = pageOf(doc);
  const cam = cameraLayerOf(page);
  return cam ? cameraViewOn(page, cam, frame) : undefined;
}

/** The smallest art pixel of any pixel layer (document pixels per art pixel), or 0 with none: pixel art is shown at a size where every art pixel is the same whole number of screen pixels. */
export function artPixel(doc: Doc): number {
  let px = 0;
  for (const l of doc.layers) if (l.kind === 'pixel') px = px ? Math.min(px, l.pixelSize) : l.pixelSize;
  return px;
}

/** Where the page sits on a canvas of this size (device pixels), as big as it will go with a thin margin. */
export function fitPage(width: number, height: number, doc: Doc, dpr: number): Rect {
  const v = fitView(width / dpr, height / dpr, doc.width, doc.height, 16, artPixel(doc));
  return stageDeviceRect(v, doc.width, doc.height, dpr);
}

/** The same page with reference pictures left out: like an export, they are for tracing, not part of the picture. */
const noPics = new WeakMap<Doc, Doc>();
export function withoutPictures(doc: Doc): Doc {
  if (!doc.layers.some((l) => l.picture)) return doc;
  let d = noPics.get(doc);
  if (!d) {
    d = { ...doc, layers: doc.layers.map((l): Layer => (l.picture ? ({ ...l, picture: undefined } as Layer) : l)) };
    noPics.set(doc, d);
  }
  return d;
}

/** A layer's half-done change, in the shape the painter takes. */
export function liveOf(l: LiveDrawing | null, doc: Doc): Live | null {
  if (!l || doc.editing?.length) return null;
  return { layerId: l.layerId, kind: 'vector', drawing: l.drawing };
}

/** The matrix a stroke in progress is drawn through (the layer's camera speed, then any bone it is attached to). */
export function inkMatrix(doc: Doc, layerId: string | null, frame: number, camera: CameraView | undefined): Mat[] {
  const out: Mat[] = [];
  const layer = layerId ? doc.layers.find((l) => l.id === layerId) : undefined;
  if (camera && layer) {
    const m = layerCameraMatrix(doc, layer, camera);
    if (m) out.push(m);
  }
  const bm = overlayMatrix(doc, layerId, frame, 'brush');
  if (bm) out.push(bm);
  return out;
}

export type { StrokeShape, FrameParams };
