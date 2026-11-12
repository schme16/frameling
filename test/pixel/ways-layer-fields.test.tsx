// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { resetStore, store } from '../../src/core/store';
import { newSpriteDoc } from '../../src/pixel/way';
import { changeWay } from '../../src/pixel/wayOps';
import { artboardsOf } from '../../src/artboards/model';
it('frames to boards keeps the effects of a layer', () => {
  const doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
  (doc.layers[0] as any).effects = [{ id: 'e1', kind: 'blur', on: true, params: { radius: 2 } }];
  resetStore(doc);
  const r = changeWay('boards', false);
  expect(r.ok).toBe(true);
  expect(artboardsOf(store().get().doc).length).toBeGreaterThan(1);
});
it('boards back to frames with a layer that has effects', () => {
  const doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
  (doc.layers[0] as any).effects = [{ id: 'e1', kind: 'blur', on: true, params: { radius: 2 } }];
  resetStore(doc);
  expect(changeWay('boards', false).ok).toBe(true);
  const r = changeWay('animation', false);
  expect(r.ok).toBe(true);
  expect(store().get().doc.layers[0].effects?.length).toBe(1);
  expect(store().get().doc.layers[0].cels.length).toBeGreaterThan(1);
});
