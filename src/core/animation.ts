/**
 * Whether a drawing is an animation. The format always had a length, so a picture was a one frame animation; this is
 * the part that lets the app tell the two apart and keep the timeline, the frame rate and the animation tools out of
 * the way of somebody drawing one picture. Plain data and pure functions: nothing here touches the screen.
 *
 * The rule, in one line: `doc.animated` says so when it is there, and an older file (no field) is an animation when
 * it has more than one frame. Turning animation off never deletes anything. See docs/format.md.
 */
import type { Doc } from './format';

/** Frames a vector drawing gets when animation is added to a single picture: two seconds at the usual rate. */
export const ANIMATION_FRAMES = 24;
/** Frames a pixel art drawing gets: four to play with, as a new animated sprite has (src/pixel/units.ts). */
export const PIXEL_ANIMATION_FRAMES = 4;

type Shape = Pick<Doc, 'length'> & Partial<Pick<Doc, 'animated' | 'editing'>>;

/**
 * True when the drawing is an animation: the field when the file has one, otherwise more than one frame. Editing a symbol
 * swaps in its own layers and length, so the drawing's length is the one from before the edit began.
 */
export function isAnimated(doc: Shape): boolean {
  const length = doc.editing?.length ? doc.editing[0].length : doc.length;
  return doc.animated ?? length > 1;
}

/** How many different frames hold a drawing of their own, across every layer. One means it is a still, whatever the length. */
export function framesDrawn(doc: Pick<Doc, 'layers'>): number {
  const starts = new Set<number>();
  for (const l of doc.layers) for (const c of l.cels) starts.add(c.start);
  return starts.size;
}

/** True when the document holds frames a still picture would not: it is longer than one frame and has drawings on more than one. */
export function hasFrames(doc: Pick<Doc, 'layers' | 'length'>): boolean {
  return doc.length > 1 && framesDrawn(doc) > 1;
}

/** The length a still gets when animation is added: pixel art starts small, everything else gets two seconds. */
export function startFrames(doc: Pick<Doc, 'layers'>): number {
  return doc.layers.length > 0 && doc.layers.every((l) => l.kind === 'pixel') ? PIXEL_ANIMATION_FRAMES : ANIMATION_FRAMES;
}

/** What turning animation on did, for saying so. */
export interface Added {
  /** The frames the drawing has now. */
  frames: number;
  /** True when it already had frames (an animation turned back on) and none were added. */
  kept: boolean;
}

/** Turns animation on in place. Frames already there are left alone; a single picture gets its first frames. */
export function addAnimation(doc: Doc): Added {
  doc.animated = true;
  if (doc.length > 1) return { frames: doc.length, kept: true };
  doc.length = startFrames(doc);
  return { frames: doc.length, kept: false };
}

/** What turning animation off did, for saying so. */
export interface Hidden {
  /** Frames that are still in the file, drawn on (0 when there were none to speak of). */
  kept: number;
}

/** Turns animation off in place: the timeline and the animation tools go away, and every frame stays in the file. */
export function hideAnimation(doc: Doc): Hidden {
  const kept = hasFrames(doc) ? doc.length : 0;
  doc.animated = false;
  return { kept };
}

/** The words for what hiding did, plain and with no blame, for the toast. */
export function hiddenWords(h: Hidden): string {
  return h.kept
    ? `Animation is off. Your ${h.kept} frames are kept in the file, and Add animation brings the timeline back with them.`
    : 'Animation is off. Add animation brings the timeline back.';
}

/** The words for what adding did. */
export function addedWords(a: Added): string {
  return a.kept ? `Animation is on. Your ${a.frames} frames are back.` : `Animation is on, with ${a.frames} frames to draw on.`;
}
