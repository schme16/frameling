import { describe, expect, it } from 'vitest';
import { alignLine, blendAligned } from '../../src/lipsync/align';
import { lineMouths, wordMouths } from '../../src/lipsync/text';
import type { Mouth } from '../../src/lipsync/chart';

describe('wordMouths', () => {
  it('reads common spellings roughly right', () => {
    expect(wordMouths('Bob')).toEqual(['MBP', 'O', 'MBP']);
    expect(wordMouths('moon')).toEqual(['MBP', 'U', 'etc']);
    expect(wordMouths('shell')).toEqual(['etc', 'E', 'L']);
    expect(wordMouths('five')).toEqual(['FV', 'A', 'FV']);
    expect(wordMouths('the')).toEqual(['L', 'E']);
  });
  it('makes doubled consonants one sound and ignores a silent e', () => {
    expect(wordMouths('happy').filter((m) => m === 'MBP')).toHaveLength(1);
    expect(wordMouths('name')).toEqual(['etc', 'E', 'MBP']);
  });
  it('skips anything that is not a letter', () => {
    expect(wordMouths('42!')).toEqual([]);
  });
});

describe('lineMouths', () => {
  it('marks the start of every word', () => {
    const l = lineMouths("Hi, it's me.");
    expect(l.filter((e) => e.word)).toHaveLength(3);
    expect(l[0].word).toBe(true);
  });
  it('is empty for no words', () => {
    expect(lineMouths('  ... 123 ')).toEqual([]);
  });
});

describe('alignLine', () => {
  const classes: Mouth[] = ['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc'];
  const hot = (m: Mouth) => Float32Array.from(classes, (c) => (c === m ? 0.9 : 0.1 / 9));
  // 20 steps of rest, 30 of A, 12 of MBP, 30 of E, 20 of rest.
  const odds = [...Array(20).fill('rest'), ...Array(30).fill('A'), ...Array(12).fill('MBP'), ...Array(30).fill('E'), ...Array(20).fill('rest')].map((m) => hot(m as Mouth));

  it('finds where each expected sound sits', () => {
    const got = alignLine(odds, classes, [{ mouth: 'A', word: true }, { mouth: 'MBP', word: false }, { mouth: 'E', word: false }])!;
    expect(got).toHaveLength(odds.length);
    expect(got.slice(0, 18).every((m) => m === 'rest')).toBe(true);
    expect(got.slice(24, 46).includes('A')).toBe(true);
    expect(got.slice(52, 60)).toContain('MBP');
    expect(got.slice(70, 90)).toContain('E');
    expect(got.slice(-15).every((m) => m === 'rest')).toBe(true);
  });
  it('returns null with nothing to line up', () => {
    expect(alignLine(odds, classes, [])).toBeNull();
    expect(alignLine([], classes, [{ mouth: 'A', word: true }])).toBeNull();
  });
  it('blends the line into the odds', () => {
    const b = blendAligned([hot('A')], classes, ['E'], 0.5)[0];
    expect(b[classes.indexOf('E')]).toBeGreaterThan(0.45);
    expect(b.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });
});
