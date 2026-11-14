// The workspace switcher in the top bar: which workspaces get a tab of their own, which wait behind More, and the
// keys for the three that come with the app. Plain functions, so they can be tested.
import type { Workspace } from './dockModel';

/** How the switcher looks: three or more small tabs, one chip with the name and a list, or hidden. */
export type SwitcherLook = 'tabs' | 'chip' | 'off';
export const SWITCHER_LOOKS: SwitcherLook[] = ['tabs', 'chip', 'off'];
export const isSwitcherLook = (v: unknown): v is SwitcherLook => v === 'tabs' || v === 'chip' || v === 'off';

/** How many tabs fit before the rest go behind More. The three built in and two of your own. */
export const MAX_TABS = 5;

/** The keys for the workspaces that come with the app, by id. Yours have none until you give them one. */
export const WORKSPACE_KEYS: Record<string, string> = { draw: 'Mod+Alt+1', animate: 'Mod+Alt+2', pixel: 'Mod+Alt+3' };

export interface Slots<T> {
  /** Shown as tabs, in list order. The one in use is always here. */
  tabs: T[];
  /** Shown in the More list, in list order. */
  more: T[];
}

/**
 * Splits the workspaces into tabs and a More list. The first `max` get tabs; if the one in use is further down, it
 * takes the last tab so you can always see where you are, and the one it pushed out goes into More.
 */
export function switcherSlots<T extends Pick<Workspace, 'id'>>(all: T[], currentId: string, max = MAX_TABS): Slots<T> {
  if (all.length <= max) return { tabs: all, more: [] };
  const first = all.slice(0, max);
  const at = all.findIndex((w) => w.id === currentId);
  if (at < max) return { tabs: first, more: all.slice(max) };
  const keep = [...first.slice(0, max - 1), all[at]];
  return { tabs: keep, more: all.filter((w) => !keep.includes(w)) };
}

/** The name on the chip: the workspace in use, or a plain fallback when it has been deleted from under it. */
export function chipName(all: Pick<Workspace, 'id' | 'name'>[], currentId: string): string {
  return all.find((w) => w.id === currentId)?.name ?? 'Workspace';
}
