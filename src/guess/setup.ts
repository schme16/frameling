// What the start-a-round box remembers: only how long you last let a round run. Never a word, a guess or a name.
import { readJson, writeJson } from '../ui/mini';

const KEY = 'frameling.guess.v1';

/** The lengths on offer, in seconds. 0 is "until I end it". */
export const LENGTHS: { seconds: number; label: string }[] = [
  { seconds: 60, label: '1 minute' },
  { seconds: 120, label: '2 minutes' },
  { seconds: 180, label: '3 minutes' },
  { seconds: 0, label: 'Until I end it' },
];

export function lastLength(): number {
  const v = readJson<{ seconds: number }>(KEY, { seconds: 120 }).seconds;
  return LENGTHS.some((l) => l.seconds === v) ? v : 120;
}

export const rememberLength = (seconds: number): void => writeJson(KEY, { seconds });
