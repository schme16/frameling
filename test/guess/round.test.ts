// A round with nothing else around it: the setup rules, the word kept out of the view, one person one place, the guess
// cap, the winner, hints, the end, and that nothing that identifies a guesser is held once the round is over.
import { describe, expect, it } from 'vitest';
import { cleanPlayer, cleanSetup, createRound, GUESS_MAX, MAX_GUESSES_EACH, MAX_PLAYERS, RECENT_MAX, took, type Round } from '../../src/guess/round';

const salt = (n: number) => new Uint8Array(16).fill(n);
let clock = 1000;
const make = (word = 'elephant', over: { seconds?: number | null; ending?: 'first' | 'timer' } = {}, s = 1) => {
  clock = 1000;
  return createRound({ word, seconds: over.seconds ?? null, ending: over.ending ?? 'first' }, { now: () => clock, salt: () => salt(s) });
};
/** Prepare then cast, as the action does. */
function guess(r: Round, text: unknown, player: unknown, name?: unknown, names = false) {
  const p = r.prepare(text, player, name, { names });
  return typeof p === 'string' ? p : r.cast(p);
}

describe('writing a round', () => {
  it('needs a word with a letter in it, tidied and cut to length', () => {
    expect(cleanSetup({ word: '  ' }).ok).toBe(false);
    expect(cleanSetup({}).ok).toBe(false);
    expect(cleanSetup({ word: '!!!' }).ok).toBe(false);
    const r = cleanSetup({ word: ' A\n cat  in a hat ', seconds: 90, ending: 'timer' });
    expect(r.ok && r.setup).toEqual({ word: 'A cat in a hat', seconds: 90, ending: 'timer' });
    const long = cleanSetup({ word: 'x'.repeat(100) });
    expect(long.ok && long.setup.word).toHaveLength(40);
  });
  it('takes a length of at least ten seconds, or none; the ending is first unless it says timer', () => {
    const s = (seconds: unknown) => { const r = cleanSetup({ word: 'cat', seconds }); return r.ok ? r.setup.seconds : 'bad'; };
    expect(s(0)).toBeNull();
    expect(s(5)).toBeNull();
    expect(s(120)).toBe(120);
    expect(s(99999)).toBe(3600);
    const e = (ending: unknown) => { const r = cleanSetup({ word: 'cat', ending }); return r.ok ? r.setup.ending : 'bad'; };
    expect(e(undefined)).toBe('first');
    expect(e('timer')).toBe('timer');
    expect(e('nonsense')).toBe('first');
  });
  it('a player id is a short string or a whole number with nothing odd in it', () => {
    expect(cleanPlayer(12345)).toBe('12345');
    expect(cleanPlayer(' abc ')).toBe('abc');
    for (const bad of [undefined, null, '', '  ', 1.5, {}, 'x'.repeat(65), 'a\u0000b', 'a‮b']) expect(cleanPlayer(bad), String(bad)).toBeNull();
  });
});

describe('the word stays out of the view while the round runs', () => {
  it('has blanks, a count and nothing of the word, until it ends', () => {
    const r = make('ice cream');
    const v = r.view();
    expect(v.letters).toEqual([3, 5]);
    expect(v.shown).toEqual([[null, null, null], [null, null, null, null, null]]);
    expect(v.answer).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/ice|cream/i);
    guess(r, 'banana', 'a');
    expect(JSON.stringify(r.view())).not.toMatch(/ice|cream/i);
    r.end('revealed', 5000);
    expect(r.view().answer).toBe('ice cream');
  });
  it('a hint gives away one letter at a time, never more than a third, and only those letters show', () => {
    const r = make('elephant');
    expect(r.view().hintsLeft).toBe(2);
    expect(r.hint(() => 0)).toBe(true);
    expect(r.view().shown[0][0]).toBe('e');
    expect(r.hint(() => 0)).toBe(true);
    expect(r.view().shown[0].filter(Boolean)).toHaveLength(2);
    expect(r.hint()).toBe(false);
    expect(r.view().hintsLeft).toBe(0);
    expect(r.view().answer).toBeNull();
    const short = make('cat');
    expect(short.view().hintsLeft).toBe(1);
    short.hint();
    expect(short.hint()).toBe(false);
  });
  it('a hint after the end gives nothing', () => {
    const r = make('elephant');
    r.end('timeup', 2000);
    expect(r.hint()).toBe(false);
  });
});

describe('guessing', () => {
  it('counts people and guesses, and tells right from wrong', () => {
    const r = make();
    expect(guess(r, 'giraffe', 'ann')).toBe('wrong');
    expect(guess(r, 'zebra', 'ann')).toBe('wrong');
    expect(guess(r, 'a hippo', 'bob')).toBe('wrong');
    const v = r.view();
    expect(v.players).toBe(2);
    expect(v.guesses).toBe(3);
    expect(v.solvers).toBe(0);
    expect(v.winner).toBeNull();
  });
  it('one person, one place: a person is counted once however many guesses they make', () => {
    const r = make();
    for (let i = 0; i < 5; i++) guess(r, `wrong${i}`, 'ann');
    expect(r.view().players).toBe(1);
    expect(r.view().guesses).toBe(5);
  });
  it('a person who got it is done: a second right guess does not count twice, and they cannot keep guessing', () => {
    const r = make('elephant', { ending: 'timer' });
    expect(guess(r, 'elephant', 'ann')).toBe('right');
    expect(guess(r, 'elephant', 'ann')).toBe('solved');
    expect(guess(r, 'giraffe', 'ann')).toBe('solved');
    expect(r.view().solvers).toBe(1);
    expect(r.view().guesses).toBe(1);
    expect(r.view().turnedAway.solved).toBe(2);
  });
  it('the first person to get it is the winner, and later ones only add to the count', () => {
    const r = make('elephant', { ending: 'timer' });
    clock = 4000;
    guess(r, 'elephnt', 'ann', 'Ann', true);
    clock = 6000;
    guess(r, 'elephant', 'bob', 'Bob', true);
    const v = r.view();
    expect(v.solvers).toBe(2);
    expect(v.winner).toEqual({ name: 'Ann', afterMs: 3000 });
  });
  it('a person has a limit on guesses, so nobody can read the dictionary at it', () => {
    const r = make();
    for (let i = 0; i < MAX_GUESSES_EACH; i++) expect(guess(r, `w${i}`, 'ann')).toBe('wrong');
    expect(guess(r, 'elephant', 'ann')).toBe('too-many');
    expect(r.view().solvers).toBe(0);
    expect(guess(r, 'elephant', 'bob')).toBe('right');
  });
  it('turns away a guess with no player id, an empty guess, or a guess of only punctuation, and counts them', () => {
    const r = make();
    expect(guess(r, 'elephant', undefined)).toBe('no-player');
    expect(guess(r, 'elephant', '  ')).toBe('no-player');
    expect(guess(r, '', 'ann')).toBe('no-guess');
    expect(guess(r, '!!!', 'ann')).toBe('no-guess');
    expect(guess(r, 42, 'ann')).toBe('no-guess');
    expect(guess(r, undefined, 'ann')).toBe('no-guess');
    expect(r.view().guesses).toBe(0);
    expect(r.view().players).toBe(0);
    expect(r.view().turnedAway['no-player']).toBe(2);
    expect(r.view().turnedAway['no-guess']).toBe(4);
    // A refused guess does not use anything up.
    expect(guess(r, 'elephant', 'ann')).toBe('right');
  });
  it('takes the guess from { text } too, cleaned like all chat text: links and mentions are gone', () => {
    const r = make('elephant');
    expect(guess(r, { text: 'elephant' }, 'a')).toBe('right');
    const q = make('elephant');
    expect(guess(q, 'elephant www.spam.com @someone', 'a')).toBe('right');
  });
  it('cuts a very long guess instead of choking on it', () => {
    const r = make();
    expect(guess(r, 'z'.repeat(5000), 'a')).toBe('wrong');
    expect(GUESS_MAX).toBe(60);
  });
  it('turns away new people past the cap, but not those already in', () => {
    const r = make();
    for (let i = 0; i < MAX_PLAYERS; i++) r.cast({ text: 'x', mark: `m${i}`, right: false, alike: 0, how: null, name: null });
    expect(guess(r, 'x1', 'late')).toBe('full');
    expect(r.cast({ text: 'x', mark: 'm0', right: false, alike: 0, how: null, name: null })).toBe('wrong');
  });
  it('warmth only goes up, and says nothing of the guess', () => {
    const r = make('horse');
    expect(r.view().warmth).toBe('none');
    guess(r, 'xqzvw', 'a');
    expect(r.view().warmth).toBe('cold');
    guess(r, 'house', 'b');
    expect(r.view().warmth).toBe('hot');
    guess(r, 'xqzvw', 'c');
    expect(r.view().warmth).toBe('hot');
    expect(JSON.stringify(r.view())).not.toMatch(/house|xqzvw/);
  });
  it('a guess prepared before the end cannot be counted after it', () => {
    const r = make();
    const p = r.prepare('elephant', 'ann', undefined, { names: false });
    r.end('timeup', 2000);
    expect(typeof p).toBe('object');
    expect(r.cast(p as never)).toBe('closed');
    expect(r.view().solvers).toBe(0);
  });
  it('turns everything away once it has ended', () => {
    const r = make();
    r.end('timeup', 2000);
    expect(guess(r, 'elephant', 'bob')).toBe('closed');
    expect(r.view().status).toBe('ended');
    expect(r.view().endedAt).toBe(2000);
    expect(r.view().reason).toBe('timeup');
  });
  it('ending twice keeps the first ending', () => {
    const r = make();
    r.end('solved', 2000);
    r.end('timeup', 3000);
    expect(r.view().reason).toBe('solved');
    expect(r.view().endedAt).toBe(2000);
  });
});

describe('names', () => {
  it('a name is read only from the right guess, and only when names are allowed', () => {
    const wrong = make();
    guess(wrong, 'giraffe', 'a', 'Wrong Willy', true);
    expect(wrong._held().name).toBeNull();
    const off = make();
    guess(off, 'elephant', 'a', 'Ann', false);
    expect(off.view().winner).toEqual({ name: null, afterMs: 0 });
    expect(off._held().name).toBeNull();
    const on = make();
    guess(on, 'elephant', 'a', 'Ann', true);
    expect(on.view().winner?.name).toBe('Ann');
  });
  it('a name is cleaned and cut like any chat text', () => {
    const r = make();
    guess(r, 'elephant', 'a', '  Ann   @everyone https://x.io  the Great and Terrible of all lands  ', true);
    const name = r.view().winner!.name!;
    expect(name.length).toBeLessThanOrEqual(24);
    expect(name).not.toMatch(/@|http/);
    expect(name.startsWith('Ann')).toBe(true);
  });
  it('a name that is nothing but symbols is no name', () => {
    const r = make();
    guess(r, 'elephant', 'a', '!!!', true);
    expect(r.view().winner?.name).toBeNull();
  });
});

describe('nothing that identifies a guesser is held once the round is over', () => {
  it('holds a salted mark per person while it runs, never the id, and drops them all at the end', () => {
    const r = make('elephant', {}, 7);
    guess(r, 'giraffe', 'night_owl_fan');
    guess(r, 'zebra', '998877665');
    const held = r._held();
    expect(held.salt).not.toBeNull();
    expect(held.marks).toHaveLength(2);
    for (const m of held.marks) {
      expect(m).toMatch(/^[0-9a-f]{32}$/);
      expect(m).not.toContain('night');
      expect(m).not.toContain('998877665');
    }
    r.end('timeup', 2000);
    const after = r._held();
    expect(after.salt).toBeNull();
    expect(after.marks).toEqual([]);
  });
  it('a new round has a new salt, so the same person has an unrelated mark', () => {
    const a = make('elephant', {}, 1);
    const b = make('elephant', {}, 2);
    guess(a, 'x1', 'ann');
    guess(b, 'x1', 'ann');
    expect(a._held().marks[0]).not.toBe(b._held().marks[0]);
  });
  it('the salt is wiped in place, not just let go', () => {
    const s = salt(9);
    const r = createRound({ word: 'cat', seconds: null, ending: 'first' }, { now: () => 0, salt: () => s });
    r.end('timeup', 1);
    expect([...s].every((b) => b === 0)).toBe(true);
  });
  it('forgetting wipes the word and the winner too', () => {
    const r = make('elephant');
    guess(r, 'elephant', 'ann', 'Ann', true);
    r.end('solved', 2000);
    expect(r.view().answer).toBe('elephant');
    r.forget();
    expect(r._held().word).toBe('');
    expect(r._held().name).toBeNull();
    expect(r.view().winner).toBeNull();
    expect(r.view().answer).toBeNull();
  });
});

describe('how long it took', () => {
  it('says it the way a person would', () => {
    expect(took(500)).toBe('1 second');
    expect(took(23_000)).toBe('23 seconds');
    expect(took(60_000)).toBe('1 minute');
    expect(took(65_000)).toBe('1 minute 5 seconds');
    expect(took(125_000)).toBe('2 minutes 5 seconds');
  });
});

describe('recent guesses for the private side', () => {
  it('keeps the cleaned words and whether they were right, never who', () => {
    const r = make();
    guess(r, 'giraffe', 'ann');
    guess(r, '  Elephant!! ', 'bob');
    const seen = r.recent();
    expect(seen).toEqual([
      { text: 'giraffe', right: false },
      { text: 'Elephant!!', right: true },
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/ann|bob/);
  });
  it('keeps only the last few, and forgets them all when the round ends', () => {
    const r = make('elephant', { ending: 'timer' });
    for (let i = 0; i < 40; i++) guess(r, `guess ${i}`, `p${i}`);
    expect(r.recent()).toHaveLength(RECENT_MAX);
    expect(r.recent().at(-1)?.text).toBe('guess 39');
    r.end('revealed', 5);
    expect(r.recent()).toEqual([]);
    expect(r._held().recent).toBe(0);
  });
  it('does not list a guess that was turned away', () => {
    const r = make();
    guess(r, '   ', 'ann');
    expect(r.recent()).toEqual([]);
  });
});
