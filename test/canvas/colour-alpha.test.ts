// The see-through (alpha) part of colours: reading, writing and keeping six-digit colours exactly as they were.
import { describe, expect, it } from 'vitest';
import { alphaByte, alphaPercent, hasAlpha, parseHex, readColourText, solidOf, toHex, withAlpha, withAlphaPercent } from '../../src/canvas/colors';

describe('reading colours with and without alpha', () => {
  it('reads three, four, six and eight digits', () => {
    expect(parseHex('#fa0')).toEqual([255, 170, 0, 255]);
    expect(parseHex('#fa08')).toEqual([255, 170, 0, 136]);
    expect(parseHex('#ffaa00')).toEqual([255, 170, 0, 255]);
    expect(parseHex('#ffaa0080')).toEqual([255, 170, 0, 128]);
    expect(parseHex('#ffaa0')).toBeNull();
    expect(parseHex('#ffaa00800')).toBeNull();
  });

  it('a six digit colour is fully solid', () => {
    expect(alphaByte('#336699')).toBe(255);
    expect(hasAlpha('#336699')).toBe(false);
    expect(alphaPercent('#336699')).toBe(100);
  });

  it('reads how solid an eight digit colour is', () => {
    expect(alphaByte('#33669980')).toBe(128);
    expect(alphaPercent('#33669980')).toBe(50);
    expect(hasAlpha('#33669900')).toBe(true);
    expect(alphaPercent('#33669900')).toBe(0);
    // Unreadable text counts as solid rather than clear.
    expect(alphaByte('red')).toBe(255);
  });
});

describe('writing colours with alpha', () => {
  it('a solid colour is written as six digits, so old colours write back unchanged', () => {
    expect(withAlpha('#336699', 255)).toBe('#336699');
    expect(withAlpha('#33669980', 255)).toBe('#336699');
    expect(withAlphaPercent('#33669933', 100)).toBe('#336699');
    for (const c of ['#000000', '#ffffff', '#1d1b26', '#ffd76a']) expect(toHex(...(parseHex(c) as [number, number, number, number]))).toBe(c);
  });

  it('a see-through colour keeps its colour and gains two digits', () => {
    expect(withAlpha('#336699', 128)).toBe('#33669980');
    expect(withAlphaPercent('#336699', 50)).toBe('#33669980');
    expect(withAlphaPercent('#336699', 0)).toBe('#33669900');
    expect(withAlpha('#33669980', 64)).toBe('#33669940');
  });

  it('keeps the amount inside 0 to 100 percent', () => {
    expect(withAlphaPercent('#336699', 250)).toBe('#336699');
    expect(withAlphaPercent('#336699', -5)).toBe('#33669900');
    expect(withAlpha('#336699', -1)).toBe('#33669900');
  });

  it('whole percents survive a trip through the bytes', () => {
    for (let p = 0; p <= 100; p++) expect(alphaPercent(withAlphaPercent('#abcdef', p))).toBe(p);
  });

  it('leaves unreadable text alone', () => {
    expect(withAlpha('nope', 100)).toBe('nope');
    expect(solidOf('nope')).toBe('nope');
  });

  it('solidOf drops the see-through part', () => {
    expect(solidOf('#33669980')).toBe('#336699');
    expect(solidOf('#336699')).toBe('#336699');
    expect(solidOf('#fa08')).toBe('#ffaa00');
  });
});

describe('typed colours', () => {
  it('reads what was typed, with # or without, short or long', () => {
    expect(readColourText('ff9e6d')).toBe('#ff9e6d');
    expect(readColourText(' #FA0 ')).toBe('#ffaa00');
    expect(readColourText('#ff9e6d80')).toBe('#ff9e6d80');
    expect(readColourText('#ff9e6dff')).toBe('#ff9e6d');
  });

  it('drops the see-through part where only solid colours are taken', () => {
    expect(readColourText('#ff9e6d80', false)).toBe('#ff9e6d');
    expect(readColourText('#fa08', false)).toBe('#ffaa00');
  });

  it('is null for anything else', () => {
    expect(readColourText('')).toBeNull();
    expect(readColourText('#12')).toBeNull();
    expect(readColourText('hello')).toBeNull();
  });
});
