// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanLabels } from '../../src/lipsync/NameFrames';
import { shortLabel } from '../../src/lipsync/LipSyncPanel';

describe('frame names', () => {
  it('trims names, drops trailing blanks and returns nothing when all are empty', () => {
    expect(cleanLabels([' Rest ', 'A', '', 'E', '', ''])).toEqual(['Rest', 'A', '', 'E']);
    expect(cleanLabels(['', ' '])).toBeUndefined();
  });
  it('shortens labels for the strip', () => {
    expect(shortLabel('M B P')).toBe('MBP');
    expect(shortLabel('Rest')).toBe('Res');
    expect(shortLabel('A I')).toBe('AI');
  });
});
