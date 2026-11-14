/** Drawing a cached layer bitmap (see BitmapCache in pipeline.ts) onto the frame. */

/** What a blit needs of a cache entry: the bitmap, where it sits on a stage-sized frame, and the stage size it was made for. */
interface Placed {
  canvas: { width: number; height: number };
  x: number;
  y: number;
  w: number;
  h: number;
}

type Target = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws a cached layer bitmap at the stage's position, `g` being in device pixels. */
export function blitEntry(g: Target, e: Placed, x: number, y: number): void {
  g.drawImage(e.canvas as CanvasImageSource, x + e.x, y + e.y);
}

/** Draws a bitmap of another scale stretched to the stage now (while zooming), where the stage is `w` x `h` at `x`, `y`. */
export function blitEntryStretched(g: Target, e: Placed, x: number, y: number, w: number, h: number): void {
  const kx = w / e.w;
  const ky = h / e.h;
  g.drawImage(e.canvas as CanvasImageSource, x + e.x * kx, y + e.y * ky, e.canvas.width * kx, e.canvas.height * ky);
}

