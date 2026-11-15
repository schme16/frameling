// Where the sign-in is kept: encrypted by the computer's key store, memory only without one, never in plain text.
import { describe, expect, it } from 'vitest';
import { TwitchTokens } from '../../src/main/twitchTokens';
import type { Tokens } from '../../src/main/twitchAuth';
import { fakeSafe, memoryFile } from './fake';

const T: Tokens = { accessToken: 'ACCESS-SECRET', refreshToken: 'REFRESH-SECRET', expiresAt: 5, scopes: ['bits:read'], userId: '9', login: 'quilltest' };

describe('the token store', () => {
  it('keeps the sign-in encrypted, with neither token in the file as plain text', () => {
    const file = memoryFile();
    const s = new TwitchTokens(fakeSafe(), file);
    expect(s.set(T)).toBe(true);
    expect(file.text).toBeTruthy();
    expect(file.text).not.toContain('ACCESS-SECRET');
    expect(file.text).not.toContain('REFRESH-SECRET');
    expect(file.text).not.toContain('quilltest');
  });
  it('comes back after a restart', () => {
    const file = memoryFile();
    new TwitchTokens(fakeSafe(), file).set(T);
    expect(new TwitchTokens(fakeSafe(), file).get()).toEqual(T);
  });
  it('holds it in memory only where there is no real key store, and writes nothing', () => {
    const file = memoryFile();
    const s = new TwitchTokens(fakeSafe(false), file);
    expect(s.canSave).toBe(false);
    expect(s.set(T)).toBe(false);
    expect(file.text).toBeNull();
    expect(s.get()).toEqual(T);
    expect(new TwitchTokens(fakeSafe(false), file).get()).toBeNull();
  });
  it('holds it in memory only with no safe storage at all', () => {
    const s = new TwitchTokens(null, memoryFile());
    s.set(T);
    expect(s.get()).toEqual(T);
  });
  it('forgets everywhere', () => {
    const file = memoryFile();
    const s = new TwitchTokens(fakeSafe(), file);
    s.set(T);
    s.forget();
    expect(s.get()).toBeNull();
    expect(file.text).toBeNull();
    expect(new TwitchTokens(fakeSafe(), file).get()).toBeNull();
  });
  it('ignores a file that is damaged or from something else', () => {
    const file = memoryFile();
    file.text = '{"v":1,"sealed":"!!!"}';
    expect(new TwitchTokens(fakeSafe(), file).get()).toBeNull();
    file.text = 'not json';
    expect(new TwitchTokens(fakeSafe(), file).get()).toBeNull();
  });
});
