// The prompt jar's rules, as plain functions so they can be tested without a screen. A prompt here is only words: no
// name, no time, no sender. The list holds nothing else.
import { cleanChatText } from '../audience/cleanText';

/** The most a prompt may say, in characters. Long enough for "a frog in a teacup wearing a tiny crown". */
export const PROMPT_MAX = 80;
/** The most prompts the jar holds. Past this it turns new ones away until there is room. */
export const JAR_MAX = 50;
/** Seconds between prompts from the audience, as the gate's cooldown (ms). The streamer's strictness scales it. */
export const ADD_COOLDOWN = 8000;

/** What is in the jar. `id` only tells two slips apart on screen; it says nothing about who wrote one. */
export interface Slip {
  id: number;
  text: string;
}

/** One prompt's words, cleaned the same way as every other thing a viewer wrote, or null when nothing is left. */
export const cleanPrompt = (raw: unknown): { text: string } | null => cleanChatText(raw, PROMPT_MAX);

/** Two prompts are the same when they only differ in capitals and spacing. */
export const sameWords = (a: string, b: string): boolean => a.toLocaleLowerCase().replace(/\s+/g, ' ') === b.toLocaleLowerCase().replace(/\s+/g, ' ');

export type AddResult = 'added' | 'duplicate' | 'full';

/** Whether a prompt can go in. `held` is the jar plus the slip in the streamer's hand (so a repeat of it is spotted), `inJar` how many are really in the jar. */
export function canAdd(held: readonly Slip[], text: string, inJar: number, max = JAR_MAX): AddResult {
  if (held.some((s) => sameWords(s.text, text))) return 'duplicate';
  return inJar >= max ? 'full' : 'added';
}

/** Which slip a number between 0 and 1 picks. Null for an empty jar. Pure, so a test can choose. */
export function pickSlip(slips: readonly Slip[], rand: number): Slip | null {
  if (slips.length === 0) return null;
  return slips[Math.min(slips.length - 1, Math.max(0, Math.floor(rand * slips.length)))];
}

/** Splits something pasted into one prompt per line, cleaned, dropping what is empty or rubbish. */
export function promptsFromText(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => cleanPrompt(l)?.text)
    .filter((t): t is string => !!t);
}

/** What goes to storage when the jar is kept between sessions: the words and nothing else. */
export const toStored = (slips: readonly Slip[]): string[] => slips.map((s) => s.text);

/** Reads what storage gave back, cleaning each one again and keeping to the cap, so an edited or odd file cannot slip rubbish in. */
export function fromStored(raw: unknown, max = JAR_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === 'string' ? cleanPrompt(v)?.text : undefined;
    if (t && !out.some((o) => sameWords(o, t))) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
