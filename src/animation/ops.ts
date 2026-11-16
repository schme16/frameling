// Turning animation on and off for the open drawing. One step of Undo each, and nothing is ever deleted: the frames stay
// in the file while animation is off. The rules are in src/core/animation.ts.
import { addAnimation, hideAnimation, isAnimated, type Added, type Hidden } from '../core/animation';
import { store } from '../core/store';

/** Why animation cannot be turned on or off right now, or null when it can. */
export function whyNotNow(): string | null {
  return store().nestedTag() ? 'Finish editing the tile first, then add animation to the drawing.' : null;
}

/** Turns animation on. Null when it already is, or cannot be changed now. */
export function addAnimationNow(): Added | null {
  const s = store().get();
  if (isAnimated(s.doc) || whyNotNow()) return null;
  let out: Added | null = null;
  store().update('Add animation', (d) => void (out = addAnimation(d)));
  return out;
}

/** Turns animation off: the timeline goes away and the picture stays on frame 1. Null when it is not on, or cannot be changed now. */
export function hideAnimationNow(): Hidden | null {
  const s = store().get();
  if (!isAnimated(s.doc) || whyNotNow()) return null;
  let out: Hidden | null = null;
  store().update('Turn animation off', (d) => void (out = hideAnimation(d)));
  store().setUi({ frame: 0, playing: false });
  return out;
}
