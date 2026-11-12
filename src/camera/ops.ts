/**
 * Camera actions, each one undo step. They refuse with a friendly line (returned, and toasted) when they can't.
 */
import type { CameraLayer, CameraView, Doc, Id } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { store, type State } from '../core/store';
import { cameraLayerOf, cameraMatrix, layerCameraMatrix, cameraViewOn, clampZoom, newCameraLayer, plainView, setCameraKey } from '../core/camera';
import { getViewSettings, setViewSettings } from '../canvas/viewSettings';
import type { Mat } from '../core/symbols';
import { toast } from '../ui/toast';

export type Result = string | undefined;

const say = (r: Result): Result => {
  if (r) toast(r, { kind: 'warn' });
  return r;
};

/** The stage's camera layer, if there is one (only the stage has a camera, not symbols). */
export function stageCamera(doc: Doc = store().get().doc): CameraLayer | undefined {
  return doc.editing?.length ? undefined : cameraLayerOf(doc);
}

/** Adds a camera layer on top, holding the plain view for the whole animation, and picks it. */
export function addCamera(): Result {
  const { doc } = store().get();
  if (doc.editing?.length) return say('The camera belongs to the main scene. Go back out of the symbol first.');
  const have = stageCamera(doc);
  if (have) {
    store().setUi({ activeLayerId: have.id, tool: 'camera' });
    return say('There is already a camera. It is picked now.');
  }
  let id: Id = '';
  store().update('Add a camera', (d) => {
    const { layer, drawing } = newCameraLayer(d as Doc);
    d.drawings[drawing.id] = drawing;
    d.layers.push(layer);
    id = layer.id;
  });
  store().setUi({ activeLayerId: id, tool: 'camera' });
  toast('Added a camera. Drag its frame to pan, its corners to zoom and its knob to turn. Change it on another frame and it glides there.', { kind: 'success' });
  return undefined;
}

/** What the camera shows on the playhead's frame (its keys and in-betweens), or undefined with no camera key there. */
export function currentView(s: State = store().get()): CameraView | undefined {
  const cam = stageCamera(s.doc);
  return cam ? cameraViewOn(s.doc, cam, s.ui.frame) : undefined;
}

/**
 * Sets the camera view at the playhead: changes the key there, or makes one (keeping in-betweens going). `coalesce`
 * merges a drag into one undo step.
 */
export function setView(view: Partial<CameraView>, label = 'Move the camera', coalesce?: string): Result {
  const s = store().get();
  const cam = stageCamera(s.doc);
  if (!cam) return say('Add a camera first (Animate > Add a camera).');
  if (cam.locked) return say('The camera layer is locked. Unlock it in the timeline to move it.');
  const now = cameraViewOn(s.doc, cam, s.ui.frame) ?? plainView(s.doc);
  const next: CameraView = { ...now, ...view, zoom: clampZoom(view.zoom ?? now.zoom) };
  const frame = s.ui.frame;
  store().update(
    label,
    (d) => {
      const l = (d.layers as CameraLayer[]).find((x) => x.id === cam.id);
      if (l) setCameraKey(d as Doc, l, frame, next);
    },
    coalesce ? { coalesce } : {},
  );
  return undefined;
}

/** Back to the whole stage on this frame. */
export function resetView(): Result {
  return setView(plainView(store().get().doc), 'Reset the camera');
}

/** Sets how far a layer is from the camera (parallax). 0 is on the stage. */
export function setDepth(layerId: Id, depth: number, coalesce?: string): void {
  const v = Math.max(-0.9, Math.min(100, Number.isFinite(depth) ? depth : 0));
  store().update(
    'Layer distance',
    (d) => {
      const l = d.layers.find((x) => x.id === layerId);
      if (!l) return;
      if (v) l.depth = Math.round(v * 100) / 100;
      else delete l.depth;
    },
    { coalesce: coalesce ?? `depth-${layerId}` },
  );
}

export function toggleThroughCamera(on?: boolean): void {
  setViewSettings({ throughCamera: on ?? !getViewSettings().throughCamera });
}

/** Is the canvas looking through the camera right now? */
export function lookingThrough(s: State = store().get()): boolean {
  if (s.doc.editing?.length) return false;
  const cam = stageCamera(s.doc);
  if (!cam || !cam.visible) return false;
  const v = getViewSettings();
  return v.throughCamera || (s.ui.playing && v.cameraWhilePlaying);
}

/** The camera as the canvas should apply it now (stage to camera space, for layers on the stage), or null. */
export function canvasCamera(s: State = store().get()): { view: CameraView; matrix: Mat } | null {
  if (!lookingThrough(s)) return null;
  const view = currentView(s);
  return view ? { view, matrix: cameraMatrix(s.doc, view) } : null;
}

/**
 * The same, for the picked layer: a layer at another depth moves at its own speed, so tools aimed at it (and the pixel
 * grid over it) go through its own matrix. Falls back to the plain camera matrix for the camera layer or no pick.
 */
export function canvasLayerCamera(s: State = store().get()): Mat | null {
  const cam = canvasCamera(s);
  if (!cam) return null;
  const layer = findLayer(s.doc, s.ui.activeLayerId);
  if (!layer || layer.kind === 'camera') return cam.matrix;
  return layerCameraMatrix(s.doc, layer, cam.view) ?? [1, 0, 0, 1, 0, 0];
}

/** Debug only (the depth guides A/B in brand/ab/depth-guides): draw guides, grid and snap lines on the stage, as before they followed the picked layer. */
let guidesOnStage = false;
export const setGuidesOnStage = (on: boolean): void => void (guidesOnStage = on);
export const getGuidesOnStage = (): boolean => guidesOnStage;

/**
 * The camera for things aimed at, or drawn over, the picked layer: its own matrix (a layer at another depth moves at
 * its own speed), or the plain camera for the stage tools, which work on the stage as a whole. Null with no camera.
 * Pointer aiming, the tool overlay, the stage overlays (guides, grid, selection edge) and the grab handles all use it.
 */
export function overlayCamera(stageTool: boolean, s: State = store().get()): Mat | null {
  return stageTool ? (canvasCamera(s)?.matrix ?? null) : canvasLayerCamera(s);
}

/** True when the playhead is on a camera key's first frame (where changes go to that key, not a new one). */
export function onCameraKey(s: State = store().get()): boolean {
  const cam = stageCamera(s.doc);
  const cel = cam ? celAt(cam, s.ui.frame) : undefined;
  return !!cel && cel.start === s.ui.frame;
}

export function isCameraLayer(s: State, id: Id | null): boolean {
  return findLayer(s.doc, id)?.kind === 'camera';
}
