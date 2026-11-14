// The tool rail's live side: the arrangement as it is now, moving tools (by pointer drag, keyboard, menu), and the
// stacked style's "front tool" of each group. The pure model is toolArrange.ts; ToolStrip.tsx draws it.
import { allTools, getTool } from '../core/registry';
import { store } from '../core/store';
import { pickTool } from '../tools/pick';
import { defaultRailWidthOf, dock, flushDock, setLock, railOf, railWidthOf, resetToolGroups, setRailWidth, setToolGroups } from './dock';
import { acrossFor, chosenRailWidth, columnStep, fitRailWidth, naturalRailWidth, railSizes, railWidthNow, type RailSizes } from './toolRailWidth';
import { DEFAULT_PREFS, getPrefs, setPrefs } from './prefs';
import { fitRailSaved, fitToolSize, isCompact } from './screenFit';
import { toast } from './toast';
import { refuseDrag, run } from './dockDrag';
import { askRename, whenLocked, type DockMenuItem } from './dockMenus';
import { openHelp } from './overlays';
import { createStore } from './mini';
import { railLocked, refuseIfLocked, teachLock } from './lockState';
import { whyOff, type WaitingTool, canJoinAbove, foldGroup, groupName, hasOwnName, hiddenTools, hideTool, joinGroupAbove, moveTool, placeWords, renameGroup, resolveGroups, shiftTool, showAllTools, showTool, slotMates, startGroupAt, visibleGroups, type ToolDrop, type ToolGroup } from './toolArrange';

/** The whole arrangement for the tools that exist in this workspace (the person's own, or what it brings), whatever shows right now. */
export function currentGroups(): ToolGroup[] {
  return resolveGroups(railOf(dock.get()), allTools());
}

/** True when the person has changed this workspace's arrangement from its default. */
export const isCustomArrangement = (): boolean => !!dock.get().rails?.[dock.get().workspaceId];

/** Saves what a pure move made of the arrangement. Nothing happens when it hands the same one back. */
export function arrange(fn: (g: ToolGroup[]) => ToolGroup[]): boolean {
  if (refuseIfLocked('tools', 'arrange')) return false;
  const now = currentGroups();
  const next = fn(now);
  if (next === now) return false;
  setToolGroups(next);
  return true;
}

/** The tool each group shows on its button in the stacked style: the last one used from it. */
export const frontTools = createStore<Record<string, string>>({});

/** A group (by id) to open the flyout of, asked for from outside the rail (a quest pointing at a tool inside it). The rail answers and clears it. */
export const flyRequest = createStore<string | null>(null);

/** Puts this workspace's tools back the way the workspace brings them. */
export const resetToolArrangement = (): void => resetToolGroups();

/** A line for a screen reader after a move ("Pencil moved. Draw, place 2 of 4."). */
export const railNote = createStore('');

/** The tools that share a place on the rail with this one (the Lasso and the Pixel lasso move as one). */
const mates = (id: string): string[] => slotMates(allTools())(id);

const label = (id: string): string => getTool(id)?.label ?? id;

export function moveToolTo(id: string, to: ToolDrop, visible: (id: string) => boolean = () => true): void {
  if ('away' in to) return void putToolAway(id);
  const wasAway = hiddenTools(currentGroups()).includes(id);
  // A tool brought back from the shelf shows again, so it counts as visible where it lands.
  const sees = wasAway ? (t: string) => t === id || visible(t) : visible;
  if (arrange((g) => moveTool(g, id, to, mates))) railNote.set(`${label(id)} ${wasAway ? 'is back' : 'moved'}. ${placeWords(currentGroups(), id, sees)}.`);
}

/** Alt+arrow: one step along the rail. Returns true when the tool moved. */
export function stepTool(id: string, by: number, visible: (id: string) => boolean): boolean {
  const moved = arrange((g) => shiftTool(g, id, by, visible, mates));
  if (moved) railNote.set(`${label(id)} moved. ${placeWords(currentGroups(), id, visible)}.`);
  return moved;
}

/** Names a group of this workspace's rail (empty = its usual name). The names are kept with the rest of the arrangement. */
export function renameToolGroup(groupId: string, name: string): void {
  const before = currentGroups().find((g) => g.id === groupId);
  if (!before) return;
  if (arrange((g) => renameGroup(g, groupId, name))) {
    const now = currentGroups();
    const after = now.find((g) => g.id === groupId);
    railNote.set(after ? `Group named ${groupName(after, now)}.` : '');
  }
}

/** Opens the name box for a group, hanging under the group's place on the rail (or where `at` says). */
export function askGroupRename(groupId: string, at?: { x: number; y: number }): void {
  const el = document.querySelector<HTMLElement>(`[data-tool-group="${groupId}"]`);
  const r = el?.getBoundingClientRect();
  const x = at?.x ?? (r ? r.right + 6 : 120);
  const y = at?.y ?? (r ? r.top : 120);
  askRename('group', groupId, x, y);
}

/** The menu for a group of the rail: its name, folding it, joining it, and any other things to do to the group as a whole. */
export function groupMenu(groupId: string, at?: { x: number; y: number }, visible: (id: string) => boolean = () => true): DockMenuItem[] {
  const groups = currentGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return [];
  const folded = !!g.fold;
  const above = groupAbove(groupId, visible);
  return whenLocked('tools', [
    { heading: groupName(g, groups) },
    { label: 'Rename group...', onClick: () => askGroupRename(groupId, at) },
    ...(hasOwnName(g, groups) ? [{ label: 'Use the usual name again', onClick: () => renameToolGroup(groupId, '') } satisfies DockMenuItem] : []),
    { separator: true },
    { label: folded ? 'Show every tool in this group' : 'Fold this group into one button', disabled: getPrefs().toolRail === 'stacked', onClick: () => foldToolGroup(groupId, !folded) },
    { label: 'Join the group above', disabled: !above, onClick: () => joinToolGroupAbove(groupId, visible) },
  ]);
}

/** The menu for one tool: where to move it, putting it away, dividing and folding its group. */
export function toolMenu(id: string, visible: (id: string) => boolean): DockMenuItem[] {
  const groups = currentGroups();
  const here = groups.find((g) => g.tools.includes(id));
  const items: DockMenuItem[] = [{ heading: label(id) }];
  for (const g of groups) items.push({ label: `Move to ${groupName(g, groups)}`, disabled: g === here, onClick: () => moveToolTo(id, { group: g.id }, visible) });
  items.push({ label: 'Move to a new group', disabled: here?.tools.length === 1, onClick: () => moveToolTo(id, { newGroupAt: groups.length }, visible) });
  const first = here ? here.tools.filter(visible)[0] === id : true;
  items.push({ separator: true }, { label: 'Start a new group here', disabled: first, onClick: () => startToolGroupHere(id, visible) });
  if (here) {
    items.push({ label: 'Join the group above', disabled: !groupAbove(here.id, visible), onClick: () => joinToolGroupAbove(here.id, visible) });
    items.push({ label: here.fold ? 'Show every tool in this group' : 'Fold this group into one button', disabled: getPrefs().toolRail === 'stacked', onClick: () => foldToolGroup(here.id, !here.fold) });
  }
  items.push({ label: 'Hide this tool', onClick: () => putToolAway(id) });
  if (here) items.push({ separator: true }, { label: `Rename ${groupName(here, groups)}...`, onClick: () => askGroupRename(here.id) });
  return whenLocked('tools', items);
}

// ---------------------------------------------------------------- the builder: change the tools

/** True while the rail is being changed (the Change the tools panel is open). */
export const toolbarEditing = createStore(false);
export const setToolbarEditing = (on = !toolbarEditing.get()): void => {
  if (on && refuseIfLocked('tools', 'edit')) return;
  toolbarEditing.set(on);
};
// Locking while the tools are being changed (or moving to a locked workspace) puts the rail away from editing.
dock.subscribe(() => {
  if (toolbarEditing.get() && railLocked()) toolbarEditing.set(false);
});

/** Locks or unlocks the tool rail. */
export const setRailLock = (on: boolean): void => setLock('tools', on);

/** The group above one on the rail as it shows now (the groups with nothing showing do not count), or undefined. */
export function groupAbove(groupId: string, visible: (id: string) => boolean = () => true): ToolGroup | undefined {
  const shown = visibleGroups(currentGroups(), visible);
  const i = shown.findIndex((g) => g.id === groupId);
  return i > 0 ? shown[i - 1] : undefined;
}

/** Puts a tool away: it leaves the rail but keeps its place in its group, and it is still in the command search and on its key. */
export function putToolAway(id: string): void {
  if (arrange((g) => hideTool(g, id, mates))) railNote.set(`${label(id)} put away. It is in Change the tools, under Put away.`);
}

/** Brings a put-away tool (or with no id, every one) back to the place it had. */
export function bringToolBack(id?: string): void {
  if (arrange((g) => (id ? showTool(g, id, mates) : showAllTools(g)))) railNote.set(id ? `${label(id)} is back on the rail.` : 'Every tool is back on the rail.');
}

/** Folds a group into one button with the rest behind it (or opens it out again). */
export function foldToolGroup(groupId: string, fold: boolean): void {
  if (arrange((g) => foldGroup(g, groupId, fold))) railNote.set(fold ? 'Group folded into one button.' : 'Group opened out.');
}

/** A divider before a tool: it and the ones after it in its group start a group of their own. */
export function startToolGroupHere(id: string, visible: (id: string) => boolean = () => true): void {
  if (arrange((g) => startGroupAt(g, id, mates))) railNote.set(`New group started at ${label(id)}. ${placeWords(currentGroups(), id, visible)}.`);
}

/** Takes the divider above a group away: the group joins the one above it. */
export function joinToolGroupAbove(groupId: string, visible: (id: string) => boolean = () => true): void {
  const up = groupAbove(groupId, visible);
  if (up && arrange((g) => joinGroupAbove(g, groupId, up.id))) railNote.set('Group joined to the one above.');
}

/** True when the rail is not as it comes: moved, named, hidden or folded tools, a button size, names or style set, or its width pulled. */
export const toolbarIsChanged = (): boolean => {
  const p = getPrefs();
  return isCustomArrangement() || isCustomWidth() || TOOL_PREF_KEYS.some((k) => p[k] !== DEFAULT_PREFS[k]);
};

// ---------------------------------------------------------------- the rail's width

/** The pixel sizes of the rail's buttons now (button size and look). */
export const railSizesNow = (): RailSizes => railSizes(getPrefs().look, fitToolSize(getPrefs().toolSize, isCompact()));

/** True when the person has pulled this workspace's rail to a width of their own. */
export const isCustomWidth = (): boolean => dock.get().railWidths?.[dock.get().workspaceId] !== undefined;

/** How wide the rail is now, in pixels: the one saved for this workspace, or its natural width. */
export const toolRailWidth = (): number => railWidthNow(fitRailSaved(railWidthOf(dock.get()), railSizesNow(), isCompact()), railSizesNow(), getPrefs().toolRail, getPrefs().toolNames);

/** How many buttons fit across a group at the rail's width now. */
export const toolRailAcross = (): number => acrossFor(toolRailWidth(), railSizesNow(), getPrefs().toolRail);

/**
 * Sets the rail's width from a pull or a step. The natural width is kept as "no width" so the rail goes on following its
 * style and button size (unless the workspace brings a width of its own: then the natural one has to be said out loud).
 * `persist` false while the edge is being dragged; call flushDock() at the end.
 */
export function setToolRailWidth(px: number, persist = true): void {
  if (refuseIfLocked('tools', 'size')) return;
  const s = railSizesNow();
  const style = getPrefs().toolRail;
  const d = dock.get();
  const names = getPrefs().toolNames;
  const chosen = chosenRailWidth(px, s, style, names);
  setRailWidth(chosen ?? (defaultRailWidthOf(d, d.workspaceId) !== undefined ? naturalRailWidth(s, style, names) : undefined), persist);
}

/** The width back to this workspace's own default (what it was saved with, or the natural width). */
export const resetToolRailWidth = (): void => void (!refuseIfLocked('tools', 'size') && setRailWidth(undefined));

/** Ends a drag of the rail's edge: what was set on the way is saved. */
export const endToolRailPull = (): void => flushDock();

/** One more button across (1) or one fewer (-1). Says so when it is as wide or as narrow as it goes. */
export function stepToolRail(dir: 1 | -1): void {
  if (refuseIfLocked('tools', 'size')) return;
  const s = railSizesNow();
  const before = toolRailWidth();
  setToolRailWidth(before + dir * columnStep(s));
  if (toolRailWidth() === before) toast(dir > 0 ? 'The tool rail is as wide as it goes.' : 'The tool rail is as narrow as it goes.', { duration: 1800, quill: null });
}

/** The width the group names want to show whole, read off the rail on screen. Zero when no names show. */
export function wantedNamesWidth(nav: HTMLElement | null = document.querySelector<HTMLElement>('nav.ui-tools')): number {
  if (!nav) return 0;
  let wanted = 0;
  for (const head of nav.querySelectorAll<HTMLElement>('.ui-tool-head')) {
    const label = head.querySelector<HTMLElement>('.ui-tool-head-name') ?? head;
    // The name on one line, whatever it takes on screen now (a name that has dropped to two lines still asks for its whole width).
    const before = label.style.cssText;
    label.style.whiteSpace = 'nowrap';
    label.style.display = 'block';
    label.style.setProperty('-webkit-line-clamp', 'none');
    const range = document.createRange();
    range.selectNodeContents(label);
    const cs = getComputedStyle(label);
    const text = range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    label.style.cssText = before;
    // Whatever else shares the row (the fold arrow while the tools are being changed).
    wanted = Math.max(wanted, text + (head.offsetWidth - label.offsetWidth));
  }
  return wanted;
}

/**
 * The width that shows every group name whole. Done again on a rail that is already that wide, it goes back to the
 * natural width, so one gesture (double-click on the edge) is both ways.
 */
export function fitToolRailNames(): void {
  if (refuseIfLocked('tools', 'size')) return;
  const s = railSizesNow();
  const style = getPrefs().toolRail;
  const wanted = wantedNamesWidth();
  if (!wanted) return void toast('There are no group names to fit. Turn on Group names in Change the tools.', { duration: 2600, quill: null });
  const names = getPrefs().toolNames;
  const fit = fitRailWidth(wanted, s, style, names);
  const usual = naturalRailWidth(s, style, names);
  if (fit === usual && toolRailWidth() === usual) return void toast('Every group name already shows whole.', { duration: 2200, quill: null });
  setToolRailWidth(toolRailWidth() === fit ? usual : fit);
}

/** The preferences "Put the tools back" puts back with the arrangement. */
const TOOL_PREF_KEYS = ['toolSize', 'toolNames', 'toolRail', 'toolsOffLayer'] as const;

/**
 * Puts it all back the way it comes: this workspace's groups, their names, what was hidden or folded, and the button
 * size, group names, rail style and what to do with tools that do not work on the layer. A toast offers Undo, because it undoes more than one thing.
 */
export function putToolsBack(): void {
  if (refuseIfLocked('tools', 'reset')) return;
  const d = dock.get();
  const id = d.workspaceId;
  const before = d.rails?.[id];
  const beforeWidth = d.railWidths?.[id];
  const p = getPrefs();
  const prefs = Object.fromEntries(TOOL_PREF_KEYS.map((k) => [k, p[k]]));
  if (!toolbarIsChanged()) return void toast('The tools are already the way they come.', { duration: 1800 });
  resetToolArrangement();
  resetToolRailWidth();
  setPrefs(Object.fromEntries(TOOL_PREF_KEYS.map((k) => [k, DEFAULT_PREFS[k]])));
  toast('The tools are back the way they come.', {
    kind: 'success',
    action: {
      label: 'Undo',
      run: () => {
        // Only in the workspace it was done in: if you moved on, leave that one alone.
        if (dock.get().workspaceId === id && before) setToolGroups(before);
        if (dock.get().workspaceId === id && beforeWidth) setRailWidth(beforeWidth);
        setPrefs(prefs);
      },
    },
  });
}

// ---------------------------------------------------------------- dragging a tool

/** What the drop would be shown as: a bar before or after a tool, a group lit up, or a gap between groups opened. */
export type DropMark = { kind: 'before' | 'after'; tool: string } | { kind: 'group'; group: string } | { kind: 'gap'; at: number } | { kind: 'shelf' };

export interface ToolDragState {
  id: string;
  x: number;
  y: number;
  drop: ToolDrop | null;
  mark: DropMark | null;
}

export const toolDrag = createStore<ToolDragState | null>(null);

/**
 * What letting go at a point would do, from what is under it. The views mark their parts with data attributes:
 * data-tool-id (a tool, inside a data-tool-axis box that says which way tools run), data-tool-group (a whole group,
 * drop at its end) and data-tool-gap (the space between groups, drop to start a group of its own).
 * `groups` is what shows, so "after a tool" means before the next one showing.
 */
export function hitTool(x: number, y: number, groups: ToolGroup[], dragged: string): { drop: ToolDrop; mark: DropMark } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const tool = el.closest<HTMLElement>('[data-tool-id]');
    if (tool && tool.dataset.toolId) {
      const id = tool.dataset.toolId;
      if (id === dragged) return null;
      const g = groups.find((gr) => gr.tools.includes(id));
      if (!g) return null;
      const r = tool.getBoundingClientRect();
      const axis = tool.closest<HTMLElement>('[data-tool-axis]')?.dataset.toolAxis === 'y';
      const after = axis ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      if (!after) return { drop: { group: g.id, before: id }, mark: { kind: 'before', tool: id } };
      const next = g.tools.filter((t) => t !== dragged)[g.tools.filter((t) => t !== dragged).indexOf(id) + 1] ?? null;
      return { drop: { group: g.id, before: next }, mark: { kind: 'after', tool: id } };
    }
    if (el.closest('[data-tool-shelf]')) return { drop: { away: true }, mark: { kind: 'shelf' } };
    const gap = el.closest<HTMLElement>('[data-tool-gap]');
    if (gap) {
      const at = Number(gap.dataset.toolGap);
      return { drop: { newGroupAt: at }, mark: { kind: 'gap', at } };
    }
    const group = el.closest<HTMLElement>('[data-tool-group]');
    if (group?.dataset.toolGroup) return { drop: { group: group.dataset.toolGroup, before: null }, mark: { kind: 'group', group: group.dataset.toolGroup } };
  }
  return null;
}

/** Pointer down on a tool: a click still picks it; carrying it past a few pixels lifts it to be put somewhere else. */
export function startToolDrag(e: React.PointerEvent, id: string, groups: () => ToolGroup[], visible: (id: string) => boolean, onLift?: () => void): void {
  // A locked rail still lets you press a tool to use it; carrying one is where it says no.
  if (railLocked()) return refuseDrag(e, 'tools', 'arrange');
  run(
    e,
    (ev) => {
      const hit = hitTool(ev.clientX, ev.clientY, groups(), id);
      toolDrag.set({ id, x: ev.clientX, y: ev.clientY, drop: hit?.drop ?? null, mark: hit?.mark ?? null });
    },
    (_ev, ok) => {
      const d = toolDrag.get();
      toolDrag.set(null);
      if (ok && d?.drop) {
        moveToolTo(id, d.drop, visible);
        teachLock('tools', () => setRailLock(true));
      }
    },
    onLift,
  );
}

/**
 * Takes you to a layer a waiting tool works on and picks the tool: the top layer of that kind. With none, says why the
 * tool isn't there and what to do (the same words a greyed-out tool gives).
 */
export function goToLayerFor(w: WaitingTool): void {
  const { doc } = store().get();
  const layer = [...doc.layers].reverse().find((l) => l.kind === w.needs);
  const tool = getTool(w.id);
  if (!layer || !tool) return void toast(whyOff({ label: w.label, layers: [w.needs] }, w.needs === 'pixel' ? 'vector' : 'pixel'), { quill: null });
  store().setUi({ activeLayerId: layer.id });
  pickTool(w.id);
}

/** What the rail's "waiting" button opens: the tools that need the other kind of layer, each one a way to get there, and a way to see them greyed out instead. */
export function waitingMenu(list: WaitingTool[]): DockMenuItem[] {
  const needs = list[0]?.needs ?? 'vector';
  return [
    { heading: `Waiting for a ${needs} layer` },
    ...list.map((w): DockMenuItem => ({ label: `${w.label}: go to a ${needs} layer`, onClick: () => goToLayerFor(w) })),
    { separator: true },
    { label: 'Show them greyed out instead', onClick: () => setPrefs({ toolsOffLayer: 'grey' }) },
    { label: 'Why are they not on the strip?', onClick: () => openHelp('tool-strip') },
  ];
}
