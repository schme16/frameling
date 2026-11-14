/**
 * Typed words, read with the pronunciation list (src/lipsync/dict.ts): numbers are read out, contractions and common
 * endings are handled, and any word the list does not have falls back to the spelling guide in text.ts. This is loaded
 * only when words are typed, so it stays out of the first load. Pure functions.
 */
import type { Mouth } from './chart';
import { wordMouths, type Expected } from './text';

/**
 * The pronunciation list: lower-case word to its mouths, one letter each (A E O U, M for M B P, F for F V, L, W for W Q,
 * X for etc). Built by `parseDictionary` from the packed data; it holds only the words the spelling guide gets wrong.
 */
export type Dictionary = Map<string, string>;

const CODE_MOUTH: Record<string, Mouth> = { A: 'A', E: 'E', O: 'O', U: 'U', M: 'MBP', F: 'FV', L: 'L', W: 'WQ', X: 'etc' };
const MOUTH_CODE: Record<string, string> = { A: 'A', E: 'E', O: 'O', U: 'U', MBP: 'M', FV: 'F', L: 'L', WQ: 'W', etc: 'X' };
const VOWEL_CODES = 'AEOU';

/**
 * Reads packed data: for each word, a digit (how many letters it shares with the word before it), the rest of its letters
 * in lower case, then its mouths in capitals. Words are in alphabetical order.
 */
export function parseDictionary(data: string): Dictionary {
  const dict: Dictionary = new Map();
  let prev = '';
  for (const m of data.matchAll(/(\d)([a-z]*)([A-Z]+)/g)) {
    const word = prev.slice(0, Number(m[1])) + m[2];
    dict.set(word, m[3]);
    prev = word;
  }
  return dict;
}

/** The reverse of `parseDictionary`, for the tool that builds the data. `entries` need not be sorted. */
export function packDictionary(entries: Iterable<[string, string]>): string {
  const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let prev = '';
  let out = '';
  for (const [word, codes] of sorted) {
    let k = 0;
    while (k < 9 && k < prev.length && k < word.length && prev[k] === word[k]) k++;
    out += k + word.slice(k) + codes;
    prev = word;
  }
  return out;
}

/** Adjacent matching consonants are one sound ("ts" in "cats" is one hiss). */
function squash(codes: string): string {
  let out = '';
  for (const c of codes) if (!(out.endsWith(c) && !VOWEL_CODES.includes(c))) out += c;
  return out;
}

const endsInVowel = (codes: string) => !!codes && VOWEL_CODES.includes(codes[codes.length - 1]);

const toCodes = (mouths: Mouth[]) => mouths.map((m) => MOUTH_CODE[m]).join('');

// Contractions that do not follow the rule of base word plus an ending.
const CONTRACTIONS: Record<string, string> = { dont: 'XOX', wont: 'WOX', cant: 'XAX', aint: 'EX', shant: 'XAX', lets: 'LEX', im: 'AM', ive: 'AF', ill: 'AL', id: 'AX', youre: 'XUX', theyre: 'LEX' };

/** Endings, and the mouths each adds to a listed word (given its spelling). */
const ENDINGS: [string, (stem: string) => string][] = [
  ['ies', () => 'X'],
  ['es', (s) => (/(s|x|z|ch|sh)$/.test(s) ? 'EX' : 'X')],
  ['s', () => 'X'],
  ['ed', (s) => (/[td]$/.test(s) ? 'EX' : 'X')],
  ['ing', () => 'EX'],
  ['ly', () => 'LE'],
  ['er', () => 'A'],
  ['est', () => 'EX'],
  ['ness', () => 'XEX'],
];

/** A word built from a shorter word in the list plus a common ending, or null. */
function withEnding(word: string, dict: Dictionary): string | null {
  for (const [end, add] of ENDINGS) {
    if (word.length < end.length + 2 || !word.endsWith(end)) continue;
    const base = word.slice(0, -end.length);
    const stems = end === 'ies' ? [base + 'y'] : [base, base + 'e'];
    // A doubled last letter ("running") is one sound.
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) stems.push(base.slice(0, -1));
    for (const stem of stems) {
      const codes = dict.get(stem);
      if (codes) return squash(codes + add(stem));
    }
  }
  return null;
}

/** The mouths for one word (letters and apostrophes): the pronunciation list, an ending on a listed word, a contraction, else the spelling guide. */
export function wordPronunciation(word: string, dict?: Dictionary): Mouth[] {
  const w = word.toLowerCase().replace(/[’]/g, "'");
  if (!dict) return wordMouths(w);
  return [...pronounceCodes(w, dict)].map((c) => CODE_MOUTH[c]);
}

/** The mouth letters for a word; see `Dictionary`. Used by the tool that builds the data to find what the guide already gets right. */
export function pronounceCodes(word: string, dict: Dictionary): string {
  const apos = word.indexOf("'");
  if (apos >= 0) {
    const plain = word.replace(/'/g, '');
    if (CONTRACTIONS[plain]) return CONTRACTIONS[plain];
    const m = /^(.+?)(n't|'s|'d|'ll|'ve|'re|'m)$/.exec(word);
    if (m) {
      const base = pronounceCodes(m[1].replace(/'/g, ''), dict);
      switch (m[2]) {
        case "n't": return squash(base + (endsInVowel(base) ? '' : 'A') + 'X');
        case "'s": return squash(base + 'X');
        case "'d": return squash(base + 'X');
        case "'m": return squash(base + 'M');
        case "'ve": return squash(base + (endsInVowel(base) ? '' : 'A') + 'F');
        case "'ll": return squash(base + (endsInVowel(base) ? '' : 'A') + 'L');
        default: return squash(base + 'A');
      }
    }
    return pronounceCodes(plain, dict);
  }
  const hit = dict.get(word) ?? withEnding(word, dict);
  return hit ?? squash(toCodes(wordMouths(word)));
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL_END: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

function below1000(n: number): string[] {
  const out: string[] = [];
  if (n >= 100) out.push(ONES[Math.floor(n / 100)], 'hundred');
  const r = n % 100;
  if (r >= 20) out.push(TENS[Math.floor(r / 10)], ...(r % 10 ? [ONES[r % 10]] : []));
  else if (r || !out.length) out.push(ONES[r]);
  return out;
}

/** A whole number as spoken words ("1999" is "nineteen ninety nine", like a year; other numbers are counted out). */
export function numberWords(digits: string): string[] {
  const n = Number(digits);
  if (!Number.isFinite(n) || digits.length > 12) return [...digits].map((d) => ONES[Number(d)]);
  if (digits.length > 1 && digits[0] === '0') return [...digits].map((d) => ONES[Number(d)]);
  if (digits.length === 4 && ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) && n % 100 !== 0) return [...below1000(Math.floor(n / 100)), ...(n % 100 < 10 ? ['oh'] : []), ...below1000(n % 100)];
  const out: string[] = [];
  const groups: [number, string][] = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  let rest = n;
  for (const [size, name] of groups) {
    if (rest >= size) {
      out.push(...below1000(Math.floor(rest / size)), name);
      rest %= size;
    }
  }
  if (rest || !out.length) out.push(...below1000(rest));
  return out;
}

/** "3rd" as words: the number, with its last word turned into the ordinal ("third", "twenty fifth"). */
function ordinalWords(digits: string): string[] {
  const w = numberWords(digits);
  const last = w[w.length - 1];
  w[w.length - 1] = ORDINAL_END[last] ?? (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return w;
}

/** What a typed token (a word, or a number such as "42", "3.5", "1,000" or "2nd") says, as lower-case words. */
export function spokenWords(token: string): string[] {
  if (/^[a-z]/i.test(token)) return [token.toLowerCase()];
  const ord = /^([\d,]+)(?:st|nd|rd|th)$/i.exec(token);
  if (ord) return ordinalWords(ord[1].replace(/,/g, ''));
  const [whole, frac] = token.replace(/,/g, '').split('.');
  return [...numberWords(whole), ...(frac ? ['point', ...[...frac].map((d) => ONES[Number(d)])] : [])];
}

/** The mouths for a typed line, with the start of each word marked. Numbers are read out; other symbols are skipped. `dict` is the pronunciation list. */
export function lineExpected(text: string, dict: Dictionary): Expected[] {
  const out: Expected[] = [];
  for (const token of text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|\d[\d,]*(?:\.\d+)?(?:st|nd|rd|th)?/gi) ?? []) {
    for (const w of spokenWords(token)) {
      wordPronunciation(w, dict).forEach((mouth, k) => out.push({ mouth, word: k === 0 }));
    }
  }
  return out;
}
