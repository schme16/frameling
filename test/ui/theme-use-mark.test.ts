// How a theme card says which of your two themes it is: day, night, both or neither, and the same in words.
import { describe, expect, it } from 'vitest';
import { USE_SAYS, splotchEdge, splotchEdgePoints, splotchFillPoints, useIcons, useKind, useSplotches } from '../../src/ui/themes/useMark';

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

  it('has a different screen reader name for each kind', () => {
    expect(new Set(Object.values(USE_SAYS)).size).toBe(4);
    for (const l of Object.values(USE_SAYS)) expect(l).not.toMatch(/\u2014/);
  });

  it('gives a card a splotch for each of its themes: day on the left, night on the right', () => {
    expect(useSplotches({ day: false, night: false })).toEqual([]);
    expect(useSplotches({ day: true, night: false })).toEqual(['day']);
    expect(useSplotches({ day: false, night: true })).toEqual(['night']);
    expect(useSplotches({ day: true, night: true })).toEqual(['day', 'night']);
  });
});

describe('the two splotches are uniform', () => {
  const day = splotchEdge('day');
  const night = splotchEdge('night');
  const box = (pts: Array<[number, number]>) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  it("are the same shape, one the other's mirror, so same size and same wobble", () => {
    expect(night).toHaveLength(day.length);
    expect(box(night)).toEqual(box(day));
    day.forEach(([x, y], i) => {
      expect(night[i][0]).toBeCloseTo(100 - x, 1);
      expect(night[i][1]).toBe(y);
    });
  });

  it('each start in their own top corner and end on the card side below it', () => {
    expect(day[0]).toEqual([100, 0]);
    expect(day[day.length - 1]).toEqual([0, 100]);
    expect(night[0]).toEqual([0, 0]);
    expect(night[night.length - 1]).toEqual([100, 100]);
  });

  it('close the yellow through their own corner', () => {
    expect(splotchFillPoints('day').endsWith(' 0,0')).toBe(true);
    expect(splotchFillPoints('night').endsWith(' 100,0')).toBe(true);
    expect(splotchFillPoints('day').startsWith(splotchEdgePoints('day'))).toBe(true);
  });
});
