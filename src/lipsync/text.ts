/**
 * What was typed, as mouths. A rough English spelling-to-sound guide (no dictionary): enough to know how many vowel and
 * lip sounds to expect and in what order, so they can be lined up with the recording. Pure functions.
 */
import type { Mouth } from './chart';

/** One expected sound: a mouth, and `word` is true for the first sound of each word (a short pause may come before it). */
export interface Expected {
  mouth: Mouth;
  word: boolean;
}

const VOWELS = 'aeiouy';
const isV = (ch: string | undefined) => !!ch && VOWELS.includes(ch);

// Spelling patterns, longest first. A trailing '$' means the end of the word. Each gives mouths in order.
const PATTERNS: [string, Mouth[]][] = [
  ['tion', ['etc', 'A']],
  ['sion', ['etc', 'A']],
  ['ough', ['O']],
  ['augh', ['A']],
  ['eigh', ['E']],
  ['igh', ['A']],
  ['ear', ['E', 'A']],
  ['eer', ['E']],
  ['ire', ['A']],
  ['ure', ['U']],
  ['oor', ['O']],
  ['our', ['O']],
  ['ph', ['FV']],
  ['gh', []],
  ['th', ['L']],
  ['sh', ['etc']],
  ['ch', ['etc']],
  ['ck', ['etc']],
  ['ng', ['etc']],
  ['wh', ['WQ']],
  ['qu', ['WQ']],
  ['kn', ['etc']],
  ['wr', ['etc']],
  ['mb$', ['MBP']],
  ['ee', ['E']],
  ['ea', ['E']],
  ['oo', ['U']],
  ['ou', ['O']],
  ['ow', ['O']],
  ['oa', ['O']],
  ['oi', ['O']],
  ['oy', ['O']],
  ['ai', ['E']],
  ['ay', ['E']],
  ['ie', ['E']],
  ['ei', ['E']],
  ['ey', ['E']],
  ['au', ['O']],
  ['aw', ['O']],
  ['ew', ['U']],
  ['ue', ['U']],
  ['ui', ['U']],
  ['ar', ['A']],
  ['or', ['O']],
  ['er', ['A']],
  ['ir', ['A']],
  ['ur', ['A']],
];

const CONSONANT: Record<string, Mouth> = { b: 'MBP', m: 'MBP', p: 'MBP', f: 'FV', v: 'FV', l: 'L', w: 'WQ' };
const SINGLE_VOWEL: Record<string, Mouth> = { a: 'A', e: 'E', i: 'E', o: 'O', u: 'A', y: 'E' };
// A vowel followed by one consonant and a silent "e" says its letter name.
const LONG: Record<string, Mouth> = { a: 'E', e: 'E', i: 'A', o: 'O', u: 'U' };

/** The mouths for one lower-case word of letters. */
export function wordMouths(word: string): Mouth[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: Mouth[] = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    let done = false;
    for (const [pat, mouths] of PATTERNS) {
      const end = pat.endsWith('$');
      const p = end ? pat.slice(0, -1) : pat;
      if (rest.startsWith(p) && (!end || rest.length === p.length)) {
        out.push(...mouths);
        i += p.length;
        done = true;
        break;
      }
    }
    if (done) continue;
    const ch = w[i];
    if (isV(ch) && !(ch === 'y' && i === 0)) {
      // Silent final e (unless it is the only vowel, as in "the").
      if (ch === 'e' && i === w.length - 1 && i > 0 && [...w.slice(0, i)].some(isV)) {
        i++;
        continue;
      }
      // Vowel, one consonant, silent e at the end: the long vowel.
      if (LONG[ch] && i + 2 === w.length - 1 && !isV(w[i + 1]) && w[i + 2] === 'e') out.push(LONG[ch]);
      else out.push(SINGLE_VOWEL[ch] ?? 'A');
    } else if (ch === 'y') out.push('etc');
    else out.push(CONSONANT[ch] ?? 'etc');
    i++;
  }
  // Doubled letters make one sound.
  return out.filter((m, k) => !(k > 0 && m === out[k - 1] && m !== 'A' && m !== 'E' && m !== 'O' && m !== 'U'));
}

/** The mouths for a typed line, with the start of each word marked. Numbers and symbols are skipped. */
export function lineMouths(text: string): Expected[] {
  const out: Expected[] = [];
  for (const w of text.split(/[^A-Za-z']+/)) {
    const m = wordMouths(w.replace(/'/g, ''));
    m.forEach((mouth, k) => out.push({ mouth, word: k === 0 }));
  }
  return out;
}
