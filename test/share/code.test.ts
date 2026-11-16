import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BITS_PER_WORD, MAX_WRONG, MEET_WORDS, SECRET_BITS, SECRET_WORDS, formatCode, isCodeWord, makeCode, maskedCode, parseCode } from '../../src/share/code';
import { secretToW, topicFor } from '../../src/share/derive';
import { ORDER } from '../../src/share/spake2';
import { WORDS } from '../../src/share/wordlist';

describe('the word list', () => {
  it('has no repeats, only plain lower case letters, and enough words to be worth it', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,7}$/);
    expect(BITS_PER_WORD).toBeGreaterThan(10.5);
  });

  it('keeps every word apart from the rest by its first four letters', () => {
    const heads = WORDS.map((w) => w.slice(0, 4));
    expect(new Set(heads).size).toBe(WORDS.length);
  });

  it('is gentle: none of the harsh words came through', () => {
    for (const w of ['kill', 'bomb', 'death', 'gun', 'hate', 'war', 'weapon', 'abuse']) expect(isCodeWord(w)).toBe(false);
  });
});

describe('making a code', () => {
  it('is four words, two to meet and two secret', () => {
    const c = makeCode();
    expect(c.meet).toHaveLength(MEET_WORDS);
    expect(c.secret).toHaveLength(SECRET_WORDS);
    expect(formatCode(c).split('-')).toHaveLength(MEET_WORDS + SECRET_WORDS);
    for (const w of [...c.meet, ...c.secret]) expect(isCodeWord(w)).toBe(true);
  });

  it('puts the secret at about 21 bits and lets only a handful of wrong tries through', () => {
    expect(SECRET_BITS).toBeGreaterThan(21);
    expect(MAX_WRONG).toBe(3);
    // The chance one guesser gets one code: tries over the number of secrets.
    expect(MAX_WRONG / 2 ** SECRET_BITS).toBeLessThan(1 / 1_000_000);
  });

  it('does not lean towards some words (every word turns up, none far out of line)', () => {
    const counts = new Map<string, number>();
    const n = WORDS.length * 40;
    for (let i = 0; i < n / 2; i++) for (const w of makeCode().meet) counts.set(w, (counts.get(w) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(WORDS.length * 0.99);
    expect(Math.max(...counts.values())).toBeLessThan(40 * 2.2);
  });

  it('is repeatable from a fixed random source, and picks only inside the list', () => {
    const fixed = (n: number) => new Uint8Array(n).fill(0xff);
    // 0xffffffff is past the biggest even block, so it asks again; give it something it can use after.
    let calls = 0;
    const c = makeCode((n) => (calls++ % 2 === 0 ? fixed(n) : new Uint8Array(n)));
    expect(c.meet.every((w) => WORDS.includes(w))).toBe(true);
    expect(c.meet[0]).toBe(WORDS[0]);
  });
});

describe('reading a code somebody typed', () => {
  const code = 'river-lantern-copper-owl';
  const words = ['sing', 'wolf', 'young', 'wood'];

  it('accepts the usual ways of writing it', () => {
    const w = words.join('-');
    for (const text of [w, words.join(' '), w.toUpperCase(), `  ${words.join(',  ')}  `, words.join('.'), words.join('_'), words.join('\n')]) {
      const r = parseCode(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(formatCode(r.code)).toBe(w);
    }
  });

  it('says what is wrong in a way the page can show', () => {
    expect(parseCode('')).toEqual({ ok: false, why: 'empty' });
    expect(parseCode('sing wolf')).toEqual({ ok: false, why: 'short' });
    expect(parseCode('sing wolf young wood wink')).toEqual({ ok: false, why: 'long' });
    // "lantern" is not on the list, and the page is told which word.
    expect(parseCode(code)).toEqual({ ok: false, why: 'unknown', word: expect.any(String) });
  });

  it('splits the first two words from the last two', () => {
    const r = parseCode(words.join(' '));
    expect(r.ok && r.code.meet).toEqual(['sing', 'wolf']);
    expect(r.ok && r.code.secret).toEqual(['young', 'wood']);
  });

  it('can be shown with the secret part hidden', () => {
    const c = makeCode();
    const shown = maskedCode(c);
    for (const w of c.secret) expect(shown).not.toContain(w);
    for (const w of c.meet) expect(shown).toContain(w);
  });
});

describe('what a code turns into', () => {
  const a = { meet: ['sing', 'wolf'], secret: ['young', 'wood'] };

  it('meets on a topic made from the first two words alone', () => {
    const topic = topicFor(a);
    expect(topic).toHaveLength(32);
    const sameMeet = { meet: ['sing', 'wolf'], secret: ['wink', 'zone'] };
    const otherMeet = { meet: ['sing', 'wink'], secret: a.secret };
    expect(topicFor(sameMeet).equals(topic)).toBe(true);
    expect(topicFor(otherMeet).equals(topic)).toBe(false);
  });

  it('leaves the secret out of the topic in every form: no hash of the secret or the whole code is the topic', () => {
    const topic = topicFor(a).toString('hex');
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    for (const s of ['young-wood', 'sing-wolf-young-wood', 'young wood', 'wood']) expect(hash(s)).not.toBe(topic);
  });

  it('turns the secret words into a password number inside the group, the same every time', async () => {
    const w1 = await secretToW(a);
    const w2 = await secretToW(a);
    expect(w1).toBe(w2);
    expect(w1 > 0n && w1 < ORDER).toBe(true);
  });

  it('gives a different number for a different secret, or the same secret at a different meeting place', async () => {
    const base = await secretToW(a);
    expect(await secretToW({ ...a, secret: ['young', 'wink'] })).not.toBe(base);
    expect(await secretToW({ meet: ['sing', 'wink'], secret: a.secret })).not.toBe(base);
  });
});
