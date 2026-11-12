import { describe, expect, it } from 'vitest';
import { FOLD_STEPS, chooseFold, foldedAt, foldSlack, headerChange, switchLabel } from '../../src/timeline/headerFold';

const MAX = FOLD_STEPS.length;
// Each fold level frees 40px, starting from 1000 needed.
const widthAt = (l: number) => 1000 - l * 40;

describe('fold order', () => {
  it('folds the rare ones first, then the edit group, then hold and onion, and the slider last', () => {
    expect(foldedAt(0)).toEqual([]);
    expect(foldedAt(4)).toEqual(['pingpong', 'sound', 'clean', 'fit']);
    expect(foldedAt(5)).toContain('edit');
    expect(foldedAt(5)).not.toContain('hold');
    expect(foldedAt(MAX).at(-1)).toBe('zoom');
    expect(foldedAt(99)).toHaveLength(MAX);
  });
});

describe('chooseFold', () => {
  it('folds nothing when everything fits', () => {
    expect(chooseFold(0, MAX, widthAt, 1000, foldSlack, true)).toBe(0);
  });
  it('folds only as far as needed', () => {
    expect(chooseFold(0, MAX, widthAt, 900, foldSlack, true)).toBe(3);
    expect(chooseFold(0, MAX, widthAt, 880, foldSlack, true)).toBe(3);
  });
  it('folds everything and stops when nothing fits', () => {
    expect(chooseFold(0, MAX, widthAt, 100, foldSlack, true)).toBe(MAX);
  });
  it('folds the moment the current level no longer fits', () => {
    expect(chooseFold(2, MAX, widthAt, 919, foldSlack, false)).toBe(3);
  });
  it('does not unfold until there is room to spare, so a width at a boundary does not flicker', () => {
    // Level 3 needs 880. Level 2 needs 920: it only fits with the slack, so at 925 it stays folded.
    expect(chooseFold(3, MAX, widthAt, 925, foldSlack, true)).toBe(3);
    expect(chooseFold(3, MAX, widthAt, 920 + foldSlack, foldSlack, true)).toBe(2);
    // And once back at 2, the same width keeps it there.
    expect(chooseFold(2, MAX, widthAt, 925, foldSlack, true)).toBe(2);
  });
  it('a number changing (no new room) never unfolds', () => {
    expect(chooseFold(3, MAX, widthAt, 2000, foldSlack, false)).toBe(3);
  });
});

describe('the more button name', () => {
  it('says how many folded switches are on', () => {
    expect(switchLabel(0)).toBe('More timeline buttons');
    expect(switchLabel(1)).toBe('More, 1 switch on');
    expect(switchLabel(2)).toBe('More, 2 switches on');
  });
});

describe('headerChange', () => {
  const el = { nodeType: 1 };
  const text = { nodeType: 3 };
  const rec = (type: string, added: { nodeType: number }[] = [], removed: { nodeType: number }[] = []) => ({ type, addedNodes: added, removedNodes: removed });
  it('measures when a button or chip comes or goes', () => {
    expect(headerChange([rec('childList', [el])], false)).toBe('structure');
    expect(headerChange([rec('characterData'), rec('childList', [], [el])], false)).toBe('structure');
  });
  it('a number changing in place needs no measuring unless the text got longer', () => {
    // React swaps a counter's text node (a childList record with text nodes only), or edits it in place.
    expect(headerChange([rec('childList', [text], [text])], false)).toBe('none');
    expect(headerChange([rec('characterData')], false)).toBe('none');
    expect(headerChange([rec('characterData')], true)).toBe('grow');
  });
  it('a structure change wins over text growth', () => {
    expect(headerChange([rec('characterData'), rec('childList', [el])], true)).toBe('structure');
  });
});
