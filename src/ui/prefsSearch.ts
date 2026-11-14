// Searching the rows of Preferences. The words are scored by the same scoreWord the command palette and the help use
// (src/ui/match.ts); this file only says what a row is and how its parts count. The list of rows is in prefsIndex.ts.
import { sameSpelling, sameWords, scoreWord, wordsOf } from './match';
import type { PrefsPage } from './overlays';

export type PrefKind = 'setting' | 'choice' | 'feature' | 'command';

export interface PrefRow {
  id: string;
  page: PrefsPage;
  /** The name on the row, as the page shows it. */
  label: string;
  /** One short line about it, shown under the name and searched. */
  hint?: string;
  /** What other apps call it, and what people say: "smoothing" for the stabilizer, "dark mode" for themes. */
  also: string[];
  /** The part of the page it sits under (a heading), searched like the page name. */
  group?: string;
  /** The words to look for on the page to light the row, when they are not the label. */
  find?: string;
  kind: PrefKind;
  /** A command's id, so the Keyboard page can scroll to it. */
  commandId?: string;
}

export interface PrefHit {
  row: PrefRow;
  score: number;
}

/** The page names, as they are written on the page tabs. */
export const PAGE_NAMES: Record<PrefsPage, string> = {
  general: 'General',
  themes: 'Themes',
  behaviour: 'Behaviour',
  keyboard: 'Keyboard',
  snapping: 'Snapping',
  pen: 'Pen and tablet',
  workspaces: 'Workspaces',
  plugins: 'Plugins',
  features: 'Features',
  diagnostics: 'Diagnostics',
};

interface Prepared {
  row: PrefRow;
  label: string[];
  also: string[][];
  alsoWords: string[];
  where: string[];
  page: string;
  hint: string[];
}

const prepared = new WeakMap<PrefRow, Prepared>();
function prepare(row: PrefRow): Prepared {
  let p = prepared.get(row);
  if (!p) {
    p = { row, label: sameWords(row.label), also: row.also.map(sameWords), alsoWords: row.also.flatMap(sameWords), where: sameWords(row.kind === 'command' ? row.group ?? '' : `${PAGE_NAMES[row.page]} ${row.group ?? ''}`), hint: sameWords(row.hint ?? ''), page: row.kind === 'command' ? '' : sameWords(PAGE_NAMES[row.page]).join(' ') };
    prepared.set(row, p);
  }
  return p;
}

// How much each part of a row counts: its own name most, then the other names for it, then where it lives, then its explainer.
const W_LABEL = 1;
const W_ALSO = 0.92;
const W_WHERE = 0.55;
const W_HINT = 0.4;
// A fuzzy match this weak, in a part this far down, is noise.
const FLOOR = 12;
/** Commands from the Keyboard page rank behind the settings, and only a few show. */
const COMMAND_PENALTY = 18;
const MAX_COMMANDS = 5;

const solid = (score: number): number => (score >= 50 ? score : 0);

function scoreRow(words: string[], p: Prepared, whole: string): number {
  let total = 0;
  for (const w of words) {
    // The explainer and the page name are long and many; only a real word match counts there, never a near miss.
    const s = Math.max(scoreWord(w, p.label) * W_LABEL, scoreWord(w, p.alsoWords) * W_ALSO, solid(scoreWord(w, p.where)) * W_WHERE, solid(scoreWord(w, p.hint)) * W_HINT);
    if (s < FLOOR) return 0;
    total += s;
  }
  total /= words.length;
  // The whole thing typed is one of its names ("dark mode", "canvas size"): that is the row.
  const names = [p.label, ...p.also];
  if (names.some((n) => n.join(' ') === whole)) total += 60;
  else if (names.some((n) => n.join(' ').startsWith(whole))) total += 30;
  else if (words.length > 1 && names.some((n) => words.every((w) => n.some((x) => x === w || x.startsWith(w))))) total += 20;
  // Typing the name of a page lists that page first.
  if (p.page && whole.length >= 3 && p.page.startsWith(whole)) total += 35;
  return total;
}

/**
 * Rows that match, best first. Every word typed has to match somewhere in the row (a typo or the other spelling is
 * fine), and the rows of one page are kept together in the order of the best of them. Nothing typed, or nothing near,
 * gives an empty list.
 */
export function searchPrefs(query: string, rows: PrefRow[], limit = 40): PrefHit[] {
  const words = wordsOf(query).map(sameSpelling);
  if (!words.length) return [];
  const whole = words.join(' ');
  const hits: PrefHit[] = [];
  for (const row of rows) {
    let score = scoreRow(words, prepare(row), whole);
    if (score <= 0) continue;
    if (row.kind === 'command') score = Math.max(1, score - COMMAND_PENALTY);
    hits.push({ row, score });
  }
  hits.sort((a, b) => b.score - a.score || a.row.label.localeCompare(b.row.label));
  let commands = 0;
  const kept = hits.filter((h) => h.row.kind !== 'command' || ++commands <= MAX_COMMANDS).slice(0, limit);
  return groupByPage(kept);
}

/** The pages in the order of their best row, and inside a page the best row first. Commands from the Keyboard page come last, on their own. */
export function groupByPage(hits: PrefHit[]): PrefHit[] {
  const plain = hits.filter((h) => h.row.kind !== 'command');
  const order: PrefsPage[] = [];
  for (const h of plain) if (!order.includes(h.row.page)) order.push(h.row.page);
  return [...order.flatMap((page) => plain.filter((h) => h.row.page === page)), ...hits.filter((h) => h.row.kind === 'command')];
}

/** Screen reader words for how many were found. */
export function foundSaid(n: number, query: string): string {
  if (!query.trim()) return '';
  if (!n) return `Nothing in Preferences matches ${query.trim()}. Press Enter to search the help instead.`;
  return n === 1 ? 'One setting found. Press Enter to go to it.' : `${n} settings found. Use the up and down arrows, then Enter to go to one.`;
}
