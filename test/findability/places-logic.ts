// The logic of the moved-commands audit, with nothing of the app in it, so it can be tested on made-up records
// (places-logic.test.ts) as well as run on the real one (places.test.ts).
import type { Move, MoveKind } from './known-moves';

/** What is written down about one command. Every field is a plain string so a move can be written as "from" and "to". */
export interface Place {
  /** The name people read ("Capture view"). */
  name: string;
  /** Every menu list it is in, as "View > Sharing your screen", joined by " | " (any situation); or NO_MENU. */
  place: string;
  /** Its default shortcuts, joined by ", "; or NO_KEYS. */
  keys: string;
  /** The optional feature that owns it ("popout"), so turning that off takes it away; or ALWAYS_ON. */
  switch: string;
  /** IN_PALETTE or NOT_IN_PALETTE. */
  palette: string;
  /** Its own search words that found it in the first three results when the record was made. */
  words: string[];
}

export type Book = Record<string, Place>;

export const NO_MENU = 'no menu (palette and keys only)';
export const NO_KEYS = 'no shortcut';
export const ALWAYS_ON = 'always on';
export const IN_PALETTE = 'in the palette';
export const NOT_IN_PALETTE = 'left out of the palette';
export const NOT_FOUND = 'not in the first five results';

/** One thing that is different: which command, what kind of difference, how it was and how it is. */
export interface Change {
  id: string;
  what: MoveKind;
  from: string;
  to: string;
}

/** How far down the results a recorded word may slip before somebody is told. */
export const WORD_RECORDED_AT = 3;
export const WORD_TOLERATED_TO = 5;

/** How many clicks the shallowest way in through the menus takes (menu, each submenu, the entry), or 0 when there is none. */
export function clicksOf(place: string): number {
  if (place === NO_MENU) return 0;
  return Math.min(...place.split(' | ').map((p) => p.split(' > ').length + 1));
}

const SCALARS: MoveKind[] = ['place', 'name', 'keys', 'switch', 'palette'];
const field = (p: Place, k: MoveKind): string => ({ place: p.place, name: p.name, keys: p.keys, switch: p.switch, palette: p.palette, search: '', gone: '' })[k];

export interface Searcher {
  /** The command's keywords now, lower case. */
  keywords(id: string): Set<string>;
  /** Does a search for the word still show the command in the first five results? Slow, so asked only when needed. */
  finds(word: string, id: string): boolean;
}

/** Every difference between how things were written down and how they are, before any move is excused. */
export function differences(was: Book, now: Book, search: Searcher): Change[] {
  const out: Change[] = [];
  for (const [id, w] of Object.entries(was)) {
    const n = now[id];
    if (!n) {
      out.push({ id, what: 'gone', from: w.name, to: 'removed' });
      continue;
    }
    for (const k of SCALARS) if (field(w, k) !== field(n, k)) out.push({ id, what: k, from: field(w, k), to: field(n, k) });
    // Searching is slow, so only a word the command stopped listing is searched for: if it is still a keyword it still finds it.
    const keywords = search.keywords(id);
    for (const word of w.words) if (!keywords.has(word) && !search.finds(word, id)) out.push({ id, what: 'search', from: word, to: NOT_FOUND });
  }
  return out;
}

/** Follows the written-down moves from how a thing was, and says whether they end where it is now. Marks the ones it used. */
export function excused(c: Change, moves: Move[], used: Set<Move>): boolean {
  if (c.what === 'search' || c.what === 'gone') {
    const m = moves.find((x) => x.id === c.id && x.what === c.what && x.from === c.from);
    if (m) used.add(m);
    return !!m;
  }
  let at = c.from;
  const chain: Move[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const m = moves.find((x) => x.id === c.id && x.what === c.what && x.from === at && !chain.includes(x));
    if (!m) break;
    chain.push(m);
    at = m.to;
  }
  if (at !== c.to) return false;
  for (const m of chain) used.add(m);
  return true;
}

const q = (s: string): string => `"${s}"`;
const clicks = (n: number): string => (n === 0 ? 'no menu' : `${n} click${n === 1 ? '' : 's'} deep`);

/** The plain-words sentence for one change, the way a person who used the command yesterday would want it said. */
export function sentence(c: Change, was: Book, now: Book): string {
  const old = was[c.id]?.name ?? c.id;
  const cur = now[c.id]?.name ?? old;
  const who = `${c.what === 'name' || old === cur ? q(cur) : `${q(old)} (now ${q(cur)})`} (${c.id})`;
  switch (c.what) {
    case 'place': {
      const a = clicksOf(c.from);
      const b = clicksOf(c.to);
      const depth = b === 0 ? 'It is no longer in any menu: it is the palette and its shortcut only.' : a === 0 ? `It was palette-only and is now ${clicks(b)}.` : b > a ? `That is deeper: ${clicks(b)}, it was ${clicks(a)}.` : b < a ? `That is shallower: ${clicks(b)}, it was ${clicks(a)}.` : `The same depth (${clicks(b)}).`;
      return `${who} moved. It used to be in ${c.from}; it is now in ${c.to}. ${depth}`;
    }
    case 'name':
      return `${who} was renamed. It used to be called ${q(c.from)}; it is now ${q(c.to)}. Somebody looking for the old name will not see it.`;
    case 'keys':
      return c.to === NO_KEYS ? `${who} lost its shortcut. It used to be ${c.from}; it has none now.` : c.from === NO_KEYS ? `${who} got a shortcut: ${c.to}.` : `${who} has a different shortcut. It used to be ${c.from}; it is now ${c.to}.`;
    case 'switch':
      return c.from === ALWAYS_ON ? `${who} is now behind the "${c.to}" feature switch. It used to be always on, so a person who turns that feature off loses it.` : c.to === ALWAYS_ON ? `${who} is no longer behind the "${c.from}" feature switch: it is always on.` : `${who} moved from the "${c.from}" feature switch to "${c.to}".`;
    case 'palette':
      return `${who} is ${c.to} now; it was ${c.from}.`;
    case 'search':
      return `Typing ${q(c.from)} in the palette used to show ${who} in the first three results. It no longer shows in the first five.`;
    case 'gone':
      return `${who} no longer exists. Anybody who used it, or whose saved menus or shortcuts name it, now finds nothing. Say what replaced it.`;
  }
}

/** The line to paste into known-moves.ts. */
export const literal = (c: Change): string => `  { id: ${JSON.stringify(c.id)}, what: ${JSON.stringify(c.what)}, from: ${JSON.stringify(c.from)}, to: ${JSON.stringify(c.to)}, why: 'SAY WHY, in plain words, and who asked' },`;

export const HOW_TO = [
  'If this was on purpose: add each line below to MOVES in test/findability/known-moves.ts and fill in why. When you send the look for the',
  'change, say the old place and the new one in a sentence ("the capture view is now in View > Sharing your screen").',
  'If it was by accident: put it back.',
].join('\n');

/** The whole failure message for what nobody wrote down. */
export function failure(unexplained: Change[], was: Book, now: Book): string {
  return `\n${unexplained.length} change${unexplained.length === 1 ? '' : 's'} nobody wrote down:\n\n${unexplained.map((c) => `- ${sentence(c, was, now)}`).join('\n')}\n\n${HOW_TO}\n\n${unexplained.map(literal).join('\n')}\n`;
}

/** What is wrong with the written-down moves themselves (stale, no reason, a dash), in words. */
export function ledgerProblems(moves: Move[], was: Book, used: Set<Move>): string[] {
  const problems: string[] = [];
  for (const m of moves) {
    if (!(m.id in was)) problems.push(`${m.id}: known-moves.ts names a command the record does not have. Delete the line.`);
    else if (!used.has(m)) problems.push(`${m.id} (${m.what}, "${m.from}" to "${m.to}"): this move is not part of what changed since the record, so it is stale or its words are not exact. Delete it, or copy the words from the failing test.`);
    if (m.why.trim().length < 12 || /SAY WHY/.test(m.why)) problems.push(`${m.id} (${m.what}): the reason is missing. Say why it moved and who asked.`);
    if (/[–—]/.test(m.why + m.to + m.from)) problems.push(`${m.id}: has a dash in it (the house style has none).`);
  }
  return problems;
}
