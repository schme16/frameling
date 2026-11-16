/**
 * What a drawing with no animation does about the animation commands. Three kinds, told apart by one pure function so
 * the menus, the palette, the keys and the buttons all agree:
 *
 * - `open`: not about animation, or the way in (Add animation), so it works as it always did.
 * - `makes`: asks for a frame, or for the timeline itself (New frame, Insert frame, the Timeline panel). The wish is
 *   plain, so on a still picture it turns animation on first, says so, and then does the thing. Nothing is lost, and Undo
 *   takes both back.
 * - `needs`: only means something with frames (Play, Onion skin, Tween, Hold for 2). Greyed on a still with the reason
 *   "Add animation first", and pressing it offers Add animation.
 */
import type { State } from './store';
import { addAnimation, isAnimated, startFrames } from './animation';
import type { Command } from './registry';
import type { Doc } from './format';

export type AnimationKind = 'open' | 'makes' | 'needs';

/** The command categories that are about animation. */
export const ANIMATION_CATEGORIES: readonly string[] = ['Timeline', 'Animate', 'Animation', 'Sound', 'Lip sync'];

/** The way in, and the way back out: always open. */
export const ANIMATION_DOORS = ['animation.add', 'animation.remove'] as const;

/** Commands about frames and motion that sit in other categories (the tools that move things over time, the Draw on panel). */
export const ANIMATION_ONLY: readonly string[] = ['pixel.makeItMove', 'tools.motion-path', 'tools.record-move', 'tools.shape-hints', 'view.panel.draw-on'];

/** Asking for a frame or the timeline: these turn animation on and carry on. */
export const MAKES_FRAMES: readonly string[] = [
  'timeline.newKey',
  'timeline.emptyFrame',
  'timeline.duplicateKey',
  'timeline.insertFrame',
  'timeline.insertFrameOther',
  'timeline.nextFrame',
  'view.panel.timeline',
  'view.panel.clip-play',
  'view.panel.clip-drawings',
];

/** Which kind a command is. */
export function animationKind(c: Pick<Command, 'id' | 'category'>): AnimationKind {
  if ((ANIMATION_DOORS as readonly string[]).includes(c.id)) return 'open';
  if (MAKES_FRAMES.includes(c.id)) return 'makes';
  return ANIMATION_CATEGORIES.includes(c.category) || ANIMATION_ONLY.includes(c.id) ? 'needs' : 'open';
}

/** The one sentence a greyed animation command gives as its reason. */
export const ADD_ANIMATION_FIRST = 'This drawing has no animation yet. Add animation first, from the Animate menu or by searching "animation".';

/** The state as it would be with animation on, so a command's own rules can be asked "would you work then?". */
export function withAnimation(s: State): State {
  if (isAnimated(s.doc)) return s;
  const doc: Doc = { ...s.doc };
  addAnimation(doc);
  return { ...s, doc, ui: { ...s.ui } };
}

/** Is this command usable in this state, counting the drawing having no animation? */
export function gateEnabled(c: Pick<Command, 'id' | 'category' | 'enabled'>, s: State): boolean {
  if (isAnimated(s.doc)) return c.enabled ? c.enabled(s) : true;
  const kind = animationKind(c);
  if (kind === 'needs') return false;
  if (kind === 'makes') return c.enabled ? c.enabled(withAnimation(s)) : true;
  return c.enabled ? c.enabled(s) : true;
}

/** Why a command is greyed because the drawing is a still, or undefined when that is not the reason. */
export function gateReason(c: Pick<Command, 'id' | 'category'>, s: State): string | undefined {
  return !isAnimated(s.doc) && animationKind(c) === 'needs' ? ADD_ANIMATION_FIRST : undefined;
}

/** The length of the new frames for a still, for tests and words. */
export const framesIfAdded = (s: State): number => (isAnimated(s.doc) ? s.doc.length : startFrames(s.doc));
