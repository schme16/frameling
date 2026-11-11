// Fuzzy word matching shared by the command palette and help search. Forgiving on purpose: typos, missing letters
// and half-remembered words should still find the thing.

/** Lower-case words with the punctuation stripped, so "on-ion" style splits don't matter. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Edit distance where a swap of two letters counts as one edit. Gives up early past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
    for (let j = 1; j <= b.length; j++) d[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a word of this length may have. Short words get none, they'd match everything. */
export const typoBudget = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

/** The letters of `needle` appear in order in `hay` ("onsk" in "onion skin"). */
export function inOrder(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/**
 * How well one query word matches a list of words. 0 means no match.
 * Exact word 100, word start 80, inside a word 50, a typo 35, letters in order 15.
 */
export function scoreWord(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    let s = 0;
    if (w === q) s = 100;
    else if (w.startsWith(q)) s = 80;
    else if (q.length >= 2 && w.includes(q)) s = 50;
    else if (q.length >= 4 && editDistance(q, w.slice(0, q.length + 1), typoBudget(q.length)) <= typoBudget(q.length)) s = 35;
    else if (q.length >= 3 && inOrder(q, w)) s = 15;
    if (s > best) best = s;
    if (best === 100) break;
  }
  return best;
}
