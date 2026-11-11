// Little performances for the places Quill appears, kept here so they're easy to tune and to test.
import type { Beat } from './timing';

/** How long Quill talks for a line: about as long as it takes to read, within reason. */
export function talkFor(text: string): number {
  return Math.round(Math.min(4500, Math.max(1200, text.length * 40)));
}

/**
 * A quest step: a quick cheer if the last step was just done, talk while the words appear, point while the ring
 * shows what to do, then idle. A hint (nothing has happened for a while) gets a point at the ring again.
 */
export function stepScript(say: string, o: { cheer?: boolean; pointing?: boolean; hint?: boolean } = {}): Beat[] {
  if (o.hint) return o.pointing ? [{ anim: 'point', hold: 2400 }, { anim: 'idle' }] : [{ anim: 'think', hold: 2400 }, { anim: 'idle' }];
  const beats: Beat[] = [];
  if (o.cheer) beats.push({ anim: 'cheer', hold: 1100 });
  beats.push({ anim: 'talk', hold: talkFor(say) });
  if (o.pointing) beats.push({ anim: 'point', hold: 2400 });
  beats.push({ anim: 'idle' });
  return beats;
}
