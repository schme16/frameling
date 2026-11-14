// Menu changes kept with a workspace, the way its tool arrangement and locks are. Pure, so the rules can be tested
// without a window. The live state is in dock.ts (`DockState.menus`, and `Workspace.menus` for what a workspace file brings).
import { isUnchanged, NO_EDITS, sanitizeMenuEdits, type MenuEdits } from './menuEdits';

/** Where menu changes were kept when they were one set for every workspace. Read once, then moved into the dock's own state. */
export const MENUS_KEY = 'frameling.menus.v1';

const isId = (id: string): boolean => /^[\w-]{1,40}$/.test(id) && id !== '__proto__';

/** What a workspace file or saved workspace brings: the changes, or nothing at all. */
export function cleanBrought(raw: unknown): MenuEdits | undefined {
  const e = sanitizeMenuEdits(raw);
  return isUnchanged(e) ? undefined : e;
}

/**
 * The person's own changes in each workspace, made safe. An entry that is empty is kept: in a workspace that brings
 * changes of its own it means "the person put the menus back", which is not the same as never having touched them.
 */
export function sanitizeMenuMap(raw: unknown): Record<string, MenuEdits> {
  const out: Record<string, MenuEdits> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw).slice(0, 64)) {
    if (isId(id) && v && typeof v === 'object' && !Array.isArray(v)) out[id] = sanitizeMenuEdits(v);
  }
  return out;
}

/** The changes in force: the person's own for the workspace, else what the workspace brings, else none. */
export const menuEditsIn = (own: MenuEdits | undefined, brought: MenuEdits | undefined): MenuEdits => own ?? brought ?? NO_EDITS;

/**
 * What to keep as the person's own changes after they set `next`. Undefined means nothing needs keeping (the same as
 * what the workspace brings, or no changes in a workspace that brings none).
 */
export function ownAfter(next: MenuEdits, brought: MenuEdits | undefined): MenuEdits | undefined {
  const clean = sanitizeMenuEdits(next);
  if (isUnchanged(clean)) return brought ? NO_EDITS : undefined;
  if (brought && JSON.stringify(clean) === JSON.stringify(brought)) return undefined;
  return clean;
}

/** The map with one workspace's entry set or removed. Undefined when nothing is left, so the saved state stays small. */
export function withMenuEntry(map: Record<string, MenuEdits> | undefined, id: string, own: MenuEdits | undefined): Record<string, MenuEdits> | undefined {
  const out = { ...map };
  if (own) out[id] = own;
  else delete out[id];
  return Object.keys(out).length ? out : undefined;
}

/** The map without a workspace's entry (it was saved again, or deleted). */
export const withoutMenuEntry = (map: Record<string, MenuEdits> | undefined, id: string): Record<string, MenuEdits> | undefined => withMenuEntry(map, id, undefined);

/**
 * Menu changes saved before each workspace had its own: they go to the workspace the person was on. Undefined when
 * there was nothing, or the dock already holds menu changes (the move was done).
 */
export function migrateLegacyMenus(legacy: unknown, alreadyHave: Record<string, MenuEdits> | undefined, workspaceId: string): Record<string, MenuEdits> | undefined {
  if (alreadyHave) return undefined;
  const e = sanitizeMenuEdits(legacy);
  return isUnchanged(e) ? undefined : { [workspaceId]: e };
}
