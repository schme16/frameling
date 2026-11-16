// How a theme card says which of your two themes it is: day, night, both or neither, and the same in words.
import { describe, expect, it } from 'vitest';
import { DEFAULT_USE_STYLE, USE_SAYS, USE_WORDS, useIcons, useKind } from '../../src/ui/themes/useMark';

describe('which of your two themes a card is', () => {
  it('tells all four apart', () => {
    expect(useKind({ day: false, night: false })).toBe('none');
    expect(useKind({ day: true, night: false })).toBe('day');
    expect(useKind({ day: false, night: true })).toBe('night');
    expect(useKind({ day: true, night: true })).toBe('both');
  });

  it('shows the sun for day, the moon for night, and both in that order for both', () => {
    expect(useIcons({ day: false, night: false })).toEqual([]);
    expect(useIcons({ day: true, night: false })).toEqual(['sun']);
    expect(useIcons({ day: false, night: true })).toEqual(['moon']);
    expect(useIcons({ day: true, night: true })).toEqual(['sun', 'moon']);
  });

  it('has a different line for each kind, and none for a card that is not in use', () => {
    expect(USE_WORDS.none).toBe('');
    const lines = [USE_WORDS.day, USE_WORDS.night, USE_WORDS.both];
    expect(new Set(lines).size).toBe(3);
    for (const l of lines) expect(l).not.toMatch(/—/);
    expect(new Set(Object.values(USE_SAYS)).size).toBe(4);
  });

  it('ships the line under the name, which covers none of the picture', () => {
    expect(DEFAULT_USE_STYLE).toBe('words');
  });
});
