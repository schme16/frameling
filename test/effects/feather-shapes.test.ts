// Feathering picked shapes is the Soften effect on each, set to the amount; one that already has it is set, not doubled.
import { describe, expect, it } from 'vitest';
import { softenHolders, type Holder } from '../../src/effects/edit';

describe('feather on shapes', () => {
  it('gives each shape a Soften effect of that size', () => {
    const hs: Holder[] = [{}, {}];
    expect(softenHolders(hs, 6)).toBe(2);
    for (const h of hs) {
      expect(h.effects).toHaveLength(1);
      expect(h.effects![0].kind).toBe('blur');
      expect(h.effects![0].values.radius).toBe(6);
    }
  });

  it('sets the Soften a shape already has, turns it on and leaves other effects alone', () => {
    const h: Holder = {
      effects: [
        { id: 'a', kind: 'glow', values: { size: 3 } },
        { id: 'b', kind: 'blur', values: { radius: 2 }, on: false },
      ],
    };
    softenHolders([h], 9);
    expect(h.effects).toHaveLength(2);
    expect(h.effects![1].values.radius).toBe(9);
    expect(h.effects![1].on).toBe(true);
    expect(h.effects![0].values.size).toBe(3);
  });
});
