// The right-click menus of the dock (a panel's tab, a floating window's title, the tool rail) and the little name box,
// as plain data, so the same lists serve the mouse and the keyboard (the menu key) and the commands.
import { getPanel } from '../core/registry';
import { closeFloatWindow, dock, dockEverythingBack, dockFloatBack, floatPanel, hidePanel, joinGroups, panelTitle, placeOf, placePanel, placeTools, renameFloat, renamePanel, resetFloatSize, resizeFloatBy } from './dock';
import { floatTitle, groupCount, groupTabs, MAX_GROUPS, toolsHome, type DockZone } from './dockModel';
import { SPLIT_WORDS, ZONE_NAMES } from './dockDrag';
import { createStore } from './mini';
import { openHelp } from './overlays';
import { getPrefs, setPrefs } from './prefs';
import { putToolsBack, setToolbarEditing, toolbarIsChanged } from './toolRail';

export type DockMenuItem = { label: string; onClick: () => void; disabled?: boolean; checked?: boolean; danger?: boolean } | { separator: true } | { heading: string };

export const dockMenu = createStore<{ x: number; y: number; items: DockMenuItem[] } | null>(null);
export const openDockMenu = (x: number, y: number, items: DockMenuItem[]): void => dockMenu.set({ x, y, items });
export const closeDockMenu = (): void => dockMenu.set(null);

/** The name box: which panel, window or tool group it is renaming and where it hangs. */
export const renaming = createStore<{ kind: 'panel' | 'float' | 'group'; id: string; x: number; y: number } | null>(null);
export const askRename = (kind: 'panel' | 'float' | 'group', id: string, x: number, y: number): void => renaming.set({ kind, id, x, y });

const WHERE: Record<DockZone, string> = { left: 'the left side', right: 'the right side', bottom: 'the bottom', top: 'the top' };

/** Where the menu key (or a keyboard press on a tab) opens a menu: under the thing. */
export const menuPoint = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left + 8, y: r.bottom + 2 };
};

/** What can be done with a panel: where it lives, what it's called, closing it. */
export function panelMenu(id: string, at: { x: number; y: number }): DockMenuItem[] {
  const l = dock.get().layout;
  const p = getPanel(id);
  const here = placeOf(id, l);
  const zone = here && 'zone' in here ? here.zone : null;
  const items: DockMenuItem[] = [{ heading: panelTitle(id, l) }];
  const group = here && 'zone' in here ? (here.group ?? 0) : 0;
  items.push({ label: 'To move it, drag its tab', onClick: () => openHelp('floating-windows') });
  if (zone) {
    // Groups stack inside a side: each with its own tabs.
    const words = SPLIT_WORDS[zone];
    const count = groupCount(l.zones[zone]);
    const alone = groupTabs(l, here!).length === 1;
    for (const edge of ['before', 'after'] as const) items.push({ label: `Move to a new group ${words[edge]}`, disabled: alone || count >= MAX_GROUPS, onClick: () => placePanel(id, { zone, group, split: edge }) });
    if (group > 0) items.push({ label: `Move into the group ${words.before}`, onClick: () => placePanel(id, { zone, group: group - 1 }) });
    if (group < count - 1) items.push({ label: `Move into the group ${words.after}`, onClick: () => placePanel(id, { zone, group: group + 1 }) });
    if (count > 1) items.push({ label: 'Join this side into one group', onClick: () => joinGroups(zone) });
  }
  items.push({ label: 'Move to its own window', disabled: !!here && 'float' in here && l.floats.find((f) => f.id === here.float)!.tabs.length === 1, onClick: () => floatPanel(id) });
  const others = l.floats.filter((f) => !f.tabs.includes(id));
  if (others.length) {
    items.push({ separator: true }, { heading: 'Group with a window' });
    for (const f of others) items.push({ label: floatTitle(l, f, (x) => panelTitle(x, l)), onClick: () => placePanel(id, { float: f.id }) });
  }
  items.push({ separator: true }, { label: 'Rename...', onClick: () => askRename('panel', id, at.x, at.y) });
  if (l.names?.[id]) items.push({ label: 'Use its own name again', onClick: () => renamePanel(id, '') });
  items.push({ separator: true }, { label: `Close ${panelTitle(id, l)}`, onClick: () => hidePanel(id) }, { label: 'What is this panel?', onClick: () => openHelp(p?.help ?? 'panels') });
  return items;
}

/** What can be done with a window: rename it, dock it somewhere, close it. */
export function floatMenu(floatId: string, at: { x: number; y: number }): DockMenuItem[] {
  const l = dock.get().layout;
  const f = l.floats.find((x) => x.id === floatId);
  if (!f) return [];
  const items: DockMenuItem[] = [{ heading: floatTitle(l, f, (x) => panelTitle(x, l)) }, { label: 'Rename window...', onClick: () => askRename('float', floatId, at.x, at.y) }];
  if (f.name) items.push({ label: 'Name it after its panel again', onClick: () => renameFloat(floatId, '') });
  items.push({ separator: true }, { label: 'Make it bigger', onClick: () => resizeFloatBy(floatId, 64, 48) }, { label: 'Make it smaller', onClick: () => resizeFloatBy(floatId, -64, -48) }, { label: 'Back to the usual size', onClick: () => resetFloatSize(floatId) });
  items.push({ separator: true }, { label: 'Dock back where it started', onClick: () => dockFloatBack(floatId) });
  items.push({ separator: true }, { label: 'Close window', onClick: () => closeFloatWindow(floatId) }, { label: 'Dock every window back', disabled: l.floats.length < 2, onClick: () => dockEverythingBack() });
  items.push({ label: 'What are windows?', onClick: () => openHelp('floating-windows') });
  return items;
}

/** The tool rail: it is moved by dragging its grip, so one line says so (or, floating, puts it back on its side). */
export function toolsMenu(): DockMenuItem[] {
  const l = dock.get().layout;
  const home = toolsHome(l);
  return [
    { heading: 'Tools' },
    l.tools.place === 'float' ? { label: `Dock them back on ${WHERE[home]}`, onClick: () => placeTools(home) } : { label: 'To move them, drag the grip', onClick: () => openHelp('tool-strip') },
    { separator: true },
    { label: 'Change the tools...', onClick: () => setToolbarEditing(true) },
    { label: 'Put the tools back', disabled: !toolbarIsChanged(), onClick: putToolsBack },
    { label: getPrefs().toolRail === 'two' ? 'Show one button per group' : 'Show every tool, two wide', onClick: () => setPrefs({ toolRail: getPrefs().toolRail === 'two' ? 'stacked' : 'two' }) },
    { separator: true },
    { label: 'What is the tool strip?', onClick: () => openHelp('tool-strip') },
  ];
}

export { ZONE_NAMES };
