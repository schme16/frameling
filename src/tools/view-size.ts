// Tool sizes (brush, pencil, pen, eraser, shape outlines) are in what-you-see terms. With the view zoomed they already
// are (the picture just gets bigger). Through a zoomed camera the stage is scaled too, so a size is divided by the
// camera's scale on the layer being drawn on, and comes out the size you see.
import { layerCameraMatrix, sizeThroughCamera } from '../core/camera';
import { store } from '../core/store';
import { canvasCamera } from '../camera/ops';
import { pixelSizeThroughCamera } from '../canvas/pixels';
import { activeLayer } from './edit';
import { penSizeFactor } from '../penmods/active';

/**
 * Stage length per unit of tool size right now: 1 unless the canvas is looking through the camera, times the size factor
 * of a pen modifier when one is on (thin or fat brush, see src/penmods). Every tool's size goes through here, so the
 * modifier changes the person's tools without touching their own size settings.
 */
export function viewSizeFactor(): number {
  return cameraSizeFactor() * penSizeFactor();
}

function cameraSizeFactor(): number {
  const cam = canvasCamera();
  if (!cam) return 1;
  const layer = activeLayer().layer;
  // A layer at another depth moves at another speed, so it's scaled by its own camera matrix.
  const m = layer ? layerCameraMatrix(store().get().doc, layer, cam.view) : cam.matrix;
  return sizeThroughCamera(m);
}

/** A pixel brush size (art pixels) as it comes out through the camera: whole pixels, never below one. */
export function viewPixelSize(size: number): number {
  return pixelSizeThroughCamera(size, viewSizeFactor());
}
