// Small taps the tools call so a second window can follow a stroke while the pen is still down. Only type imports: tools and
// the canvas controller can use this without pulling anything in, and with no second window open each call is one check.
//
// The shape of it: a tool hands over what it has (or a function that makes it), the link decides when to send, and a tool
// never waits. Hand over a function wherever making the thing costs something: the link calls it at most once per screen
// frame, so a tool that moves a thousand times a second still builds its shape sixty times.
//
// What is left out on purpose: selection and lasso (marquee, marching ants, handles). That is interface, not drawing, and an
// audience should not watch you pick things. What a move, scale or rotate does to the drawing does go across.
import type { Drawing, Id, Shape } from '../core/format';
import type { PixelPatch } from './protocol';

/** What a tool in the middle of a drag is drawing: one shape, its mirrored copies too, or nothing. */
export type InkShapes = Shape | readonly Shape[] | null;
/** The same, made when the link is ready to send it. */
export type InkMaker = () => InkShapes;

type InkTap = (s: InkShapes | InkMaker) => void;
type LiveTap = (l: { layerId: Id; drawing: Drawing } | null) => void;
type PixelTap = (src: PixelFeed | null) => void;

/**
 * A pixel layer being painted on. The tool keeps the pixels; `take` hands over what changed since the last call (or the
 * whole picture for a move) as a patch, or null when nothing did. `restart` asks for everything so far (the second window
 * lost its place). The link calls it at most once per screen frame, and
 * spaces the calls out further when the patches are big.
 */
export interface PixelFeed {
  take(restart: boolean): PixelPatch | null;
}

let inkTap: InkTap | null = null;
let liveTap: LiveTap | null = null;
let pixelTap: PixelTap | null = null;

export function setInkTap(t: InkTap | null): void {
  inkTap = t;
}
export function setLiveTap(t: LiveTap | null): void {
  liveTap = t;
}
export function setPixelTap(t: PixelTap | null): void {
  pixelTap = t;
}

/** True while something is listening, so a tool can skip the work of making what it would send. */
export const inkWanted = (): boolean => inkTap !== null;
/** True while something is listening for pixels in progress. */
export const pixelsWanted = (): boolean => pixelTap !== null;

/** The stroke or shape as it stands (or null when it is over), or a function that makes it. */
export function noteInk(s: InkShapes | InkMaker): void {
  inkTap?.(s);
}

/**
 * A layer showing a drawing other than its saved one (a move or erase half done), or null when that ends. Vector and tile
 * drawings are small and go on as they are. A pixel layer is a picture: it goes through `notePixels` instead, so this
 * ignores it (but a null still ends everything, pixels included).
 */
export function noteLive(l: { layerId: Id; kind: string; drawing?: Drawing } | null): void {
  if (!liveTap) return;
  if (l === null) {
    liveTap(null);
    pixelTap?.(null);
  } else if ((l.kind === 'vector' || l.kind === 'tilemap') && l.drawing) liveTap({ layerId: l.layerId, drawing: l.drawing });
}

/** A pixel layer being painted on, or null when that ends. */
export function notePixels(src: PixelFeed | null): void {
  pixelTap?.(src);
}
