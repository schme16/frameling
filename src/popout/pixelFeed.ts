// For a tool that already has a whole pixel layer's picture in hand (a selection being moved, a transform half done): lets
// the second window follow it. Nothing is made or copied here when no second window is open. The picture is read when the
// link is ready for it (at most once per screen frame, and spaced out when it is big, see pace.ts), and only the latest one
// is kept, so a drag that moves faster than the window can follow just skips the ones in between.
import type { Id } from '../core/format';
import { notePixels, pixelsWanted } from './ink';

/** `pixels` is the whole grid (width x height RGBA) and must not be changed afterwards: the tool makes a new one each time. */
export function offerWholePixels(layerId: Id, width: number, height: number, pixels: Uint8ClampedArray): void {
  if (!pixelsWanted() || width * height > 4096 * 4096) return;
  notePixels({ take: () => ({ layerId, width, height, start: true, base: false, x: 0, y: 0, w: width, h: height, data: pixels }) });
}
