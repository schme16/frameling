// Commands the menus leave out on purpose, because a control on screen already does the same job and a menu of fifty
// near-copies of it makes the menu harder to read. Each one is still in the command palette, still found by the same
// words, and keeps any shortcut it had. The value says where the same control lives, in plain words.
//
// This is not a place to park a command with no way in: a test (test/ui/leftOutOfMenus.test.ts) fails unless a
// component on screen names every id here (a control carrying `data-command`), and the reachability audit still counts
// the palette alone as no way in. To put one back, delete its line and name it in a menu in menus.ts.
export const LEFT_OUT_OF_MENUS: Record<string, string> = {
  // The snapping options (the Snap button on the status bar, View > Snapping options, Preferences > Snapping) hold a tick for each.
  ...Object.fromEntries(
    ['grid', 'guides', 'page', 'centre', 'points', 'shapes', 'draw', 'allLayers', 'artboards', 'spacing', 'angles', 'perspective', 'cells', 'plugins'].map((k) => [
      `view.snap.${k}`,
      'A tick in the snapping options',
    ]),
  ),
  // Change the tools: the builder has a row for each of these.
  'view.toolSize.small': 'Button size, in Change the tools',
  'view.toolSize.medium': 'Button size, in Change the tools',
  'view.toolSize.large': 'Button size, in Change the tools',
  'view.toolNames': 'Group names, in Change the tools',
  'view.toolsOffLayer.hide': 'Tools that do not work on this layer, in Change the tools',
  'view.toolsOffLayer.grey': 'Tools that do not work on this layer, in Change the tools',
  'view.toolRail.two': 'Rail style, in Change the tools',
  'view.toolRail.stacked': 'Rail style, in Change the tools',
  'view.toolsShowAll': 'Bring them all back, in Change the tools',
  // Grid and perspective settings has the same choices as buttons and a tick.
  'view.gridIso': 'Grid, in Grid and perspective settings',
  'view.perspective1': 'Perspective, in Grid and perspective settings',
  'view.perspective2': 'Perspective, in Grid and perspective settings',
  'view.removePerspective': 'Perspective, in Grid and perspective settings',
  'view.showPerspective': 'Show the perspective guides, in Grid and perspective settings',
  // The Notes panel and the Notes tool options.
  'notes.previous': 'Previous, in the Notes panel',
  'notes.next': 'Next, in the Notes panel',
  'notes.clearDone': 'Remove done, in the Notes panel',
  // The Marks tool options: the pen choice and the two clear buttons.
  'marks.arrow': 'Draw, in the Marks tool options',
  'marks.circle': 'Draw, in the Marks tool options',
  'marks.scribble': 'Draw, in the Marks tool options',
  'marks.text': 'Draw, in the Marks tool options',
  'marks.erase': 'Draw, in the Marks tool options',
  'marks.clearFrame': 'Clear this frame, in the Marks tool options',
  'marks.clearAll': 'Clear all, in the Marks tool options',
  // The right-click menu on a panel tab or a window.
  'view.floatPanel': 'Move to its own window, in the right-click menu of a panel',
  'view.renamePanel': 'Rename, in the right-click menu of a panel',
  'view.splitPanelGroup': 'Move to a new group, in the right-click menu of a panel',
  'view.joinPanelGroups': 'Join this side into one group, in the right-click menu of a panel',
  'view.dockAllWindows': 'Dock every window back, in the right-click menu of a window',
};

/** True for a command the menus do not list, so it does not turn up at the bottom of its menu either. */
export const isLeftOutOfMenus = (id: string): boolean => id in LEFT_OUT_OF_MENUS;
