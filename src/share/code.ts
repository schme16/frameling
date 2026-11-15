// The share code: four words, like river-lantern-copper-owl, split in two.
//
// The FIRST TWO words say where to meet. They become the DHT topic, which the nodes holding the announcement can see, so
// they are allowed to leak and are not trusted with anything.
// The LAST TWO words are the secret. They never touch the network: they go into the password handshake (spake2.ts) and
// nothing else, and the sender retires the code after a few wrong tries.
//
// No Node here, so the page can use it too (to check what somebody typed before anything is sent anywhere).
import { WORDS } from './wordlist';

/** Words that say where to meet. */
export const MEET_WORDS = 2;
/** Words that are the secret. More here is the safest dial to turn: each word is about 10.8 bits more to guess. */
export const SECRET_WORDS = 2;

/** How many wrong tries a code survives, on the sending side and on the receiving side. */
export const MAX_WRONG = 3;

export interface ShareCode {
  /** The words that choose the meeting place. */
  meet: string[];
  /** The words that are the secret. */
  secret: string[];
}

/** Bits in one word, which is what a guesser has to get past. */
export const BITS_PER_WORD = Math.log2(WORDS.length);

/** About how many bits an attacker faces on the secret part. */
export const SECRET_BITS = BITS_PER_WORD * SECRET_WORDS;

const INDEX = new Map(WORDS.map((w, i) => [w, i]));

type Random = (n: number) => Uint8Array;

const systemRandom: Random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A whole number from 0 up to but not including `limit`, with no lean towards small ones. */
function below(limit: number, random: Random): number {
  // Take the biggest block of values that divides evenly, and ask again for anything that lands past it.
  const span = 0x100000000;
  const top = span - (span % limit);
  for (;;) {
    const b = random(4);
    const v = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (v < top) return v % limit;
  }
}

/** A new code from the system's random numbers (`random` is for tests only). */
export function makeCode(random: Random = systemRandom): ShareCode {
  const pick = (n: number) => Array.from({ length: n }, () => WORDS[below(WORDS.length, random)]);
  return { meet: pick(MEET_WORDS), secret: pick(SECRET_WORDS) };
}

/** The code as people say it: river-lantern-copper-owl. */
export function formatCode(c: ShareCode): string {
  return [...c.meet, ...c.secret].join('-');
}

export type ParsedCode = { ok: true; code: ShareCode } | { ok: false; why: 'empty' | 'short' | 'long' | 'unknown'; word?: string };

/** Reads a code somebody typed or pasted. Spaces, commas, dots, dashes and capitals all do; the words must be ours. */
export function parseCode(text: string): ParsedCode {
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (!words.length) return { ok: false, why: 'empty' };
  if (words.length < MEET_WORDS + SECRET_WORDS) return { ok: false, why: 'short' };
  if (words.length > MEET_WORDS + SECRET_WORDS) return { ok: false, why: 'long' };
  const odd = words.find((w) => !INDEX.has(w));
  if (odd) return { ok: false, why: 'unknown', word: odd };
  return { ok: true, code: { meet: words.slice(0, MEET_WORDS), secret: words.slice(MEET_WORDS) } };
}

/** Whether a word is one of the code words, for a hint while somebody types. */
export function isCodeWord(word: string): boolean {
  return INDEX.has(word.toLowerCase());
}

/** The code with the secret part hidden, for a screen that is being shared. */
export function maskedCode(c: ShareCode): string {
  return [...c.meet, ...c.secret.map(() => '••••')].join('-');
}
