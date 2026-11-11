// Quill's first-run hello: its command, its help and the units help. The sheet itself is OnboardingSheet in App.tsx.
import { registerCommands } from '../../core/registry';
import './help';
import { openOnboarding } from '../overlays';
import { getPrefs } from '../prefs';
import { markFirstRun } from './Onboarding';

export { OnboardingSheet } from './Onboarding';

registerCommands([
  {
    id: 'help.meetQuill',
    label: 'Meet Quill again',
    category: 'Help',
    description: "Quill's quick hello: what Frameling is for, your colours and a few settings.",
    help: 'first-run',
    keywords: ['onboarding', 'tour', 'intro', 'hello', 'setup', 'quill', 'start', 'first'],
    run: () => {
      markFirstRun(false);
      openOnboarding();
    },
  },
]);

/**
 * Opens the hello the very first time Frameling starts. Skipped with ?debug (the screenshot and docs scripts) so
 * their pictures stay the same; they can open it with the command. True when it opened.
 */
export function maybeOnboard(): boolean {
  if (getPrefs().onboarded) return false;
  try {
    if (new URLSearchParams(location.search).has('debug')) return false;
  } catch {
    // No location (tests).
  }
  markFirstRun(true);
  openOnboarding();
  return true;
}
