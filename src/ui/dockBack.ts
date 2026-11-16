// Put the panels back, as plain functions: what a workspace's panels look like when they are the way it comes, how to get
// there from where they are now, whether there is anything to do, and what Undo puts back. No store and no registry in
// here, so it can be tested alone. dockMenus.ts does the asking, the lock check and the toast.
import { clone, groupsOf, retainTabs, sharesOf, ZONES, type Layout } from './dockModel';

/** What happens to panels that were moved out to a window of their own: docked back with the rest, or left where they are. */
export type WindowsBack = 'dock' | 'leave';

/** Which panels sit in a window now. */
export const inWindows = (l: Layout): Set<string> => new Set(l.floats.flatMap((f) => f.tabs));

/**
 * The layout the panels go back to. `target` is what the workspace comes with (or was saved with), already made to fit the
 * panels that exist. Only the panels change: where the tool rail sits, and which panels this layout has met, stay as
 * they are now. Windows are docked (the target's windows, if it has any, come back) or, with 'leave', stay exactly
 * as they are, with their panels, names and places.
 */
export function panelsBackLayout(current: Layout, target: Layout, windows: WindowsBack): Layout {
  const next = clone(target);
  next.tools = clone(current.tools);
  next.known = [...new Set([...current.known, ...next.known])];
  if (current.railAt) next.railAt = clone(current.railAt);
  else delete next.railAt;
  if (windows === 'leave' && current.floats.length) {
    const away = inWindows(current);
    for (const z of ZONES) retainTabs(next.zones[z], (id) => !away.has(id));
    next.hidden = next.hidden.filter((id) => !away.has(id));
    const held = new Set(current.floats.map((f) => f.id));
    next.floats = [
      ...next.floats.filter((f) => !held.has(f.id)).map((f) => ({ ...f, tabs: f.tabs.filter((id) => !away.has(id)) })).filter((f) => f.tabs.length),
      ...clone(current.floats),
    ];
    for (const f of next.floats) if (!f.active || !f.tabs.includes(f.active)) f.active = f.tabs[0] ?? null;
    // A panel left in its window keeps the name you gave it.
    for (const id of away) {
      const name = current.names?.[id];
      if (name) (next.names ??= {})[id] = name;
      else if (next.names) delete next.names[id];
    }
    if (next.names && !Object.keys(next.names).length) delete next.names;
  }
  return next;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * What a person would call "the way the panels are": which panels are open, the group each sits in and the order of its
 * tabs, the size of each side and of each group in it, whether a side is folded away, the names, and the windows. Which tab is
 * in front, and where a window sits on the screen, are left out: choosing a tab or nudging a window is not a mess.
 */
export function panelsSignature(l: Layout): string {
  return JSON.stringify({
    zones: ZONES.map((z) => {
      const s = l.zones[z];
      const gs = groupsOf(s);
      return [z, gs.every((g) => !g.tabs.length) ? 0 : s.size, s.collapsed && gs.some((g) => g.tabs.length), gs.map((g) => g.tabs), sharesOf(s).map(round)];
    }),
    hidden: [...l.hidden].sort(),
    names: Object.entries(l.names ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)),
    floats: l.floats.map((f) => [f.tabs, f.name ?? '']),
  });
}

/** True when putting the panels back would change something. */
export const panelsDiffer = (current: Layout, target: Layout, windows: WindowsBack): boolean => panelsSignature(current) !== panelsSignature(panelsBackLayout(current, target, windows));

/**
 * What Undo puts back: the panels as they were, into the layout as it is now, so a tool rail moved since stays moved.
 */
export function panelsRestored(now: Layout, before: Layout): Layout {
  const next = clone(now);
  next.zones = clone(before.zones);
  next.floats = clone(before.floats);
  next.hidden = [...before.hidden];
  if (before.names) next.names = clone(before.names);
  else delete next.names;
  next.known = [...new Set([...now.known, ...before.known])];
  return next;
}
