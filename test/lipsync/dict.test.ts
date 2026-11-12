import { describe, expect, it } from 'vitest';
import { expectedFromText, loadDictionary } from '../../src/lipsync/dict';
import { wordMouths } from '../../src/lipsync/text';
import { lineExpected, numberWords, packDictionary, parseDictionary, pronounceCodes, spokenWords, wordPronunciation } from '../../src/lipsync/words';
import type { Mouth } from '../../src/lipsync/chart';

describe('pronunciation data', () => {
  it('packs and reads back, shared prefixes and all', () => {
    const entries: [string, string][] = [['cat', 'XAX'], ['cart', 'XAX'], ['carton', 'XAXOX'], ['dog', 'XOX']];
    const dict = parseDictionary(packDictionary(entries));
    expect([...dict.entries()].sort()).toEqual([...entries].sort());
  });
  it('loads the shipped list on demand, once', async () => {
    const a = await loadDictionary();
    expect(a.size).toBeGreaterThan(20000);
    expect(await loadDictionary()).toBe(a);
  });
  it('works out what a line says', async () => {
    const e = await expectedFromText('Hello, Bob!');
    expect(e.map((x) => x.mouth)).toEqual(['etc', 'A', 'L', 'O', 'MBP', 'A', 'MBP']);
    expect(e.filter((x) => x.word)).toHaveLength(2);
  });
  it('knows words the spelling guide gets wrong', async () => {
    const dict = await loadDictionary();
    const said = (w: string) => wordPronunciation(w, dict);
    // "though" and "through" are not said as they are spelt.
    expect(said('through')).toEqual(['L', 'etc', 'U']);
    expect(said('hello')).toEqual(['etc', 'A', 'L', 'O']);
    expect(said('bob')).toEqual(['MBP', 'A', 'MBP']);
    expect(wordMouths('through')).not.toEqual(said('through'));
  });
  it('is never worse than a squashed guess: every listed word keeps its mouths', async () => {
    const dict = await loadDictionary();
    for (const w of ['maybe', 'beautiful', 'people', 'would', 'knight']) {
      expect(pronounceCodes(w, dict).length).toBeGreaterThan(0);
    }
  });
});

describe('unknown words, endings and contractions', () => {
  const dict = parseDictionary(packDictionary([['walk', 'WOX'], ['make', 'MEX'], ['run', 'XAX'], ['box', 'MAX'], ['dont', 'XOX'], ['do', 'XU']]));
  it('builds a word from a listed one and a common ending', () => {
    expect(pronounceCodes('walking', dict)).toBe('WOXEX');
    expect(pronounceCodes('making', dict)).toBe('MEXEX');
    expect(pronounceCodes('running', dict)).toBe('XAXEX');
    expect(pronounceCodes('boxes', dict)).toBe('MAXEX');
    expect(pronounceCodes('walked', dict)).toBe('WOX');
  });
  it('falls back to the spelling guide for an unknown word', () => {
    const guide = wordMouths('zzub');
    expect(wordPronunciation('zzub', dict)).toEqual(guide);
    expect(wordPronunciation('zzub')).toEqual(guide);
  });
  it('reads a typed line, numbers and all', () => {
    expect(lineExpected('I have 3 cats', dict).filter((e) => e.word)).toHaveLength(4);
    expect(lineExpected('  ... !? ', dict)).toEqual([]);
  });
  it('reads contractions', () => {
    expect(pronounceCodes("don't", dict)).toBe('XOX');
    expect(pronounceCodes("can't", dict)).toBe('XAX');
    expect(pronounceCodes("i'm", dict)).toBe('AM');
    expect(pronounceCodes("walk's", dict)).toBe('WOX');
    expect(pronounceCodes("didn't", dict).endsWith('AX')).toBe(true);
    expect(pronounceCodes("they’re", dict)).toBe('LEX');
  });
  it('counts words in a contraction as one', () => {
    expect(lineExpected("I'm sure it's fine", dict).filter((e) => e.word)).toHaveLength(4);
  });
});

describe('numbers', () => {
  it('reads whole numbers', () => {
    expect(numberWords('0')).toEqual(['zero']);
    expect(numberWords('7')).toEqual(['seven']);
    expect(numberWords('42')).toEqual(['forty', 'two']);
    expect(numberWords('100')).toEqual(['one', 'hundred']);
    expect(numberWords('1000')).toEqual(['one', 'thousand']);
    expect(numberWords('12345')).toEqual(['twelve', 'thousand', 'three', 'hundred', 'forty', 'five']);
    expect(numberWords('2500000')).toEqual(['two', 'million', 'five', 'hundred', 'thousand']);
  });
  it('reads years the way people say them', () => {
    expect(numberWords('1999')).toEqual(['nineteen', 'ninety', 'nine']);
    expect(numberWords('1905')).toEqual(['nineteen', 'oh', 'five']);
    expect(numberWords('2024')).toEqual(['twenty', 'twenty', 'four']);
  });
  it('reads digit by digit when it starts with zero or is huge', () => {
    expect(numberWords('007')).toEqual(['zero', 'zero', 'seven']);
    expect(numberWords('1234567890123')).toHaveLength(13);
  });
  it('reads ordinals, decimals and commas', () => {
    expect(spokenWords('3rd')).toEqual(['third']);
    expect(spokenWords('21st')).toEqual(['twenty', 'first']);
    expect(spokenWords('40th')).toEqual(['fortieth']);
    expect(spokenWords('3.5')).toEqual(['three', 'point', 'five']);
    expect(spokenWords('1,000')).toEqual(['one', 'thousand']);
    expect(spokenWords('Hello')).toEqual(['hello']);
  });
  it('turns a typed number into mouths that start each word', () => {
    const l = lineExpected('42', parseDictionary(''));
    const starts = l.map((e) => e.mouth as Mouth);
    expect(starts.length).toBeGreaterThan(4);
    expect(l.filter((e) => e.word)).toHaveLength(2);
  });
});
