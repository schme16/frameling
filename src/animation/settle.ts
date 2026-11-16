// A drawing with no animation that gains frames some other way (a GIF opened into it, a folder of pictures, a video to
// trace, an Aseprite file) would otherwise have frames it hides: animation was explicitly off, so no timeline shows
// them. When one change takes a still from one frame to several, animation turns on in the same step, so what was added
// is there to see, and Undo takes both back. Switching to an artboard that is longer is not that, and neither is turning
// animation off (the frames stay, the length does not move).
import { registerSettler, type SettleContext } from '../core/store';
import type { Doc } from '../core/format';

/** True when this change made a drawing that was a hidden-animation still longer than one frame. */
export function stillGainedFrames(doc: Doc, ctx?: SettleContext): boolean {
  if (!ctx || doc.animated !== false || ctx.before.animated !== false) return false;
  if (doc.editing || ctx.before.editing) return false;
  if (ctx.before.length > 1 || doc.length <= 1) return false;
  // Another artboard opening brings its own length with it.
  return !ctx.patches.some((p) => p.path[0] === 'activeArtboard');
}

export function settleAnimation(doc: Doc, ctx?: SettleContext): ((d: Doc) => void) | null {
  return stillGainedFrames(doc, ctx) ? (d) => void (d.animated = true) : null;
}

registerSettler(settleAnimation as Parameters<typeof registerSettler>[0]);
