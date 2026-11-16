// A saved menu change can name a submenu that a later Frameling no longer has. The Layers and artboards reshape took
// away sub:masks and sub:pairs, and anybody who had reordered those carries their names in their saved settings. This
// holds the promise that it opens quietly: the change is ignored, nothing throws, and no menu goes missing with it.
import { describe, expect, it } from 'vitest';
import { shapeMenus, type MenuEdits } from '../../src/ui/menuEdits';
import { MENUS, SUBMENUS } from '../../src/ui/menus';

const stale: MenuEdits = {
  v: 1,
  lists: {
    'sub:masks': { items: ['layers.mask'], seen: ['layers.mask'] },
    'sub:pairs': { items: [], seen: [] },
  },
  titles: { 'sub:masks': 'My masks' },
};

describe('a saved change naming a submenu that is gone', () => {
  it('opens quietly rather than throwing', () => {
    expect(() => shapeMenus(MENUS, SUBMENUS, stale)).not.toThrow();
  });

  it('leaves no ghost submenu behind', () => {
    const shape = shapeMenus(MENUS, SUBMENUS, stale);
    expect(Object.keys(shape.subs)).not.toContain('masks');
    expect(Object.keys(shape.subs)).not.toContain('pairs');
  });

  it('still builds every menu the app comes with', () => {
    const shape = shapeMenus(MENUS, SUBMENUS, stale);
    for (const m of MENUS) expect(shape.lists[m.label], `${m.label} is still there`).toBeTruthy();
  });
});
