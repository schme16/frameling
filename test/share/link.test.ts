import { describe, expect, it } from 'vitest';
import { formatCode, makeCode } from '../../src/share/code';
import { codeFromArgs, codeFromLink, codeFromPaste, looksLikeLink, reviewLink } from '../../src/share/link';
import { WORDS } from '../../src/share/wordlist';

const code = formatCode(makeCode());
const w = WORDS.slice(10, 14).join('-');

describe('a review link', () => {
  it('round-trips a code', () => {
    expect(codeFromLink(reviewLink(code))).toBe(code);
    expect(reviewLink(w)).toBe(`frameling://review?code=${w}`);
  });

  it('reads the usual spellings of the same link', () => {
    expect(codeFromLink(`frameling://review/?code=${w}`)).toBe(w);
    expect(codeFromLink(`FRAMELING://Review?code=${w.toUpperCase()}`)).toBe(w);
    expect(codeFromLink(`  frameling://review?code=${w}  `)).toBe(w);
    expect(codeFromLink(`frameling://review?code=${w}&utm=chat#top`)).toBe(w);
  });

  it('refuses anything that is not a plain review link', () => {
    expect(codeFromLink('')).toBeNull();
    expect(codeFromLink('not a link')).toBeNull();
    expect(codeFromLink(`https://review?code=${w}`)).toBeNull();
    expect(codeFromLink(`frameling://open?code=${w}`)).toBeNull();
    expect(codeFromLink(`frameling://open?path=/x/a.frameling`)).toBeNull();
    expect(codeFromLink(`frameling://review`)).toBeNull();
    expect(codeFromLink(`frameling://review?code=`)).toBeNull();
    expect(codeFromLink(`frameling://review/deep/path?code=${w}`)).toBeNull();
    expect(codeFromLink(`frameling://me:pw@review?code=${w}`)).toBeNull();
    expect(codeFromLink(`frameling://review:80?code=${w}`)).toBeNull();
    expect(codeFromLink(`frameling://evil.example/review?code=${w}`)).toBeNull();
  });

  it('refuses a code that is not four of our words, in one piece', () => {
    expect(codeFromLink(`frameling://review?code=${WORDS.slice(0, 3).join('-')}`)).toBeNull();
    expect(codeFromLink(`frameling://review?code=${WORDS.slice(0, 5).join('-')}`)).toBeNull();
    expect(codeFromLink(`frameling://review?code=${WORDS[0]}-${WORDS[1]}-${WORDS[2]}-notaword`)).toBeNull();
    // Spaces and other separators are fine for somebody typing, not for a link a program made.
    expect(codeFromLink(`frameling://review?code=${WORDS.slice(0, 4).join('+')}`)).toBeNull();
    expect(codeFromLink(`frameling://review?code=${WORDS.slice(0, 4).join('%20')}`)).toBeNull();
    expect(codeFromLink(`frameling://review?code=${w}--`)).toBeNull();
  });

  it('refuses two codes, so a link cannot say one thing to a person and another to the app', () => {
    expect(codeFromLink(`frameling://review?code=${w}&code=${WORDS.slice(20, 24).join('-')}`)).toBeNull();
  });

  it('refuses a very long link', () => {
    expect(codeFromLink(`frameling://review?code=${w}&x=${'a'.repeat(500)}`)).toBeNull();
  });

  it('finds the link among command line arguments, and skips the rest', () => {
    expect(codeFromArgs(['/usr/bin/frameling', '--flag', `frameling://review?code=${w}`])).toBe(w);
    expect(codeFromArgs(['x', 'frameling://open?path=/a.frameling'])).toBeNull();
    expect(codeFromArgs([])).toBeNull();
  });

  it('is told apart from an ordinary paste', () => {
    expect(looksLikeLink(` frameling://review?code=${w}`)).toBe(true);
    expect(looksLikeLink(w)).toBe(false);
    expect(codeFromPaste(w)).toBe(w);
    expect(codeFromPaste(`frameling://review?code=${w}`)).toBe(w);
    expect(codeFromPaste('frameling://open?path=/x')).toBe('');
  });
});
