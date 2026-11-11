// Switching Quill off in Preferences: he's sad for a moment on a toast, waves a brave goodbye, then goes.
// Switching him back on gets a cheer. Onboarding does its own, bigger version beside its bubbles.
import { getPrefs, setPrefs } from '../prefs';
import { toast } from '../toast';
import { goodbyeScript, GOODBYE_WORDS, SAD_HOLD, WELCOME_BACK_WORDS } from './scripts';

/** Long enough for the short goodbye to finish with a moment to read the words. */
export const GOODBYE_TOAST_MS = SAD_HOLD.short + 4000;

export function setShowQuill(on: boolean): void {
  const was = getPrefs().showQuill;
  setPrefs({ showQuill: on });
  if (was === on) return;
  if (on) toast(WELCOME_BACK_WORDS, { kind: 'success', quill: [{ anim: 'cheer' }, { anim: 'cheer' }] });
  else toast(GOODBYE_WORDS.short, { quill: goodbyeScript(true), farewell: true, duration: GOODBYE_TOAST_MS });
}
