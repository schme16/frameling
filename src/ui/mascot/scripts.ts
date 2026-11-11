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

/** How long Quill is sad before his goodbye wave: the onboarding one, and the shorter one from Preferences. */
export const SAD_HOLD = { long: 4200, short: 2400 };

/** What Quill says when he's switched off. Warm, short, and where to find him again. */
export const GOODBYE_WORDS = {
  long: ["Oh... okay. I understand!", "I'll be just over here. If you ever need me, say hi from Help > Meet Quill again, or switch me back on in Preferences."],
  short: "Oh... okay, I understand. If you ever need me, I'm in Help > Meet Quill again.",
};

/** What Quill says when he's switched back on. */
export const WELCOME_BACK_WORDS = "Yay, I'm back! I knew you'd miss me. (I missed you too.)";

/**
 * Quill being switched off: sad for a moment (droopy quills, a tear), then a brave little goodbye wave. It ends on
 * the wave, and whoever shows him hides him once it's done.
 */
export function goodbyeScript(short = false): Beat[] {
  return [{ anim: 'sad', hold: short ? SAD_HOLD.short : SAD_HOLD.long }, { anim: 'wave-sad' }];
}

/** Quill switched back on: a happy cheer, then idle. */
export function welcomeBackScript(): Beat[] {
  return [{ anim: 'cheer' }, { anim: 'cheer' }, { anim: 'idle' }];
}
