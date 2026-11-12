// Commands for the dock: float and move panels, move the tool rail, hide all panels, step between workspaces, share one.
// "This panel" is the one you last clicked in or tabbed into.
import { getPanel, registerCommand, registerCommands } from '../core/registry';
import { dock, dockEverythingBack, floatPanel, isVisible, panelsAway, panelTitle, placeOf, placePanel, placeTools, togglePanelsAway } from './dock';
import { ZONES, type DockZone, type ToolsPlace } from './dockModel';
import { askRename } from './dockMenus';
import { lastPanel } from './dockShared';
import { openPrefs } from './overlays';
import { getPrefs, setPrefs } from './prefs';
import { toast } from './toast';
import { isCustomArrangement, resetToolArrangement } from './toolRail';
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
  id: 'view.toolsReset',
  label: 'Reset tools to default',
  category: 'View',
  description: 'Put the tools back in their usual groups and order.',
  help: 'tool-strip',
  keywords: ['tools', 'toolbar', 'group', 'order', 'arrange', 'rearrange'],
  enabled: () => isCustomArrangement(),
  run: () => {
    resetToolArrangement();
    toast('Tools are back in their usual groups.', { duration: 1800 });
  },
});
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
