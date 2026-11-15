// Is this guess the word? Pure: two strings in, a verdict out. No store, no clock, no chat.
//
// Getting this wrong is what makes a guessing game annoying, so it leans fair in both directions: it forgives what a
// person types in a hurry, and it refuses a different real thing that only looks close ("house" is not a slip for
// "horse"). In the order it tries them, a guess is right when, after tidying:
//   exact   it is the word: capitals, punctuation, accents, apostrophes and extra spaces ignored.
//   tidy    it is the word with a leading "a/an/the", chatty padding ("is it a ...", "... lol") or spacing differences
//           ("ice-cream", "icecream", "ice cream") taken off.
//   plural  it is the word's plural or singular (cats, boxes, bunnies, wolves, mice).
//   sound   it spells the word the way it sounds: elefant, dolfin, kat, caaaat. Equal by sound only: a sound-alike with
//           a typo on top is two slips, and is refused ("elegant" is not "elephant").
//   typo    it is one letter out (two, once the word is ten letters or more): a missing, extra, swapped or wrong letter.
//           Words of four letters or fewer must be exact (bear, pear, beer, dear), the first letter must be right,
//           and a guess that is itself a word we know (see ./words.ts) is never taken for a typo.
// Anything else is wrong. Letters in other alphabets are matched exactly only, never fuzzily.
import { isKnownWord } from './words';

export type How = 'exact' | 'tidy' | 'plural' | 'sound' | 'typo';
export interface Match {
  right: boolean;
  /** How it was right. Only there when `right`. */
  how?: How;
  /** 0 to 1, how alike the spelling is to the word (1 is right). Spelling only: "kitten" is not near "cat". */
  alike: number;
}

/** Plain, lower case, one line: no accents, apostrophes or punctuation, one space between words. */
export function normalise(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const ARTICLES = new Set(['a', 'an', 'the']);
const LEAD_FILLER = new Set(['is', 'it', 'its', 'that', 'thats', 'this', 'these', 'those', 'maybe', 'perhaps', 'i', 'think', 'guess', 'my', 'a', 'an', 'the', 'looks', 'like', 'lol', 'um', 'uh', 'hm', 'hmm', 'oh', 'ah', 'omg', 'pls', 'please', 'are', 'they', 'there', 'some', 'ok', 'okay', 'so']);
const TRAIL_FILLER = new Set(['lol', 'lmao', 'haha', 'hehe', 'pls', 'please', 'maybe', 'perhaps']);

const tokens = (n: string): string[] => (n ? n.split(' ') : []);

const dropLead = (t: string[], set: Set<string>): string[] => {
  let i = 0;
  while (i < t.length - 1 && set.has(t[i])) i++;
  return t.slice(i);
};
const dropTrail = (t: string[], set: Set<string>): string[] => {
  let end = t.length;
  while (end > 1 && set.has(t[end - 1])) end--;
  return t.slice(0, end);
};

const IRREGULAR: Record<string, string> = { mice: 'mouse', men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth', geese: 'goose', people: 'person', oxen: 'ox', lice: 'louse', leaves: 'leaf', loaves: 'loaf' };
const REVERSE: Record<string, string[]> = {};
for (const [p, s] of Object.entries(IRREGULAR)) (REVERSE[s] ??= []).push(p);

/** The last word read as a plural, in each way it could be one. Words of three letters or fewer, and endings like "bus", "grass", "tennis", are left alone. */
function singulars(w: string): string[] {
  const out: string[] = [];
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);
  if (w.length >= 4 && w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (w.length >= 4 && w.endsWith('ves')) out.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
  if (w.length >= 4 && /(s|x|z|ch|sh|o)es$/.test(w)) out.push(w.slice(0, -2));
  if (w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) out.push(w.slice(0, -1));
  return out;
}

/** Every spelling a list of words may stand for, squashed (no spaces): as written, then with the last word read as a plural or a singular. */
function variants(t: string[]): string[] {
  if (!t.length) return [];
  const head = t.slice(0, -1).join('');
  const last = t[t.length - 1];
  const all = new Set<string>([head + last]);
  for (const s of singulars(last)) all.add(head + s);
  for (const p of REVERSE[last] ?? []) all.add(head + p);
  return [...all];
}

/** How a word sounds, roughly: ph is f, ck is k, a hard c is k, repeated letters are one. Both sides go through the same one. */
export function sounds(w: string): string {
  return w
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/(.)\1+/gsu, '$1')
    .replace(/c(?![eiy])/g, 'k');
}

/** Edits between two strings: insert, delete, change or swap two neighbours, each one edit. Gives up (returns max + 1) past `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[y.length];
}

/** How many letters out a word of this length may be. */
export const slack = (letters: number): number => (letters <= 4 ? 0 : letters <= 9 ? 1 : 2);

const PLAIN = /^[a-z0-9]+$/;

/** Is `guess` the word `answer`? See the top of this file for exactly what counts. */
export function matchGuess(guess: string, answer: string): Match {
  const g = normalise(guess);
  const a = normalise(answer);
  if (!g || !a) return { right: false, alike: 0 };
  const done = (how: How): Match => ({ right: true, how, alike: 1 });
  if (g === a) return done('exact');

  const gt = tokens(g);
  const at = tokens(a);
  // The guess as it may be read (as written, no article, no padding) and the word as it may be read (as written, no article).
  const gForms = [gt, dropLead(gt, ARTICLES), dropTrail(dropLead(gt, LEAD_FILLER), TRAIL_FILLER)];
  const aForms = [at, dropLead(at, ARTICLES)];
  const gSquash = [...new Set(gForms.map((t) => t.join('')))];
  const aSquash = new Set(aForms.map((t) => t.join('')));
  if (gSquash.some((s) => aSquash.has(s))) return done('tidy');

  const gVars = [...new Set(gForms.flatMap(variants))];
  const aVars = [...new Set(aForms.flatMap(variants))];
  if (gVars.some((s) => aVars.includes(s))) return done('plural');

  // A different real word is not a slip: only a guess nobody would call a word can be forgiven.
  const forgivable = (gv: string, av: string): boolean => gv === av || !isKnownWord(gv);
  let alike = 0;
  let sound = false;
  let typo = false;
  for (const gv of gVars) {
    for (const av of aVars) {
      const fg = sounds(gv);
      const fa = sounds(av);
      const longest = Math.max(fg.length, fa.length);
      if (longest) alike = Math.max(alike, 1 - editDistance(fg, fa) / longest);
      if (!forgivable(gv, av) || !PLAIN.test(gv) || !PLAIN.test(av)) continue;
      if (fg === fa) sound = true;
      const t = slack(av.length);
      if (t > 0 && gv[0] === av[0] && editDistance(gv, av, t) <= t) typo = true;
    }
  }
  if (sound) return done('sound');
  if (typo) return done('typo');
  return { right: false, alike: Math.min(alike, 0.99) };
}

export type Warmth = 'none' | 'cold' | 'cool' | 'warm' | 'hot';
export const WARMTHS: readonly Warmth[] = ['none', 'cold', 'cool', 'warm', 'hot'];

/** How close the nearest wrong guess is, as a word. It says how alike the spelling is and nothing about what the guess was. */
export function warmthOf(alike: number): Warmth {
  return alike >= 0.75 ? 'hot' : alike >= 0.55 ? 'warm' : alike >= 0.35 ? 'cool' : 'cold';
}

/** The warmer of two. */
export const warmer = (a: Warmth, b: Warmth): Warmth => (WARMTHS.indexOf(b) > WARMTHS.indexOf(a) ? b : a);

/** Letters in a word, as the panel counts them: one number per word (spaces and punctuation are not letters). */
export function letterCounts(word: string): number[] {
  return word
    .split(/\s+/)
    .map((w) => Array.from(w).filter((c) => /[\p{L}\p{N}]/u.test(c)).length)
    .filter((n) => n > 0);
}
