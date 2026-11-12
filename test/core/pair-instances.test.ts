import { describe, expect, it } from 'vitest';
import type { InstanceShape } from '../../src/core/format';
import { pairInstances } from '../../src/core/symbols';

const inst = (id: string, symbolId: string): InstanceShape => ({
  id, type: 'instance', symbolId, opacity: 1, play: 'loop', firstFrame: 0,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
});

// How instances were paired before it was one pass: the same symbol in the same order, else the same position.
function plain(from: InstanceShape[], to: InstanceShape[]): (InstanceShape | undefined)[] {
  const used = new Set<InstanceShape>();
  return from.map((a, i) => {
    const sameSym = from.slice(0, i).filter((x) => x.symbolId === a.symbolId).length;
    const cand = to.filter((x) => x.symbolId === a.symbolId)[sameSym];
    const pick = cand && !used.has(cand) ? cand : to[i] && !used.has(to[i]) ? to[i] : undefined;
    if (pick) used.add(pick);
    return pick;
  });
}

describe('pairInstances', () => {
  it('pairs the same symbol in the same order', () => {
    const from = [inst('a', 'x'), inst('b', 'y'), inst('c', 'x')];
    const to = [inst('d', 'x'), inst('e', 'x'), inst('f', 'y')];
    expect(pairInstances(from, to).map((p) => p?.id)).toEqual(['d', 'f', 'e']);
  });

  it('matches the plain version on shuffled lists of different lengths and symbols', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) % n;
    for (let t = 0; t < 200; t++) {
      const mk = (n: number, p: string) => Array.from({ length: n }, (_, i) => inst(p + i, 's' + rnd(4)));
      const from = mk(rnd(9), 'a');
      const to = mk(rnd(9), 'b');
      expect(pairInstances(from, to)).toEqual(plain(from, to));
    }
  });
});
