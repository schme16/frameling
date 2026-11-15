// The page's one link to Twitch, wired to the app's gate and the desktop side.
import { audience } from '../audience';
import { currentChoice } from '../core/choices';
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { createTwitchLink } from './link';
import { currentRules, twitchStatus, wantedKinds } from './state';

const REASONS: Record<string, string> = {
  cooldown: 'it was too soon after the last one',
  'queue-full': 'too many were waiting',
  unavailable: 'it is switched off, or needs "Let the audience interrupt your drawing"',
  unknown: 'that action is not there any more',
  invalid: 'it could not use what came with it',
  off: 'audience features are off',
};

export const twitchLink = createTwitchLink({
  bridge: () => desktop()?.twitch ?? null,
  gate: { submit: (id, raw) => audience.submit(id, raw), snapshot: () => audience.snapshot() },
  kinds: wantedKinds,
  rules: currentRules,
  setStatus: (s) => twitchStatus.set(s),
  turnedAway: (label, reason) => {
    if (currentChoice('twitch.refusedNote') === 'toast') void toast(`Turned away a Twitch link to "${label}": ${REASONS[reason] ?? reason}.`, { quill: null, sound: null });
  },
});
