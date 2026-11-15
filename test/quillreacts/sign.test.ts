// The words chat sends for a sign: cut short, stripped to plain text, and nothing else of the request read.
import { describe, expect, it } from 'vitest';
import { cleanSign, SIGN_MAX } from '../../src/quillreacts/sign';

describe('cleaning a sign', () => {
  it('keeps plain words, from a string or a { text } body', () => {
    expect(cleanSign('Go Quill go!')).toEqual({ text: 'Go Quill go!' });
    expect(cleanSign({ text: '  nice   drawing\n\there ' })).toEqual({ text: 'nice drawing here' });
    expect(cleanSign("It's lovely: 10/10 (really)")).toEqual({ text: "It's lovely: 10/10 (really)" });
    expect(cleanSign('Bonjour, ça va très bien')).toEqual({ text: 'Bonjour, ça va très bien' });
  });

  it('cuts the length hard, by whole characters', () => {
    expect(cleanSign('x'.repeat(5000))!.text.length).toBeLessThanOrEqual(SIGN_MAX);
    expect(cleanSign('word '.repeat(200))!.text.length).toBeLessThanOrEqual(SIGN_MAX);
    const long = cleanSign('\u{20BB7}'.repeat(200) + ' a');
    expect(long === null || Array.from(long.text).length <= SIGN_MAX).toBe(true);
    expect(SIGN_MAX).toBeLessThanOrEqual(80);
  });

  it('drops markup, brackets, emoji, symbols, control, zero-width and text-direction characters', () => {
    expect(cleanSign('<b>hi</b> there')).toEqual({ text: 'bhi/b there' });
    expect(cleanSign('<script>alert(1)</script>')!.text).not.toMatch(/[<>]/);
    expect(cleanSign('hi {name} [x] `y` \\ | ^')).toEqual({ text: 'hi name x y' });
    expect(cleanSign('great \u{1F600}\u{1F525} job')).toEqual({ text: 'great job' });
    expect(cleanSign('a​b‮c⁦d\u0007e\u0000f')).toEqual({ text: 'abcdef' });
    // Stacked accents (the "zalgo" look) fall away, the letters stay.
    expect(cleanSign('h́̂̃̄̅i')!.text).toBe('hi');
  });

  it('drops web addresses and @names', () => {
    expect(cleanSign('look at https://evil.example/x?y=1 now')).toEqual({ text: 'look at now' });
    expect(cleanSign('see www.evil.com please')).toEqual({ text: 'see please' });
    expect(cleanSign('visit cheap-stuff.com/free now')).toEqual({ text: 'visit now' });
    expect(cleanSign('hey @someviewer nice one')).toEqual({ text: 'hey nice one' });
  });

  it('squashes a character repeated over and over', () => {
    expect(cleanSign('woooooooooooow')).toEqual({ text: 'wooow' });
    expect(cleanSign('!!!!!!!! hi')).toEqual({ text: '!!! hi' });
  });

  it('refuses what is empty, only punctuation, or the wrong shape', () => {
    for (const bad of [null, undefined, 5, true, {}, { text: 5 }, { text: '' }, { text: '   ' }, [], ['hi'], '!!!', '\u{1F600}', '<>', 'https://example.com']) expect(cleanSign(bad)).toBeNull();
  });

  it('reads only the text: a sender in the body is never looked at or kept', () => {
    const out = cleanSign({ text: 'hello', user: 'SomeViewer', userId: 42, display_name: 'Someone' });
    expect(out).toEqual({ text: 'hello' });
    expect(JSON.stringify(out)).not.toMatch(/SomeViewer|Someone|42/);
  });
});
