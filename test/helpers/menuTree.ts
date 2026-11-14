// The menu bar plus Preferences as one tree of words, for checking the **Menu > Item** paths that help names.
import { PAGES } from '../../src/ui/PrefsModal';
import { menuTitle, resolveMenus } from '../../src/ui/menus';
import { toMenuTree, type MenuNode } from '../../src/ui/help/menuPaths';
import { allPrefRows } from '../../src/ui/prefsIndex';

/** Preferences is not in the menu bar but is named the same way: the page, then the row on it. */
export function wordsTree(): MenuNode[] {
  const prefs: MenuNode = { label: 'Preferences', items: PAGES.map((p) => ({ label: p.label, items: allPrefRows().filter((r) => r.page === p.id).map((r) => ({ label: r.label })) })) };
  return [...resolveMenus().map((m) => ({ label: menuTitle(m.menu), items: toMenuTree(m.items) })), prefs];
}
