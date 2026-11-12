// What is remembered of the quests between runs (finished, badges, the one put down), read when the quest registry is made (start-up) so the welcome
// sheet and the Quests panel know before the quest engine has loaded.
import type { QuestProgress } from './types';

export const QUESTS_KEY = 'frameling.quests.v1';

export type Saved = Pick<QuestProgress, 'completed' | 'badges' | 'paused'>;

export function readSaved(storage: Pick<Storage, 'getItem'> | null | undefined): Saved | null {
  try {
    const raw = storage?.getItem(QUESTS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    const paused = v.paused && typeof v.paused.id === 'string' && Number.isInteger(v.paused.step) ? { id: v.paused.id, step: Math.max(0, v.paused.step) } : null;
    return {
      completed: Array.isArray(v.completed) ? v.completed.filter((x) => typeof x === 'string') : [],
      badges: Array.isArray(v.badges) ? v.badges.filter((x) => typeof x === 'string') : [],
      paused,
    };
  } catch {
    return null;
  }
}

export function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
