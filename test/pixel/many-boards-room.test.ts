import { describe, expect, it } from 'vitest';
import { layoutFor } from '../../src/pixel/wayOps';
import { newSpriteDoc } from '../../src/pixel/way';

describe('a long list of boards gets more of the right side', () => {
  const withBoards = (n: number) => {
    const doc = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    doc.artboards = Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Frame ${i + 1}`, x: i * 40, y: 0 }));
    return doc;
  };
  it('asks for nothing special with a few boards', () => {
    expect(layoutFor(withBoards(4)).topShare).toBeUndefined();
  });
  it('gives the Artboards panel a bigger share once there are more than six', () => {
    expect(layoutFor(withBoards(6)).topShare).toBeUndefined();
    const fit = layoutFor(withBoards(7));
    expect(fit.stack).toEqual(['artboards', 'preview']);
    expect(fit.topShare).toBeGreaterThan(0.4);
    expect(fit.topShare).toBeLessThan(0.6);
  });
});
