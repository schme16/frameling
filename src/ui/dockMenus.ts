// The right-click menus of the dock (a panel's tab, a floating window's title, the tool rail) and the little name box,
// as plain data, so the same lists serve the mouse and the keyboard (the menu key) and the commands.
import { getPanel } from '../core/registry';
import { registerChoice, rememberedChoice, withChoice } from '../core/choices';
import { choiceWord } from '../words/choices';
import { closeFloatWindow, dock, setLock, setPanelLayout, workspaceLayoutNow, dockEverythingBack, dockFloatBack, floatPanel, hidePanel, joinGroups, panelTitle, placeOf, placePanel, placeTools, renameFloat, renamePanel, resetFloatSize, resizeFloatBy } from './dock';
import { panelsBackLayout, panelsDiffer, panelsRestored, type WindowsBack } from './dockBack';
import { floatTitle, groupCount, groupTabs, MAX_GROUPS, toolsHome, type DockZone } from './dockModel';
import { SPLIT_WORDS, ZONE_NAMES } from './dockDrag';
import { createStore } from './mini';
import { openHelp } from './overlays';
import { getPrefs, setPrefs } from './prefs';
import { lockedWhy, type LockKind } from './dockLock';
import { isLocked, refuseIfLocked } from './lockState';
import { toast } from './toast';
import { setToolRailStyle, putToolsBack, setRailLock, setToolbarEditing, toolbarIsChanged } from './toolRail';

/** `why` is a line under a greyed entry that says why it is greyed. */
export type DockMenuItem = { label: string; /** The command that does the same thing, so the row and the command are known to be one. */ command?: string; onClick: () => void; disabled?: boolean; why?: string; stays?: boolean; checked?: boolean; danger?: boolean } | { separator: true } | { heading: string };

export const dockMenu = createStore<{ x: number; y: number; items: DockMenuItem[] } | null>(null);
export const openDockMenu = (x: number, y: number, items: DockMenuItem[]): void => dockMenu.set({ x, y, items });
export const closeDockMenu = (): void => dockMenu.set(null);

/** The name box: which panel, window or tool group it is renaming and where it hangs. */
export const renaming = createStore<{ kind: 'panel' | 'float' | 'group'; id: string; x: number; y: number } | null>(null);
export const askRename = (kind: 'panel' | 'float' | 'group', id: string, x: number, y: number): void => {
  if (refuseIfLocked(kind === 'group' ? 'tools' : 'panels', 'arrange')) return;
  renaming.set({ kind, id, x, y });
};

const WHERE: Record<DockZone, string> = { left: 'the left side', right: 'the right side', bottom: 'the bottom', top: 'the top' };

/** Where the menu key (or a keyboard press on a tab) opens a menu: under the thing. */
export const menuPoint = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left + 8, y: r.bottom + 2 };
};

/** Greys entries that are locked, each saying why. Separators and headings pass through. */
export function whenLocked(kind: LockKind, items: DockMenuItem[]): DockMenuItem[] {
  if (!isLocked(kind)) return items;
  return items.map((it) => ('label' in it && it.stays ? it : 'label' in it && !it.disabled ? { ...it, disabled: true, why: lockedWhy(kind) } : 'label' in it && it.disabled && !it.why ? { ...it, why: lockedWhy(kind) } : it));
}

/** The entry that locks or unlocks the tool rail or the panels. */
export const lockItem = (kind: LockKind): DockMenuItem => {
  const on = isLocked(kind);
  return { label: `${on ? 'Unlock' : 'Lock'} the ${kind}`, onClick: () => (kind === 'tools' ? setRailLock(!on) : setLock('panels', !on)) };
};

/** What Put the panels back does with panels that were moved out to a window of their own. */
export const PANELS_BACK_WINDOWS = 'panels.putBackWindows';

registerChoice<WindowsBack>({
  id: PANELS_BACK_WINDOWS,
  title: choiceWord('choice.panels.putBackWindows.title'),
  question: choiceWord('choice.panels.putBackWindows.question'),
  category: 'Workspaces',
  help: 'panels-back',
  default: 'dock',
  options: [
    { value: 'dock', label: choiceWord('choice.panels.putBackWindows.dock.label'), detail: choiceWord('choice.panels.putBackWindows.dock.detail'), did: choiceWord('choice.panels.putBackWindows.dock.did') },
    { value: 'leave', label: choiceWord('choice.panels.putBackWindows.leave.label'), detail: choiceWord('choice.panels.putBackWindows.leave.detail'), did: choiceWord('choice.panels.putBackWindows.leave.did') },
  ],
});

/** True when the panels are not the way this workspace comes: opened, closed, moved, reordered, resized, renamed, or in windows. */
export const panelsAreChanged = (): boolean => panelsDiffer(dock.get().layout, workspaceLayoutNow(), rememberedChoice(PANELS_BACK_WINDOWS) === 'leave' ? 'leave' : 'dock');

const ALREADY = 'The panels are already the way they come.';

function putBack(windows: WindowsBack): void {
  const d = dock.get();
  const id = d.workspaceId;
  const before = d.layout;
  const target = workspaceLayoutNow();
  if (!panelsDiffer(before, target, windows)) return void toast(before.floats.length && windows === 'leave' ? `${ALREADY} The windows are left alone.` : ALREADY, { duration: 1800 });
  setPanelLayout((now) => panelsBackLayout(now, target, windows));
  toast('The panels are back the way they come.', {
    kind: 'success',
    action: {
      label: 'Undo',
      run: () => {
        // Only in the workspace it was done in: if you moved on, leave that one alone.
        if (dock.get().workspaceId === id) setPanelLayout((now) => panelsRestored(now, before));
      },
    },
  });
}

/**
 * Puts this workspace's panels back the way it comes: which are open, which group each is in, the order of the tabs,
 * the size of each side and group, and every name. Panels in a window of their own are docked too, or left, as you
 * answer the first time. A toast offers Undo, because it undoes more than one thing.
 */
export function putPanelsBack(): void {
  if (refuseIfLocked('panels', 'reset')) return;
  const l = dock.get().layout;
  // Only ask when the answer changes what happens: a window that is not there has nothing to dock.
  if (!l.floats.length) return putBack('dock');
  withChoice<WindowsBack>(PANELS_BACK_WINDOWS, putBack, { matters: panelsDiffer(l, workspaceLayoutNow(), 'dock') !== panelsDiffer(l, workspaceLayoutNow(), 'leave') });
}

/** The menu entry, greyed with its reason when there is nothing to put back. */
export const putBackItem = (): Extract<DockMenuItem, { label: string }> => {
  const changed = panelsAreChanged();
  return { label: 'Put the panels back', command: 'view.panelsReset', disabled: !changed, why: changed || isLocked('panels') ? undefined : ALREADY, onClick: putPanelsBack };
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
    for (const edge of ['before', 'after'] as const) items.push({ label: `Move to a new group ${words[edge]}`, command: 'view.splitPanelGroup', disabled: alone || count >= MAX_GROUPS, onClick: () => placePanel(id, { zone, group, split: edge }) });
    if (group > 0) items.push({ label: `Move into the group ${words.before}`, onClick: () => placePanel(id, { zone, group: group - 1 }) });
    if (group < count - 1) items.push({ label: `Move into the group ${words.after}`, onClick: () => placePanel(id, { zone, group: group + 1 }) });
    if (count > 1) items.push({ label: 'Join this side into one group', command: 'view.joinPanelGroups', onClick: () => joinGroups(zone) });
  }
  items.push({ label: 'Move to its own window', command: 'view.floatPanel', disabled: !!here && 'float' in here && l.floats.find((f) => f.id === here.float)!.tabs.length === 1, onClick: () => floatPanel(id) });
  const others = l.floats.filter((f) => !f.tabs.includes(id));
  if (others.length) {
    items.push({ separator: true }, { heading: 'Group with a window' });
    for (const f of others) items.push({ label: floatTitle(l, f, (x) => panelTitle(x, l)), onClick: () => placePanel(id, { float: f.id }) });
  }
  items.push({ separator: true }, { label: 'Rename...', command: 'view.renamePanel', onClick: () => askRename('panel', id, at.x, at.y) });
  if (l.names?.[id]) items.push({ label: 'Use its own name again', onClick: () => renamePanel(id, '') });
  items.push({ separator: true }, putBackItem());
  items.push({ separator: true }, { label: `Close ${panelTitle(id, l)}`, onClick: () => hidePanel(id) }, { label: 'What is this panel?', stays: true, onClick: () => openHelp(p?.help ?? 'panels') });
  return [items[0], lockItem('panels'), { separator: true }, ...whenLocked('panels', items.slice(1))];
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
  items.push({ separator: true }, putBackItem());
  items.push({ separator: true }, { label: 'Close window', onClick: () => closeFloatWindow(floatId) }, { label: 'Dock every window back', command: 'view.dockAllWindows', disabled: l.floats.length < 2, onClick: () => dockEverythingBack() });
  items.push({ label: 'What are windows?', stays: true, onClick: () => openHelp('floating-windows') });
  return [items[0], lockItem('panels'), { separator: true }, ...whenLocked('panels', items.slice(1))];
}

/** The tool rail: it is moved by dragging its grip, so one line says so (or, floating, puts it back on its side). Locking it stops all of that. */
export function toolsMenu(): DockMenuItem[] {
  const l = dock.get().layout;
  const home = toolsHome(l);
  const locked = isLocked('tools');
  const rest: DockMenuItem[] = [
    l.tools.place === 'float' ? { label: `Dock them back on ${WHERE[home]}`, onClick: () => placeTools(home) } : { label: 'To move them, drag the grip', onClick: () => openHelp('tool-strip') },
    { separator: true },
    { label: 'Change the tools...', onClick: () => setToolbarEditing(true) },
    { label: 'Put the tools back', disabled: !toolbarIsChanged(), onClick: putToolsBack },
  ];
  return [
    { heading: 'Tools' },
    lockItem('tools'),
    { separator: true },
    ...(locked ? whenLocked('tools', rest) : rest),
    { label: getPrefs().toolRail === 'two' ? 'Show one button per group' : 'Show every tool, two wide', onClick: () => setToolRailStyle(getPrefs().toolRail === 'two' ? 'stacked' : 'two') },
    { separator: true },
    { label: 'What is the tool strip?', onClick: () => openHelp('tool-strip') },
  ];
}

export { ZONE_NAMES };
