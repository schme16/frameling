// The menu changes in force: the ones for the workspace the person is in. They live in the dock state, per workspace
// (see dock.ts and workspaceMenus.ts), so they are saved with the workspace and travel in its file. The shapes and the
// laying-over are in menuEdits.ts.
import { dock, menuEditsOf, setWorkspaceMenus } from './dock';
import { NO_EDITS, type MenuEdits } from './menuEdits';

/** Where the changes were kept before each workspace had its own. Moved into the dock at start-up (see dock.ts). */
export { MENUS_KEY } from './workspaceMenus';

export const getMenuEdits = (): MenuEdits => menuEditsOf(dock.get());
export const useMenuEdits = <S>(selector: (e: MenuEdits) => S): S => dock.use((s) => selector(menuEditsOf(s)));
export const subscribeMenuEdits = dock.subscribe;

/** Saves new edits for this workspace. Whatever is passed is cleaned first, so a bad change can never leave the menu bar empty or broken. */
export function setMenuEdits(next: MenuEdits): void {
  setWorkspaceMenus(next);
}

/** For tests. */
export function resetMenuEdits(): void {
  setMenuEdits(NO_EDITS);
}
