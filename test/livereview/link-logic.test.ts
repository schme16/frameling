import { describe, expect, it } from 'vitest';
import { GUARD_MS, joinReady, linkVerdict, textToCopy } from '../../src/livereview/linkLogic';
import { codeFromLink } from '../../src/share/link';
import { WORDS } from '../../src/share/wordlist';
import { coverReviewers } from '../../src/livereview/cover';

const code = WORDS.slice(30, 34).join('-');

describe('what Copy the link copies', () => {
  it('is the bare link, or a message that has the link and the four words in it', () => {
    expect(textToCopy(code, 'link')).toBe(`frameling://review?code=${code}`);
    const m = textToCopy(code, 'message');
    expect(m).toContain(`frameling://review?code=${code}`);
    expect(m.split(`frameling://review?code=${code}`)).toHaveLength(2);
    expect(m.endsWith(code)).toBe(true);
    expect(m).not.toContain('—');
  });

  it('puts a link in the message that the app reads back as the same code', () => {
    const link = /frameling:\/\/\S+/.exec(textToCopy(code, 'message'))![0];
    expect(codeFromLink(link)).toBe(code);
  });
});

describe('when an arriving link may be joined', () => {
  it('waits a moment before Join can be pressed', () => {
    expect(joinReady(1000, 1000)).toBe(false);
    expect(joinReady(1000, 1000 + GUARD_MS - 1)).toBe(false);
    expect(joinReady(1000, 1000 + GUARD_MS)).toBe(true);
  });

  it('asks, except for your own review, or while a question is already up', () => {
    expect(linkVerdict(code, '', false)).toBe('ask');
    expect(linkVerdict(code, 'other-code-here-now', false)).toBe('ask');
    expect(linkVerdict(code, code, false)).toBe('yours');
    expect(linkVerdict(code, '', true)).toBe('busy');
    expect(linkVerdict(code, code, true)).toBe('busy');
  });
});

describe('the code in a link is covered like any other while you stream', () => {
  it('is covered when streaming, unless your viewers see only the capture window', () => {
    const on = { streamSafe: false, audienceOn: true, obsOnAir: false };
    expect(coverReviewers(on, undefined)).toBe(true);
    expect(coverReviewers(on, 'screen')).toBe(true);
    expect(coverReviewers(on, 'capture')).toBe(false);
    expect(coverReviewers({ streamSafe: false, audienceOn: false, obsOnAir: false }, 'screen')).toBe(false);
  });
});
