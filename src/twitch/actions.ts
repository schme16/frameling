// What the buttons and commands do: connect, disconnect, and the small notes about how it went. The status watcher turns
// what the desktop side says into a toast and, the first time, offers the starter links.
import { audience } from '../audience';
import { withChoice } from '../core/choices';
import { displayName } from '../core/streamSafe';
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import type { TwitchProblem, TwitchStatus } from '../shared/twitch';
import { twitchLink } from './instance';
import { markSeeded, setRules, currentRules, twitchSaved, twitchStatus, wantedKinds } from './state';
import { starterRules } from './rules';

export const hasTwitch = (): boolean => !!desktop()?.twitch;

/** Starts signing in for the ticked kinds. The code appears on the settings screen; approving it finishes the job. */
export async function connect(): Promise<void> {
  const b = desktop()?.twitch;
  if (!b) return void toast('Connect Twitch needs the desktop app.', { kind: 'warn' });
  twitchStatus.set(await b.signIn(wantedKinds()));
}

export async function cancelConnect(): Promise<void> {
  const b = desktop()?.twitch;
  if (!b) return;
  await b.cancelSignIn();
  twitchStatus.set(await b.status());
}

/** Signs out for real: Twitch cancels the token, and it is gone here. Says what happened. */
export async function disconnect(): Promise<void> {
  const b = desktop()?.twitch;
  if (!b) return;
  const r = await b.signOut();
  twitchStatus.set(await b.status());
  toast(r.revoked ? 'Disconnected from Twitch. Twitch has cancelled the sign-in.' : 'Disconnected here. Twitch could not be reached to cancel it, so also remove Frameling at twitch.tv/settings/connections.', { kind: r.revoked ? 'success' : 'warn', duration: r.revoked ? undefined : 9000 });
}

const PROBLEM_WORDS: Partial<Record<TwitchProblem, string>> = {
  denied: 'Twitch said no, so nothing was connected.',
  expired: 'The code ran out before it was approved. Press Connect Twitch to get a new one.',
  failed: 'Could not start connecting to Twitch. Check your internet and try again.',
  offline: 'Could not reach Twitch. Check your internet and try again.',
  'needs-sign-in': 'Twitch ended the sign-in, so Frameling stopped listening. Connect again when you are ready.',
};

/** Watches the status for the moments worth a word. Returns the way to stop. */
export function watchTwitch(): () => void {
  let last: TwitchStatus = twitchStatus.get();
  return twitchStatus.subscribe(() => {
    const s = twitchStatus.get();
    const was = last;
    last = s;
    if (was.state !== 'signed-in' && s.state === 'signed-in' && was.state === 'signing-in') {
      toast(`Connected to Twitch as ${displayName(s.login)}.${audience.isOn() ? '' : ' Switch audience features on to start listening.'}`, { kind: 'success', quill: null });
      // Sign-in finished while the switch was already on: the door is open, so start listening now.
      if (audience.isOn()) twitchLink.open();
      if (!twitchSaved.get().seeded) {
        markSeeded();
        withChoice<string>('twitch.starter', (answer) => {
          if (answer !== 'suggest' || currentRules().length) return;
          const have = (id: string) => audience.snapshot().actions.some((a) => a.id === id);
          setRules(starterRules(have));
        });
      }
    }
    if (s.problem && s.problem !== was.problem && PROBLEM_WORDS[s.problem] && s.problem !== 'no-app') toast(PROBLEM_WORDS[s.problem]!, { kind: 'warn' });
    if (s.listening === 'reconnecting' && was.listening === 'listening') toast('Lost the line to Twitch. Frameling is trying again.', { quill: null, sound: null });
  });
}
