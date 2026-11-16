// The ratchet on known-gaps.ts. See ledger-logic.ts for the rule and ledger-history.ts for the record. A number in
// known-gaps.ts that goes up, goes down, or turns up new without a dated reason beside it fails here, and the message
// prints the row to add. Changing the number is the easy half; writing why it is worth the weight is the half that
// stops a ledger drifting up one fair reason at a time.
import { describe, expect, it } from 'vitest';
import { BIG_MENUS, CEILINGS, LONG_LISTS, STILL_LOAD, STREAM_LOAD, STREAM_LOAD_TUCKED } from './known-gaps';
import { HISTORY } from './ledger-history';
import { flatten, MIN_WORDS, orphans, problemsWith, type Row } from './ledger-logic';

const today = new Date().toISOString().slice(0, 10);
const now = (): Record<string, number> => ({
  ...flatten('CEILINGS', CEILINGS),
  ...flatten('LONG_LISTS', LONG_LISTS),
  ...flatten('BIG_MENUS', BIG_MENUS),
  ...flatten('STREAM_LOAD', STREAM_LOAD),
  ...flatten('STREAM_LOAD_TUCKED', STREAM_LOAD_TUCKED),
  ...flatten('STILL_LOAD', STILL_LOAD),
});

describe('the ledger is a ratchet: no number moves without a dated reason', () => {
  it('every exact number in known-gaps.ts ends its history, and every row has a date and a real reason', () => {
    const problems = Object.entries(now()).flatMap(([k, n]) => problemsWith(k, n, HISTORY[k], today));
    expect(problems.join('\n\n'), 'a number moved without a row in ledger-history.ts').toBe('');
  });

  it('the history holds nothing for a number that is gone', () => {
    expect(orphans(HISTORY, now()), 'no longer in known-gaps.ts: delete the entry').toEqual([]);
  });

  it('looked at the real ledger, not an empty one', () => {
    expect(Object.keys(now()).length).toBeGreaterThan(25);
    expect(HISTORY['BIG_MENUS.View'].length).toBeGreaterThan(5);
  });
});

describe('the refusal itself', () => {
  const rows = (...r: [number, string][]): Row[] => r.map(([n, why], i) => ({ on: `2026-11-${10 + i}`, n, why }));
  const WHY = 'Added one thing people look for in this menu, because the palette alone would not find it';

  it('accepts a history whose last row is the number and whose every row says why', () => {
    expect(problemsWith('X.y', 12, rows([10, WHY], [12, WHY]), today)).toEqual([]);
  });

  it('refuses a rise nobody wrote down, and prints the row to add', () => {
    const p = problemsWith('BIG_MENUS.View', 202, rows([201, WHY]), '2026-11-16');
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('went UP from 201 to 202');
    expect(p[0]).toContain("{ on: '2026-11-16', n: 202, why:");
    expect(p[0]).toContain('test/findability/ledger-history.ts');
  });

  it('refuses a rise whose row has no real reason', () => {
    for (const why of ['', 'needed', 'todo', 'two more entries', 'Needed for the new panel thing now ok']) {
      const p = problemsWith('X.y', 12, rows([10, WHY], [12, why]), today);
      expect(p.join('|'), why).toContain('went up from 10 to 12 with no reason');
    }
  });

  it('refuses a fall with no reason too, so a win is written down', () => {
    expect(problemsWith('X.y', 8, rows([10, WHY]), today)[0]).toContain('went down from 10 to 8');
    expect(problemsWith('X.y', 8, rows([10, WHY], [8, 'ok']), today).join('|')).toContain('went down from 10 to 8 with no reason');
  });

  it('refuses a number with no history, a bad date, a future date, rows out of order and a row that changes nothing', () => {
    expect(problemsWith('X.new', 3, undefined, today)[0]).toContain('has no history');
    expect(problemsWith('X.y', 3, [{ on: 'yesterday', n: 3, why: WHY }], today).join('|')).toContain('the date has to look like');
    expect(problemsWith('X.y', 3, [{ on: '2999-01-01', n: 3, why: WHY }], today).join('|')).toContain('has not happened yet');
    expect(problemsWith('X.y', 3, [{ on: '2026-11-12', n: 2, why: WHY }, { on: '2026-11-11', n: 3, why: WHY }], today).join('|')).toContain('dated before the row above');
    expect(problemsWith('X.y', 3, [{ on: '2026-11-12', n: 3, why: WHY }, { on: '2026-11-13', n: 3, why: WHY }], today).join('|')).toContain('nothing to write');
  });

  it(`wants at least ${MIN_WORDS} words, so a reason is a sentence`, () => {
    expect(problemsWith('X.y', 3, [{ on: '2026-11-12', n: 3, why: 'one two three four five six seven' }], today).join('|')).toContain('no reason');
    expect(problemsWith('X.y', 3, [{ on: '2026-11-12', n: 3, why: 'one two three four five six seven eight' }], today)).toEqual([]);
  });

  it('lists a history entry whose number is gone', () => {
    expect(orphans({ 'A.b': [], 'C.d': [] }, { 'A.b': 1 })).toEqual(['C.d']);
  });
});
