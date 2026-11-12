// The right-click menus of the dock (a panel's tab, a floating window's title, the tool rail) and the little name box,
// as plain data, so the same lists serve the mouse and the keyboard (the menu key) and the commands.
import { getPanel } from '../core/registry';
import { closeFloatWindow, dock, dockEverythingBack, dockFloatBack, floatPanel, hidePanel, moveFloatTo, panelTitle, placeOf, placePanel, placeTools, renameFloat, renamePanel } from './dock';
import { floatTitle, ZONES, type DockZone, type ToolsPlace } from './dockModel';
import { ZONE_NAMES } from './dockDrag';
import { createStore } from './mini';
import { openHelp } from './overlays';

export type DockMenuItem = { label: string; onClick: () => void; disabled?: boolean; checked?: boolean; danger?: boolean } | { separator: true } | { heading: string };

export const dockMenu = createStore<{ x: number; y: number; items: DockMenuItem[] } | null>(null);
export const openDockMenu = (x: number, y: number, items: DockMenuItem[]): void => dockMenu.set({ x, y, items });
export const closeDockMenu = (): void => dockMenu.set(null);

/** The name box: which panel or window it is renaming and where it hangs. */
export const renaming = createStore<{ kind: 'panel' | 'float'; id: string; x: number; y: number } | null>(null);
export const askRename = (kind: 'panel' | 'float', id: string, x: number, y: number): void => renaming.set({ kind, id, x, y });

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
  for (const z of ZONES) items.push({ label: `Move to ${WHERE[z]}`, disabled: zone === z, onClick: () => placePanel(id, { zone: z }) });
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
  items.push({ separator: true }, { label: 'Dock back where it started', onClick: () => dockFloatBack(floatId) });
  for (const z of ZONES) items.push({ label: `Dock all of it on ${WHERE[z]}`, onClick: () => moveFloatTo(floatId, { zone: z }) });
  items.push({ separator: true }, { label: 'Close window', onClick: () => closeFloatWindow(floatId) }, { label: 'Dock every window back', disabled: l.floats.length < 2, onClick: () => dockEverythingBack() });
  items.push({ label: 'What are windows?', onClick: () => openHelp('floating-windows') });
  return items;
}

/** Where the tool rail goes. */
export function toolsMenu(): DockMenuItem[] {
  const place = dock.get().layout.tools.place;
  const to = (p: ToolsPlace) => () => placeTools(p, p === 'float' ? { x: 90, y: 110 } : undefined);
  return [
    { heading: 'Tools' },
    ...ZONES.map((z): DockMenuItem => ({ label: `Dock on ${WHERE[z]}`, disabled: place === z, onClick: to(z) })),
    { label: 'Float over the canvas', disabled: place === 'float', onClick: to('float') },
    { separator: true },
    { label: 'What is the tool strip?', onClick: () => openHelp('tool-strip') },
  ];
}

export { ZONE_NAMES };
