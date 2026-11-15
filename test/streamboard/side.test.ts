// The private side as pure functions: what the board may be told about the vote, the guessing game and the waiting prompts.
// The rule under test is the covering one: viewers' words and the secret word are left out of the data while covered.
import { describe, expect, it } from 'vitest';
import { guessRows, guessSide, jarSide, keepRead, outcomeWords, voteSide } from '../../src/streamboard/side';
import type { RoundView } from '../../src/guess/round';
import type { VoteView } from '../../src/votes/tally';

const SETUP = { lengths: [{ seconds: 60, label: '1 minute' }], seconds: 60 };

const voteView = (over: Partial<VoteView> = {}): VoteView => ({
  status: 'open',
  question: 'Which colour?',
  options: ['Red', 'Blue', 'Green'],
  counts: [3, 1, 0],
  total: 4,
  startedAt: 0,
  endsAt: 90_000,
  endedAt: null,
  turnedAway: {} as VoteView['turnedAway'],
  outcome: { kind: 'winner', index: 0 },
  ...over,
});

describe('the vote', () => {
  it('lists the question and every option in full, with counts and percents that add up', () => {
    const v = voteSide({ phase: 'open', view: voteView() }, SETUP);
    expect(v.question).toBe('Which colour?');
    expect(v.options.map((o) => o.text)).toEqual(['Red', 'Blue', 'Green']);
    expect(v.options.map((o) => o.count)).toEqual([3, 1, 0]);
    expect(v.options.reduce((a, o) => a + o.percent, 0)).toBe(100);
    expect(v.endsAt).toBe(90_000);
    expect(v.outcome).toBe('');
  });
  it('says the result in words once it ends, and a tie never picks one', () => {
    const r = voteSide({ phase: 'result', view: voteView({ status: 'ended', endedAt: 5 }) }, SETUP);
    expect(r.outcome).toBe('Red won');
    expect(r.endsAt).toBeNull();
    expect(outcomeWords({ kind: 'tie', indices: [0, 2] }, ['Red', 'Blue', 'Green'])).toBe('A tie: Red, Green');
    expect(outcomeWords({ kind: 'none' }, [])).toBe('Nobody voted');
  });
  it('holds the way to write one when nothing is going', () => {
    const v = voteSide({ phase: 'none' }, SETUP);
    expect(v.phase).toBe('none');
    expect(v.setup).toEqual(SETUP);
    expect(v.options).toEqual([]);
  });
  it('carries counts only: nothing about who voted', () => {
    expect(Object.keys(voteSide({ phase: 'open', view: voteView() }, SETUP)).sort()).toEqual(['endsAt', 'options', 'outcome', 'phase', 'question', 'setup', 'total']);
  });
});

const GUESSES = [
  { text: 'giraffe', right: false },
  { text: 'elephant', right: true },
  { text: 'zebra', right: false },
];

describe('the guesses', () => {
  it('lists newest first, with words, on a private board that shows the word', () => {
    expect(guessRows(GUESSES, false, false, true)).toEqual([
      { text: 'zebra', right: false },
      { text: 'elephant', right: true },
      { text: 'giraffe', right: false },
    ]);
  });
  it('never shows a right guess as words when the word itself is not showing', () => {
    const rows = guessRows(GUESSES, false, false, false);
    expect(rows.find((r) => r.right)?.text).toBeNull();
    expect(JSON.stringify(rows)).not.toContain('elephant');
  });
  it('carries no words at all while covered and unread, then the wrong ones once read', () => {
    expect(JSON.stringify(guessRows(GUESSES, true, false, false))).not.toMatch(/giraffe|zebra|elephant/);
    const read = guessRows(GUESSES, true, true, false);
    expect(read.filter((r) => !r.right).map((r) => r.text)).toEqual(['zebra', 'giraffe']);
    expect(JSON.stringify(read)).not.toContain('elephant');
  });
  it('runs the words through the scrub', () => {
    expect(guessRows([{ text: 'secret path', right: false }], false, false, false, (t) => t.replace('secret', 'xxx'))[0].text).toBe('xxx path');
  });
});

const ROUND: RoundView = {
  status: 'open',
  letters: [8],
  shown: [['e', null, null, null, null, null, null, null]],
  hintsLeft: 2,
  players: 3,
  guesses: 3,
  solvers: 0,
  warmth: 'warm',
  startedAt: 0,
  endsAt: null,
  endedAt: null,
  ending: 'first',
  reason: null,
  winner: null,
  answer: null,
  turnedAway: {} as RoundView['turnedAway'],
};
const gf = (over: Partial<Parameters<typeof guessSide>[0]> = {}) => ({ screen: { phase: 'open' as const, view: ROUND }, secret: 'elephant', recent: GUESSES, covers: false, read: false, setup: SETUP, ...over });

describe('the guessing game', () => {
  it('shows the secret word, the blanks and the guesses on a private board', () => {
    const g = guessSide(gf());
    expect(g.word).toBe('elephant');
    expect(g.rows.map((r) => r.text)).toEqual(['zebra', 'elephant', 'giraffe']);
    expect(g.canWrite).toBe(true);
  });
  it('leaves the secret word out of the data when the board is covered, even if it was handed in', () => {
    const g = guessSide(gf({ covers: true }));
    expect(g.word).toBeNull();
    expect(JSON.stringify(g)).not.toMatch(/elephant|giraffe|zebra/);
    expect(g.rowsCovered).toBe(true);
    expect(g.canWrite).toBe(false);
  });
  it('lists the wrong guesses once they are read on a covered board, still without the word', () => {
    const g = guessSide(gf({ covers: true, read: true }));
    expect(g.rowsCovered).toBe(false);
    expect(g.word).toBeNull();
    expect(JSON.stringify(g)).not.toContain('elephant');
  });
  it('has no word and no rows before a round and after it ends the answer is the reveal', () => {
    expect(guessSide(gf({ screen: { phase: 'none' }, secret: null, recent: [] })).rows).toEqual([]);
    const over = guessSide(gf({ screen: { phase: 'result', view: { ...ROUND, status: 'ended', answer: 'elephant' } } }));
    expect(over.answer).toBe('elephant');
    expect(over.word).toBeNull();
    expect(over.rows).toEqual([]);
  });
});

const SLIPS = [
  { id: 1, text: 'a dragon' },
  { id: 2, text: 'a tiny boat' },
];

describe('the waiting prompts', () => {
  it('lists every one, in full, on a private board', () => {
    const j = jarSide(SLIPS, 50, false, new Set());
    expect(j.count).toBe(2);
    expect(j.slips.map((s) => s.text)).toEqual(['a dragon', 'a tiny boat']);
    expect(j.anyCovered).toBe(false);
  });
  it('carries no words while covered, and reads them one at a time or all at once', () => {
    const covered = jarSide(SLIPS, 50, true, new Set());
    expect(JSON.stringify(covered)).not.toMatch(/dragon|boat/);
    expect(covered.anyCovered).toBe(true);
    const one = jarSide(SLIPS, 50, true, new Set([2]));
    expect(one.slips.map((s) => s.text)).toEqual([null, 'a tiny boat']);
    expect(JSON.stringify(one)).not.toContain('dragon');
    expect(one.anyRead).toBe(true);
    expect(jarSide(SLIPS, 50, true, new Set([1, 2])).anyCovered).toBe(false);
  });
  it('forgets a read slip that left the jar', () => {
    expect([...keepRead(new Set([1, 2, 3]), [{ id: 2 }, { id: 3 }])].sort()).toEqual([2, 3]);
  });
});
