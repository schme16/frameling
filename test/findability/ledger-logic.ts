// The ratchet. Every exact number in known-gaps.ts (menu sizes, list lengths, what a still has on offer, the stream
// load, the tools that leave the rail) has a history in ledger-history.ts: a dated row for every time it changed, each
// with the reason in words. The number in known-gaps.ts has to be the last row. So a number cannot go up, or down, or
// appear, without somebody writing down when and why, and a test that fails says exactly what to write.
//
// Pure functions, so ledger.test.ts can prove the refusal works on made-up histories as well as on the real one.
export interface Row {
  /** The day it changed, as YYYY-MM-DD. */
  on: string;
  /** The number from that day on. */
  n: number;
  /** Plain words: what made it change, and why that is worth it (for a rise) or what paid for it (for a fall). */
  why: string;
}

export type History = Record<string, Row[]>;

/** The shortest reason a row can have: a sentence, not a word. */
export const MIN_WORDS = 8;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER = /\b(todo|tbd|tbc|fixme|say why|because needed|needed|reason here)\b/i;

/** Where to write a row, and the shape of one, for the message a failing test prints. */
export const rowHelp = (key: string, n: number, today: string): string =>
  `Add this as the last row of '${key}' in test/findability/ledger-history.ts and fill in why:\n  { on: '${today}', n: ${n}, why: 'what made it change, and why that is worth the weight' },`;

/** The problems with one entry's history against the number now in known-gaps.ts. Empty means it is fine. */
export function problemsWith(key: string, now: number, rows: Row[] | undefined, today: string): string[] {
  if (!rows || rows.length === 0) return [`${key} is ${now} and has no history. A new entry needs a first row that says why it is there.\n${rowHelp(key, now, today)}`];
  const out: string[] = [];
  rows.forEach((r, i) => {
    const at = `${key}, row ${i + 1} (${r.on}, ${r.n})`;
    if (!DAY.test(r.on)) out.push(`${at}: the date has to look like 2026-11-16.`);
    else if (r.on > today) out.push(`${at}: that day has not happened yet.`);
    if (i > 0 && DAY.test(r.on) && DAY.test(rows[i - 1].on) && r.on < rows[i - 1].on) out.push(`${at}: dated before the row above it. Rows go in the order they happened.`);
    if (!Number.isInteger(r.n) || r.n < 0) out.push(`${at}: n has to be a whole number, 0 or more.`);
    const words = (r.why ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS || PLACEHOLDER.test(r.why ?? '')) {
      const kind = i === 0 ? 'is there' : r.n > rows[i - 1].n ? `went up from ${rows[i - 1].n} to ${r.n}` : r.n < rows[i - 1].n ? `went down from ${rows[i - 1].n} to ${r.n}` : 'was written down again';
      out.push(`${at}: it ${kind} with no reason. Write a sentence (at least ${MIN_WORDS} words) saying what made it change and why that is worth it. "needed" and "todo" are not reasons.`);
    }
    if (i > 0 && r.n === rows[i - 1].n) out.push(`${at}: the number did not change from the row above, so there is nothing to write. Delete the row.`);
  });
  const last = rows[rows.length - 1];
  if (last.n !== now) {
    const dir = now > last.n ? `went UP from ${last.n} to ${now}` : `went down from ${last.n} to ${now}`;
    out.push(
      `${key} ${dir}, and the history stops at ${last.n}. ${now > last.n ? 'A rise needs a reason on the record before it is allowed. If you can take something out instead, do that and the number never rises.' : 'Write down what paid for it, so the win is kept.'}\n${rowHelp(key, now, today)}`,
    );
  }
  return out;
}

/** Every entry in the history that is not a number in known-gaps.ts any more: delete it. */
export const orphans = (history: History, now: Record<string, number>): string[] => Object.keys(history).filter((k) => !(k in now));

/** Flatten nested records of numbers into `Name.part.part` keys. */
export function flatten(name: string, value: unknown, out: Record<string, number> = {}): Record<string, number> {
  if (typeof value === 'number') out[name] = value;
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(`${name}.${k}`, v, out);
  return out;
}
