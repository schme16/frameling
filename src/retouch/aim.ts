// What the clone stamp remembers between strokes, kept apart from the tool so the options can show it (see maths.ts for the rules).
import { chooseSource, noAim, type CloneAim, type Pt } from './maths';

let aim: CloneAim = noAim();
/** How many strokes have been made from this source. The question about lifting the pen is asked after the first. */
let strokes = 0;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

export const cloneAim = (): CloneAim => aim;

/** Forgets the source, so the next click chooses one. */
export function resetCloneAim(): void {
  aim = noAim();
  strokes = 0;
  tell();
}

/** The spot to copy from, in art pixels of the layer you paint on. */
export function setCloneSource(at: Pt): void {
  aim = chooseSource(at);
  strokes = 0;
  tell();
}

/** A stroke finished with this offset: aligned strokes keep it. Returns how many strokes there have been from this source. */
export function setCloneOffset(offset: Pt): number {
  aim = { ...aim, offset };
  strokes++;
  return strokes;
}

export const subscribeAim = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
