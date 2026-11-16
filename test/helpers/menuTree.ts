// The menu bar plus Preferences as one tree of words, for checking the **Menu > Item** paths that help names.
import { PAGES } from '../../src/ui/PrefsModal';
import { menuTitle, resolveMenus } from '../../src/ui/menus';
import { toMenuTree, type MenuNode } from '../../src/ui/help/menuPaths';
import { allPrefRows } from '../../src/ui/prefsIndex';
import { newDoc } from '../../src/core/doc';
import { store } from '../../src/core/store';

/** Preferences is not in the menu bar but is named the same way: the page, then the row on it. */
export function wordsTree(): MenuNode[] {
  // Help describes the whole menus. A drawing with no animation leaves the animation entries out of them, so the tree is read from one with animation on.
  const was = store().get().doc;
  store().load(newDoc({ animated: true }));
  try {
    return readTree();
  } finally {
    store().load(was);
  }
}

function readTree(): MenuNode[] {
  const prefs: MenuNode = { label: 'Preferences', items: PAGES.map((p) => ({ label: p.label, items: allPrefRows().filter((r) => r.page === p.id).map((r) => ({ label: r.label })) })) };
  return [...resolveMenus().map((m) => ({ label: menuTitle(m.menu), items: toMenuTree(m.items) })), prefs];
}
