// Two small taps the tools call so a second window can follow a stroke while the pen is still down. No imports: tools and
// the canvas controller can use this without pulling anything in, and with no second window open each call is one check.
import type { Drawing, Id, StrokeShape } from '../core/format';

type InkTap = (s: StrokeShape | null) => void;
type LiveTap = (l: { layerId: Id; drawing: Drawing } | null) => void;

let inkTap: InkTap | null = null;
let liveTap: LiveTap | null = null;

export function setInkTap(t: InkTap | null): void {
  inkTap = t;
}
export function setLiveTap(t: LiveTap | null): void {
  liveTap = t;
}

/** True while something is listening, so a tool can skip the work of making what it would send. */
export const inkWanted = (): boolean => inkTap !== null;

/** The freehand stroke as it stands (or null when it is over). */
export function noteInk(s: StrokeShape | null): void {
  inkTap?.(s);
}

/** A layer showing a drawing other than its saved one (a move or erase half done), or null when that ends. Only vector drawings are passed on. */
export function noteLive(l: { layerId: Id; kind: string; drawing?: Drawing } | null): void {
  if (!liveTap) return;
  liveTap(l && l.kind === 'vector' && l.drawing ? { layerId: l.layerId, drawing: l.drawing } : null);
}
