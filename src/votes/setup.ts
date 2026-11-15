// What the start-a-vote box remembers: only how long you last let a vote run. Never a question, an option or a count.
import { readJson, writeJson } from '../ui/mini';

const KEY = 'frameling.votes.v1';

/** The lengths on offer, in seconds. 0 is "until I end it". */
export const LENGTHS: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 seconds' },
  { seconds: 60, label: '1 minute' },
  { seconds: 120, label: '2 minutes' },
  { seconds: 0, label: 'Until I end it' },
];

export function lastLength(): number {
  const v = readJson<{ seconds: number }>(KEY, { seconds: 60 }).seconds;
  return LENGTHS.some((l) => l.seconds === v) ? v : 60;
}

export const rememberLength = (seconds: number): void => writeJson(KEY, { seconds });
