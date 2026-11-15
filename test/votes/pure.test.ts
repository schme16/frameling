// The counting, with nothing else: the hash, the setup rules, one vote each, changing your mind, the outcome, and that
// nothing that identifies a voter is held anywhere once the vote has ended.
import { describe, expect, it } from 'vitest';
import { sha256Hex, voterMark } from '../../src/votes/hash';
import { cleanSetup, cleanVoter, createVote, MAX_VOTERS, optionIndex, outcomeOf, percents, type Ways } from '../../src/votes/tally';

const enc = (s: string) => new TextEncoder().encode(s);
const FIRST: Ways = { again: 'first', noId: 'refuse' };
const LATEST: Ways = { again: 'latest', noId: 'refuse' };
const ANON: Ways = { again: 'first', noId: 'count' };
const salt = (n: number) => new Uint8Array(16).fill(n);

function open(options = ['Red', 'Blue', 'Green'], seconds: number | null = null, s = 1) {
  return createVote({ question: 'Which colour?', options, seconds }, { now: () => 1000, salt: () => salt(s) });
}
/** Prepare then cast, as the action does. */
function vote(v: ReturnType<typeof open>, option: unknown, voter: unknown, ways = FIRST) {
  const p = v.prepare(option, voter, ways);
  return typeof p === 'string' ? p : v.cast(p, ways);
}

describe('sha256', () => {
  it('matches the standard test values', () => {
    expect(sha256Hex(enc(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex(enc('a'.repeat(1000)))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
  it('gives the same mark for the same salt and id, and an unrelated one for another salt', () => {
    expect(voterMark(salt(1), '42')).toBe(voterMark(salt(1), '42'));
    expect(voterMark(salt(1), '42')).not.toBe(voterMark(salt(2), '42'));
    expect(voterMark(salt(1), '42')).not.toBe(voterMark(salt(1), '43'));
    expect(voterMark(salt(1), '42')).toHaveLength(32);
  });
});

describe('writing a vote', () => {
  it('needs a question and two to six different options, tidied', () => {
    expect(cleanSetup({ question: '  ', options: ['a', 'b'] }).ok).toBe(false);
    expect(cleanSetup({ question: 'Q', options: ['a'] }).ok).toBe(false);
    expect(cleanSetup({ question: 'Q', options: ['a', 'A', ' '] }).ok).toBe(false);
    expect(cleanSetup({ question: 'Q', options: ['1', '2', '3', '4', '5', '6', '7'] }).ok).toBe(false);
    const r = cleanSetup({ question: ' Which\n colour? ', options: [' Red ', 'Blue', '', 'red', 'x'.repeat(100)], seconds: 60 });
    expect(r.ok && r.setup).toEqual({ question: 'Which colour?', options: ['Red', 'Blue', 'x'.repeat(40)], seconds: 60 });
  });
  it('takes a length of at least five seconds, or none', () => {
    const s = (seconds: unknown) => { const r = cleanSetup({ question: 'Q', options: ['a', 'b'], seconds }); return r.ok ? r.setup.seconds : 'bad'; };
    expect(s(0)).toBeNull();
    expect(s(null)).toBeNull();
    expect(s(3)).toBeNull();
    expect(s(45)).toBe(45);
    expect(s(99999)).toBe(3600);
  });
});

describe('which option a request means', () => {
  const o = ['Red', 'Blue', 'Green'];
  it('takes a place or the words, and nothing else', () => {
    expect(optionIndex(1, o)).toBe(0);
    expect(optionIndex('3', o)).toBe(2);
    expect(optionIndex(' blue ', o)).toBe(1);
    for (const bad of [0, 4, -1, 1.5, '0', '4', 'purple', '', null, undefined, {}, [], true]) expect(optionIndex(bad, o), String(bad)).toBe(-1);
  });
  it('takes a short voter id, and nothing odd', () => {
    expect(cleanVoter('12345')).toBe('12345');
    expect(cleanVoter(12345)).toBe('12345');
    for (const bad of ['', '   ', 'x'.repeat(65), 'a\u0000b', 'a​b', null, undefined, {}, 1.5, true]) expect(cleanVoter(bad), String(bad)).toBeNull();
  });
});

describe('counting', () => {
  it('counts each person once, and says why a second vote is turned away', () => {
    const v = open();
    expect(vote(v, 1, 'ann')).toBe('counted');
    expect(vote(v, 2, 'bob')).toBe('counted');
    expect(vote(v, 1, 'cat')).toBe('counted');
    expect(vote(v, 2, 'ann')).toBe('again');
    expect(vote(v, 1, 'ann')).toBe('again');
    expect(v.view().counts).toEqual([2, 1, 0]);
    expect(v.view().total).toBe(3);
    expect(v.view().turnedAway.again).toBe(2);
  });
  it('turns away an option that does not exist, and never counts it', () => {
    const v = open();
    expect(vote(v, 4, 'ann')).toBe('no-option');
    expect(vote(v, 'purple', 'ann')).toBe('no-option');
    expect(v.view().total).toBe(0);
    // The turned-away vote did not use up the person's one vote.
    expect(vote(v, 3, 'ann')).toBe('counted');
  });
  it('turns away a vote with no voter id, unless told to count it', () => {
    const v = open();
    expect(vote(v, 1, undefined)).toBe('no-voter');
    expect(v.view().total).toBe(0);
    expect(vote(v, 1, undefined, ANON)).toBe('counted');
    expect(vote(v, 1, undefined, ANON)).toBe('counted');
    expect(v.view().counts).toEqual([2, 0, 0]);
  });
  it('lets a person change their mind only when that is the choice, still one vote each', () => {
    const v = open();
    vote(v, 1, 'ann', LATEST);
    expect(vote(v, 2, 'ann', LATEST)).toBe('changed');
    expect(v.view().counts).toEqual([0, 1, 0]);
    expect(vote(v, 2, 'ann', LATEST)).toBe('again');
    expect(v.view().total).toBe(1);
    const w = open();
    vote(w, 1, 'ann', FIRST);
    expect(vote(w, 2, 'ann', FIRST)).toBe('again');
    expect(w.view().counts).toEqual([1, 0, 0]);
  });
  it('turns away new voters past the cap, but lets those already in change their mind', () => {
    const v = open();
    for (let i = 0; i < MAX_VOTERS; i++) v.cast({ option: 0, mark: `m${i}` }, LATEST);
    expect(vote(v, 1, 'late')).toBe('full');
    expect(v.cast({ option: 1, mark: 'm0' }, LATEST)).toBe('changed');
  });
  it('turns everything away once it has ended', () => {
    const v = open();
    vote(v, 1, 'ann');
    v.end(2000);
    expect(vote(v, 1, 'bob')).toBe('closed');
    expect(v.view().counts).toEqual([1, 0, 0]);
    expect(v.view().status).toBe('ended');
    expect(v.view().endedAt).toBe(2000);
  });
  it('a vote prepared before the end cannot be counted after it', () => {
    const v = open();
    const p = v.prepare(1, 'ann', FIRST);
    v.end(2000);
    expect(typeof p).toBe('object');
    expect(v.cast(p as never, FIRST)).toBe('closed');
    expect(v.view().total).toBe(0);
  });
});

describe('the outcome', () => {
  it('has a winner, a tie or nothing, and never breaks a tie by itself', () => {
    expect(outcomeOf([0, 0, 0])).toEqual({ kind: 'none' });
    expect(outcomeOf([3, 5, 1])).toEqual({ kind: 'winner', index: 1 });
    expect(outcomeOf([4, 4, 1])).toEqual({ kind: 'tie', indices: [0, 1] });
    expect(outcomeOf([2, 2, 2])).toEqual({ kind: 'tie', indices: [0, 1, 2] });
  });
  it('percentages always add up to 100', () => {
    expect(percents([0, 0])).toEqual([0, 0]);
    expect(percents([1, 1, 1])).toEqual([34, 33, 33]);
    for (const c of [[1, 2, 4], [7, 7, 7, 7, 7, 7], [100, 1], [3]]) expect(percents(c).reduce((a, b) => a + b, 0), c.join()).toBe(100);
  });
});

describe('nothing that identifies a voter is kept', () => {
  const IDS = ['12345678', 'streamer_fan_99', 'Ann Lee'];
  it('while it runs, only salted marks are held: no id, not even as part of a mark', () => {
    const v = open();
    IDS.forEach((id) => vote(v, 1, id));
    const held = v._held();
    expect(held.marks).toHaveLength(3);
    for (const m of held.marks) for (const id of IDS) expect(m.includes(id) || m === id).toBe(false);
    // Nothing the screen may see carries a mark or an id either.
    const seen = JSON.stringify(v.view());
    for (const id of IDS) expect(seen).not.toContain(id);
    for (const m of held.marks) expect(seen).not.toContain(m);
  });
  it('the same person gets a different mark in the next vote', () => {
    const a = open(undefined, null, 1);
    const b = open(undefined, null, 2);
    vote(a, 1, '12345678');
    vote(b, 1, '12345678');
    expect(a._held().marks[0]).not.toBe(b._held().marks[0]);
  });
  it('when it ends, the salt and every mark are gone', () => {
    const v = open();
    IDS.forEach((id) => vote(v, 1, id));
    v.end(5000);
    const held = v._held();
    expect(held.salt).toBeNull();
    expect(held.marks).toEqual([]);
    expect(JSON.stringify(v.view())).toBe(JSON.stringify({ ...v.view() }));
  });
  it('the salt is wiped, not just let go', () => {
    const s = salt(9);
    const v = createVote({ question: 'Q', options: ['a', 'b'], seconds: null }, { now: () => 0, salt: () => s });
    vote(v, 1, 'ann');
    v.end(1);
    expect([...s].every((b) => b === 0)).toBe(true);
  });
});
