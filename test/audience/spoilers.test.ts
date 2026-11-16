import { describe, expect, it } from 'vitest';
import { COVER_DOTS, coversFor, holdsBack, jarIntro, JAR_COVER_NOTE, READ_IT, REVEAL_MS, setupIntro, UNREAD_TOAST, UNREAD_WAIT_MS } from '../../src/audience/spoilers';

describe('what gets covered', () => {
  it('covers unless the streamer said viewers see only the capture window', () => {
    expect(coversFor('screen')).toBe(true);
    expect(coversFor('capture')).toBe(false);
  });
  it('covers when nobody has answered, and for anything odd', () => {
    expect(coversFor(undefined)).toBe(true);
    expect(coversFor('')).toBe(true);
    expect(coversFor('strict')).toBe(true);
  });
});

describe('a toast holding words back', () => {
  it('holds back only words that are covered, while covering, until they are read', () => {
    expect(holdsBack('Read first', true, false)).toBe(true);
    expect(holdsBack('Read first', true, true)).toBe(false);
    expect(holdsBack('Read first', false, false)).toBe(false);
    expect(holdsBack(undefined, true, false)).toBe(false);
  });
  it('gives up on an unread toast after a while, and the eye lets go after a few seconds', () => {
    expect(UNREAD_WAIT_MS).toBeGreaterThan(10_000);
    expect(REVEAL_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('the words', () => {
  const all = [setupIntro(true), setupIntro(false), jarIntro(true), jarIntro(false), JAR_COVER_NOTE, READ_IT, ...Object.values(UNREAD_TOAST)];
  it('have no em dashes', () => {
    for (const w of all) expect(w).not.toContain('—');
  });
  it('stop promising a privacy that is not kept', () => {
    expect(setupIntro(true)).not.toMatch(/hidden from the moment/i);
    expect(jarIntro(true)).not.toMatch(/only you can see/i);
    expect(jarIntro(true)).not.toMatch(/nothing shows until you pull/i);
  });
  it('say why the word is plain when it is', () => {
    expect(setupIntro(false)).toContain('capture window');
    expect(jarIntro(false)).toContain('do not see');
  });
  it('a cover never carries the words, or how long they are', () => {
    expect(COVER_DOTS).toMatch(/^•+$/);
    for (const w of Object.values(UNREAD_TOAST)) expect(w).not.toMatch(/[“"]/);
  });
});
