// What the pet notices while you work. Started when the feature is turned on and stopped when it's turned off, so
// with the pet off nothing here is listening and Quill is just the mascot again.
import { store } from '../core/store';
import { firstVisitToday, tellQuill } from './store';

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

let lastEdit = -Infinity;
let fussedAt = -Infinity;
let finishedAt = -Infinity;

/** Milliseconds since your last edit. Infinity until you've drawn something this run. */
export const sinceEdit = (): number => now() - lastEdit;
/** Milliseconds since you last made a fuss of him. */
export const sinceFuss = (): number => now() - fussedAt;
/** Milliseconds since you last finished something. */
export const sinceFinished = (): number => now() - finishedAt;

/** Stroking him, feeding him, giving him something: he notices for a few seconds. */
export function noteFuss(): void {
  fussedAt = now();
}
/** An export, a save, a quest finished: he's proud of you for a few seconds. */
export function noteFinished(): void {
  finishedAt = now();
  tellQuill({ kind: 'finished' });
}

/** For tests: back to knowing nothing. */
export function forgetNow(): void {
  lastEdit = -Infinity;
  fussedAt = -Infinity;
  finishedAt = -Infinity;
}

/** Starts watching. Gives back the way to stop, which the feature calls when it's switched off. */
export function startWatching(): () => void {
  const s = store();
  let prev = s.get();
  if (firstVisitToday()) tellQuill({ kind: 'visited' });
  const off = s.subscribe(() => {
    const next = s.get();
    if (next.doc !== prev.doc) {
      lastEdit = now();
      tellQuill({ kind: 'drew' });
    }
    if (next.ui.playing && !prev.ui.playing) tellQuill({ kind: 'played' });
    prev = next;
  });
  return () => {
    off();
    forgetNow();
  };
}
