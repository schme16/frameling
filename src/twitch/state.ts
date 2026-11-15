// What the page remembers about Twitch: which kinds of event the streamer ticked, and their links. Both are settings,
// not secrets, and hold nothing about any viewer. The sign-in itself is never here: it stays on the desktop side.
import { cleanKinds, DEFAULT_KINDS, signedOutStatus, type TwitchKind, type TwitchStatus } from '../shared/twitch';
import { createStore, readJson, writeJson } from '../ui/mini';
import { cleanRules, type TwitchRule } from './rules';

const KEY = 'frameling.twitch.v1';

interface Saved {
  kinds: TwitchKind[];
  rules: TwitchRule[];
  /** The starter links were offered once. */
  seeded: boolean;
}

function load(): Saved {
  const v = readJson<Record<string, unknown>>(KEY, {});
  return { kinds: Array.isArray(v.kinds) ? cleanKinds(v.kinds) : [...DEFAULT_KINDS], rules: cleanRules(v.rules), seeded: v.seeded === true };
}

export const twitchSaved = createStore<Saved>(load());
export const twitchStatus = createStore<TwitchStatus>(signedOutStatus());

twitchSaved.subscribe(() => writeJson(KEY, twitchSaved.get()));

export const wantedKinds = (): TwitchKind[] => twitchSaved.get().kinds;
export const currentRules = (): TwitchRule[] => twitchSaved.get().rules;

export const setKinds = (kinds: TwitchKind[]): void => twitchSaved.set((s) => ({ ...s, kinds: cleanKinds(kinds) }));
export const setRules = (rules: TwitchRule[]): void => twitchSaved.set((s) => ({ ...s, rules: cleanRules(rules) }));
export const patchRule = (id: string, patch: Partial<TwitchRule>): void => setRules(currentRules().map((r) => (r.id === id ? { ...r, ...patch } : r)));
export const removeRule = (id: string): void => setRules(currentRules().filter((r) => r.id !== id));
export const markSeeded = (): void => twitchSaved.set((s) => ({ ...s, seeded: true }));

/** Test helper: back to a clean slate. */
export function _resetTwitchState(): void {
  twitchSaved.set({ kinds: [...DEFAULT_KINDS], rules: [], seeded: false });
  twitchStatus.set(signedOutStatus());
}
