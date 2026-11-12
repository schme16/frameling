// Tool sizes (brush, pencil, pen, eraser, shape outlines) are in what-you-see terms. With the view zoomed they already
// are (the picture just gets bigger). Through a zoomed camera the stage is scaled too, so a size is divided by the
// camera's scale on the layer being drawn on, and comes out the size you see.
import { layerCameraMatrix, sizeThroughCamera } from '../core/camera';
import { store } from '../core/store';
import { canvasCamera } from '../camera/ops';
import { activeLayer } from './edit';

/** Stage length per unit of tool size right now (1 unless the canvas is looking through the camera). */
export function viewSizeFactor(): number {
  const cam = canvasCamera();
  if (!cam) return 1;
  const layer = activeLayer().layer;
  // A layer at another depth moves at another speed, so it's scaled by its own camera matrix.
  const m = layer ? layerCameraMatrix(store().get().doc, layer, cam.view) : cam.matrix;
  return sizeThroughCamera(m);
}
