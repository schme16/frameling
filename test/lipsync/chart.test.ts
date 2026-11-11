import { describe, expect, it } from 'vitest';
import { CHART, frameForMouth, mouthForLabel, MOUTHS, normLabel } from '../../src/lipsync/chart';

const FULL = CHART.map((m) => m.label);

describe('mouth chart', () => {
  it('has the ten standard shapes', () => {
    expect(MOUTHS).toEqual(['rest', 'A', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'WQ', 'etc']);
  });
  it('compares names ignoring case, spaces and punctuation', () => {
    expect(normLabel('M B P')).toBe('mbp');
    expect(normLabel(' W-Q ')).toBe('wq');
  });
  it('finds every shape in a full chart', () => {
    MOUTHS.forEach((m, i) => expect(frameForMouth(FULL, m)).toBe(i));
  });
  it('matches however the frames are spelled', () => {
    const labels = ['rest', 'ai', 'e', 'o', 'u', 'MBP', 'FV', 'l', 'wq', 'ETC'];
    MOUTHS.forEach((m, i) => expect(frameForMouth(labels, m)).toBe(i));
    expect(frameForMouth(['Neutral', 'Ah', 'Ee', 'Oh', 'Oo', 'M', 'F', 'Th', 'W', 'Other'], 'MBP')).toBe(5);
    expect(frameForMouth(['Neutral', 'Ah', 'Ee', 'Oh', 'Oo', 'M', 'F', 'Th', 'W', 'Other'], 'rest')).toBe(0);
  });
  it('falls back to a close shape when one is missing', () => {
    const noWq = FULL.filter((l) => l !== 'W Q');
    expect(noWq[frameForMouth(noWq, 'WQ')]).toBe('O');
    const noWqO = FULL.filter((l) => l !== 'W Q' && l !== 'O');
    expect(noWqO[frameForMouth(noWqO, 'WQ')]).toBe('U');
    const noEtc = FULL.filter((l) => l !== 'etc');
    expect(noEtc[frameForMouth(noEtc, 'etc')]).toBe('E');
    const noMbp = FULL.filter((l) => l !== 'M B P');
    expect(noMbp[frameForMouth(noMbp, 'MBP')]).toBe('Rest');
  });
  it('uses the first frame when nothing matches, and never loops forever', () => {
    expect(frameForMouth(['x1', 'x2'], 'WQ')).toBe(0);
    expect(frameForMouth([], 'A')).toBe(0);
  });
  it('turns a frame label back into a chart shape', () => {
    expect(mouthForLabel('A I')).toBe('A');
    expect(mouthForLabel('mbp')).toBe('MBP');
    expect(mouthForLabel('Closed')).toBe('rest');
    expect(mouthForLabel('Smirk')).toBeNull();
  });
});
