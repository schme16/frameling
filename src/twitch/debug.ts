// Hooks for the shot scripts, only with ?debug in the page address (see src/renderer/debug.ts). They stand in for the
// status, so a picture can show the connect flow and the links without talking to Twitch (the harness stubs the rest).
import { signedOutStatus, type TwitchStatus } from '../shared/twitch';
import { setRules, twitchStatus } from './state';
import type { TwitchRule } from './rules';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const win = window as unknown as { __framelingTwitch: unknown };
  const base = (): TwitchStatus => ({ ...signedOutStatus(), app: 'built-in' });
  win.__framelingTwitch = {
    status: (patch: Partial<TwitchStatus>) => twitchStatus.set({ ...base(), ...patch }),
    waiting: () => twitchStatus.set({ ...base(), state: 'signing-in' }),
    connected: (login = 'quillfan') => twitchStatus.set({ ...base(), state: 'signed-in', login, scopes: ['channel:read:redemptions'] }),
    rules: (rules: TwitchRule[]) => setRules(rules),
  };
}
