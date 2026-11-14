// Commands for the dock: float and move panels, move the tool rail, hide all panels, step between workspaces, share one.
// "This panel" is the one you last clicked in or tabbed into.
import { getPanel, registerCommand, registerCommands } from '../core/registry';
import { dock, dockEverythingBack, floatPanel, isVisible, joinGroups, panelsAway, panelTitle, placeOf, placePanel, placeTools, togglePanelsAway } from './dock';
import { SPLIT_WORDS } from './dockDrag';
import { groupCount, groupTabs, MAX_GROUPS, toolsHome, ZONES, type DockZone, type ToolsPlace } from './dockModel';
import { askRename } from './dockMenus';
import { lastPanel } from './dockShared';
import { openPrefs } from './overlays';
import { getPrefs, setPrefs } from './prefs';
import { toast } from './toast';
import { store } from '../core/store';
import { askGroupRename, bringToolBack, currentGroups, foldToolGroup, putToolAway, putToolsBack, setToolbarEditing, startToolGroupHere, toolbarEditing, toolbarIsChanged, joinToolGroupAbove, fitToolRailNames, isCustomWidth, resetToolRailWidth, stepToolRail } from './toolRail';
import { copyWorkspaceText, exportWorkspaceFile, importWorkspaceFile, pasteWorkspaceText, stepWorkspace } from './workspaceActions';

/** The panel the "this panel" commands act on: the one last worked in, if it is still showing. */
function thisPanel(): string | null {
  const id = lastPanel.get();
  if (id && getPanel(id) && isVisible(id)) return id;
  toast('Click inside a panel first, then try again.', { kind: 'info' });
  return null;
}

const WHERE: Record<DockZone, string> = { left: 'the left side', right: 'the right side', bottom: 'the bottom', top: 'the top' };

registerCommands([
  {
    id: 'view.floatPanel',
    label: 'Float this panel',
    category: 'View',
    keys: ['Mod+Shift+\\'],
    description: 'Give the panel you are working in a window of its own, over the canvas.',
    help: 'floating-windows',
    keywords: ['window', 'detach', 'undock', 'pop out', 'panel'],
    run: () => {
      const id = thisPanel();
      if (!id) return;
      const at = placeOf(id);
      if (at && 'float' in at) return void toast('That panel already has a window.');
      floatPanel(id);
    },
  },
  {
    id: 'view.renamePanel',
    label: 'Rename this panel...',
    category: 'View',
    description: 'Give the panel you are working in a name of your own.',
    help: 'floating-windows',
    keywords: ['name', 'label', 'panel', 'tab'],
    run: () => {
      const id = thisPanel();
      if (id) askRename('panel', id, Math.round(window.innerWidth / 2 - 130), 120);
    },
  },
  {
    id: 'view.splitPanelGroup',
    label: 'Put this panel in its own group',
    category: 'View',
    description: 'Give the panel you are working in a group of its own on the same side, stacked under the others with its own tabs.',
    help: 'panels',
    keywords: ['stack', 'split', 'group', 'tabs', 'below', 'beside', 'panel', 'layers', 'colours'],
    run: () => {
      const id = thisPanel();
      if (!id) return;
      const at = placeOf(id);
      const l = dock.get().layout;
      if (!at || !('zone' in at)) return void toast('Dock the panel on a side first. Windows have no groups.');
      if (groupTabs(l, at).length === 1) return void toast('That panel is already a group of its own.');
      if (groupCount(l.zones[at.zone]) >= MAX_GROUPS) return void toast(`A side holds up to ${MAX_GROUPS} groups.`);
      placePanel(id, { zone: at.zone, group: at.group ?? 0, split: 'after' });
      toast(`${panelTitle(id)} has its own group, ${SPLIT_WORDS[at.zone].after}.`, { duration: 1800 });
    },
  },
  {
    id: 'view.joinPanelGroups',
    label: 'Join this side into one group',
    category: 'View',
    description: 'Put every stacked group on the side of the panel you are working in back into one set of tabs.',
    help: 'panels',
    keywords: ['stack', 'merge', 'group', 'tabs', 'unstack', 'panel'],
    run: () => {
      const id = thisPanel();
      if (!id) return;
      const at = placeOf(id);
      if (!at || !('zone' in at) || groupCount(dock.get().layout.zones[at.zone]) < 2) return void toast('That side is already one group.');
      joinGroups(at.zone);
    },
  },
  {
    id: 'view.dockAllWindows',
    label: 'Dock every floating window back',
    category: 'View',
    description: 'Put every panel that is floating back where it started.',
    help: 'floating-windows',
    keywords: ['windows', 'float', 'tidy', 'panels'],
    enabled: () => dock.get().layout.floats.length > 0,
    run: () => dockEverythingBack(),
  },
  {
    id: 'view.hidePanels',
    label: 'Hide all panels',
    category: 'View',
    keys: ['Mod+\\'],
    description: 'Put every panel away for room to draw. Press it again to bring them back.',
    help: 'panels',
    keywords: ['focus', 'full screen', 'clear', 'toggle', 'canvas', 'room'],
    checked: () => panelsAway.get(),
    run: () => togglePanelsAway(),
  },
  {
    id: 'view.nextWorkspace',
    label: 'Next workspace',
    category: 'View',
    description: 'Switch to the next workspace in the list.',
    help: 'workspaces',
    keywords: ['layout', 'panels', 'cycle', 'switch'],
    run: () => stepWorkspace(1),
  },
  {
    id: 'view.previousWorkspace',
    label: 'Previous workspace',
    category: 'View',
    description: 'Switch to the workspace before this one in the list.',
    help: 'workspaces',
    keywords: ['layout', 'panels', 'cycle', 'switch', 'back'],
    run: () => stepWorkspace(-1),
  },
  {
    id: 'view.manageWorkspaces',
    label: 'Manage workspaces...',
    category: 'View',
    description: 'Switch, rename, reorder, share and delete your workspaces.',
    help: 'workspaces',
    keywords: ['layout', 'panels', 'save', 'rename', 'delete', 'order'],
    run: () => openPrefs('workspaces'),
  },
  {
    id: 'view.exportWorkspace',
    label: 'Save this layout as a workspace file...',
    category: 'View',
    description: 'Save the way your panels are arranged as a small file to share or keep.',
    help: 'workspaces',
    keywords: ['export', 'share', 'file', 'layout', 'send'],
    run: () => exportWorkspaceFile(),
  },
  {
    id: 'view.importWorkspace',
    label: 'Add a workspace from a file...',
    category: 'View',
    description: 'Open a workspace file someone sent you and add it to your list.',
    help: 'workspaces',
    keywords: ['import', 'share', 'file', 'layout', 'open'],
    run: () => void importWorkspaceFile(),
  },
  {
    id: 'view.copyWorkspace',
    label: 'Copy this layout as text',
    category: 'View',
    description: 'Copy the way your panels are arranged as text you can paste into a message.',
    help: 'workspaces',
    keywords: ['export', 'share', 'clipboard', 'layout'],
    run: () => void copyWorkspaceText(),
  },
  {
    id: 'view.pasteWorkspace',
    label: 'Add a workspace from text',
    category: 'View',
    description: 'Add a workspace from text you copied, to your list.',
    help: 'workspaces',
    keywords: ['import', 'share', 'clipboard', 'paste', 'layout'],
    run: () => {
      void pasteWorkspaceText().then((ok) => {
        if (!ok) openPrefs('workspaces');
      });
    },
  },
]);

for (const z of ZONES) {
  registerCommand({
    id: `view.movePanel.${z}`,
    label: `Move this panel to ${WHERE[z]}`,
    category: 'View',
    description: `Move the panel you are working in to ${WHERE[z]}.`,
    help: 'floating-windows',
    keywords: ['dock', 'panel', 'place', z],
    run: () => {
      const id = thisPanel();
      if (!id) return;
      placePanel(id, { zone: z });
      toast(`${panelTitle(id)} moved to ${WHERE[z]}.`, { duration: 1800 });
    },
  });
}

const TOOL_WORDS: Record<ToolsPlace, string> = { left: 'Put the tools on the left', right: 'Put the tools on the right', top: 'Put the tools along the top', bottom: 'Put the tools along the bottom', float: 'Float the tools' };
for (const p of [...ZONES, 'float'] as ToolsPlace[]) {
  registerCommand({
    id: `view.toolsPlace.${p}`,
    label: TOOL_WORDS[p],
    category: 'View',
    description: p === 'float' ? 'Make the tool strip a small window you can drag around.' : 'Dock the tool strip on this side of the canvas.',
    help: 'floating-windows',
    keywords: ['tools', 'toolbar', 'strip', 'move', p],
    checked: () => dock.get().layout.tools.place === p,
    run: () => placeTools(p, p === 'float' ? { x: 90, y: 110 } : undefined),
  });
}

registerCommand({
  id: 'view.toolsHome',
  label: 'Dock the tools back where they were',
  category: 'View',
  description: 'Put a floating tool strip back on the side it was last docked on. You can also drag its grip there.',
  help: 'tool-strip',
  keywords: ['tools', 'toolbar', 'strip', 'dock', 'float', 'back', 'return', 'undock', 'home'],
  enabled: () => dock.get().layout.tools.place === 'float',
  run: () => placeTools(toolsHome(dock.get().layout)),
});

registerCommand({
  id: 'view.toolGroupRename',
  label: 'Rename the group of the tool in use...',
  category: 'View',
  description: 'Give the tool group the picked tool belongs to a name of your own. It is kept with this workspace.',
  help: 'tool-arrange',
  keywords: ['tools', 'toolbar', 'group', 'name', 'rename', 'label', 'rail'],
  run: () => {
    const tool = store().get().ui.tool;
    const g = currentGroups().find((x) => x.tools.includes(tool));
    if (g) askGroupRename(g.id);
  },
});

registerCommand({
  id: 'view.toolsReset',
  label: 'Put the tools back',
  category: 'View',
  description: 'Put this workspace\'s tools back the way they come: groups, names, hidden and folded tools, button size, group names and rail style. Undo is on the message.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'group', 'order', 'arrange', 'rearrange', 'reset', 'default', 'restore', 'undo changes'],
  enabled: () => toolbarIsChanged(),
  run: putToolsBack,
});

registerCommand({
  id: 'view.toolbarBuilder',
  label: 'Change the tools',
  category: 'View',
  description: 'Name groups, make your own, move tools between them, put away the ones you never use, fold a group into one button and set the button size.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'tool rail', 'customise', 'customize', 'edit', 'builder', 'groups', 'hide', 'fold', 'size', 'rearrange', 'arrange', 'divider'],
  checked: () => toolbarEditing.get(),
  run: () => setToolbarEditing(),
});

/** The group of the tool in use, for the commands that act on "this group". */
const groupInUse = () => {
  const tool = store().get().ui.tool;
  const groups = currentGroups();
  return { tool, group: groups.find((x) => x.tools.includes(tool)) };
};

registerCommand({
  id: 'view.toolHide',
  label: 'Hide the tool in use from the rail',
  category: 'View',
  description: 'Put the picked tool away. It keeps its key and its place in the command search, and Change the tools brings it back.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'hide', 'put away', 'remove', 'declutter'],
  run: () => putToolAway(store().get().ui.tool),
});

registerCommand({
  id: 'view.toolsShowAll',
  label: 'Bring back the tools put away',
  category: 'View',
  description: 'Put every hidden tool back on the rail, in the place it had.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'hide', 'show', 'unhide', 'put away', 'restore'],
  enabled: () => currentGroups().some((g) => g.hidden?.length),
  run: () => bringToolBack(),
});

registerCommand({
  id: 'view.toolGroupFold',
  label: 'Fold the group of the tool in use into one button',
  category: 'View',
  description: 'The group becomes one button, with the rest behind it (press and hold). Run it again to open the group out.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'group', 'fold', 'collapse', 'stack', 'one button', 'flyout'],
  checked: () => !!groupInUse().group?.fold,
  enabled: () => getPrefs().toolRail === 'two',
  run: () => {
    const g = groupInUse().group;
    if (g) foldToolGroup(g.id, !g.fold);
  },
});

registerCommand({
  id: 'view.toolGroupStart',
  label: 'Start a new tool group at the tool in use',
  category: 'View',
  description: 'Put a divider before the picked tool: it and the ones after it in its group become a group of their own.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'group', 'divider', 'split', 'new group', 'separator'],
  run: () => startToolGroupHere(groupInUse().tool),
});

registerCommand({
  id: 'view.toolGroupJoin',
  label: 'Join the tool group of the tool in use to the one above',
  category: 'View',
  description: 'Take the divider above the picked tool\'s group away.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'group', 'divider', 'join', 'merge', 'separator'],
  run: () => {
    const g = groupInUse().group;
    if (g) joinToolGroupAbove(g.id);
  },
});

for (const size of ['small', 'medium', 'large'] as const) {
  registerCommand({
    id: `view.toolSize.${size}`,
    label: `Tool buttons: ${size}`,
    category: 'View',
    description: 'How big the buttons on the tool rail are.',
    help: 'tool-builder',
    keywords: ['tools', 'toolbar', 'size', 'bigger', 'smaller', 'icons', 'buttons', 'zoom', size],
    checked: () => getPrefs().toolSize === size,
    run: () => setPrefs({ toolSize: size }),
  });
}

for (const [way, label, about] of [
  ['hide', 'Tools that do not work here: hide them', 'Leave a tool off the rail when it does not work on the layer you are on. The rail is shorter, and the places of the others stay put.'],
  ['grey', 'Tools that do not work here: grey them out', 'Keep every tool in its place and grey out the ones that do not work on the layer you are on.'],
] as const) {
  registerCommand({
    id: `view.toolsOffLayer.${way}`,
    label,
    category: 'View',
    description: about,
    help: 'tool-builder',
    keywords: ['tools', 'toolbar', 'grey', 'gray', 'greyed', 'hide', 'disabled', 'pixel layer', 'vector layer', 'layer kind', 'rail'],
    checked: () => getPrefs().toolsOffLayer === way,
    run: () => setPrefs({ toolsOffLayer: way }),
  });
}

registerCommand({
  id: 'view.toolNames',
  label: 'Show group names on the tool rail',
  category: 'View',
  description: 'Put each group\'s name above it. A group you made and never named stays a plain divider.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'group', 'names', 'labels', 'headings', 'rail'],
  checked: () => getPrefs().toolNames,
  run: () => setPrefs({ toolNames: !getPrefs().toolNames }),
});

// The width of the tool rail, which can also be pulled by its inner edge. Only a rail docked at a side has one.
const railAtSide = (): boolean => {
  const at = dock.get().layout.tools.place;
  return at === 'left' || at === 'right';
};
for (const [id, label, about, run] of [
  ['view.toolRailWider', 'Tool rail: wider', 'One more button across, and more of the group names showing. You can also drag the rail\'s inner edge.', () => stepToolRail(1)],
  ['view.toolRailNarrower', 'Tool rail: narrower', 'One button fewer across, down to icons alone. You can also drag the rail\'s inner edge.', () => stepToolRail(-1)],
  ['view.toolRailFit', 'Tool rail: fit the group names', 'The width that shows every group name whole. Run it again to go back to the usual width. Double-click the rail\'s inner edge does the same.', fitToolRailNames],
] as const) {
  registerCommand({
    id,
    label,
    category: 'View',
    description: about,
    help: 'tool-builder',
    keywords: ['tools', 'toolbar', 'rail', 'width', 'wider', 'narrower', 'resize', 'group names', 'titles', 'fit', 'drag'],
    enabled: railAtSide,
    run,
  });
}
registerCommand({
  id: 'view.toolRailWidthReset',
  label: 'Tool rail: back to its usual width',
  category: 'View',
  description: 'Two buttons across, or one in the one-per-group style, however far you pulled the rail.',
  help: 'tool-builder',
  keywords: ['tools', 'toolbar', 'rail', 'width', 'reset', 'default', 'usual', 'resize'],
  enabled: () => railAtSide() && isCustomWidth(),
  run: resetToolRailWidth,
});

// How the workspace switcher beside the drawing's name looks (see WorkspaceSwitcher.tsx).
for (const [look, label, about] of [
  ['tabs', 'Workspace switcher: tabs', 'Every workspace as a small tab beside the drawing name, the one you are in lit up.'],
  ['chip', 'Workspace switcher: just the name', 'One chip with the workspace you are in. Press it for the list.'],
  ['off', 'Workspace switcher: hide it', 'Leave the top bar clear. Switch from View, or the command search.'],
] as const) {
  registerCommand({
    id: `view.workspaceSwitcher.${look}`,
    label,
    category: 'View',
    description: about,
    help: 'workspace-switcher',
    keywords: ['workspace', 'layout', 'tabs', 'chip', 'top bar', 'draw', 'animate', 'pixel', 'show', 'hide'],
    checked: () => getPrefs().workspaceSwitcher === look,
    run: () => setPrefs({ workspaceSwitcher: look }),
  });
}
for (const [style, label, about] of [
  ['two', 'Tool rail: show every tool, two wide', 'Every tool in groups, two across. Drag them to arrange.'],
  ['stacked', 'Tool rail: one button per group', 'One button per group. Press and hold, or right-click, for the rest of the group.'],
] as const) {
  registerCommand({
    id: `view.toolRail.${style}`,
    label,
    category: 'View',
    description: about,
    help: 'tool-strip',
    keywords: ['tools', 'toolbar', 'rail', 'style', 'stacked', 'two wide', 'flyout'],
    checked: () => getPrefs().toolRail === style,
    run: () => setPrefs({ toolRail: style }),
  });
}
