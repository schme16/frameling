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
  // The gradient kind buttons (Colours panel, and the Gradient tool's options on a pixel layer) hold Angular already,
  // and the Tools menu is at its cap, so the buttons are the way in and the palette keeps the words.
  'colors.angular': 'The Angular button, in the Colours panel',
  'pixel.gradientAngular': 'Angular, in Shape in the Gradient tool options',
  // Diamond went the same way for the same reason.
  'colors.diamond': 'The Diamond button, in the Colours panel',
  'pixel.gradientDiamond': 'Diamond, in Shape in the Gradient tool options',
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
  // The tool rail: every tool is a button on it (a flyout for the ones grouped under another), wherever the Tools menu used to list it.
  // Five tools are not on the Pixel workspace's rail on a pixel layer; they stay in the menu (TOOLS_OFF_THE_PIXEL_RAIL in menus.ts).
  ...Object.fromEntries(
    [
      'select', 'select-lasso', 'select-polygon', 'select-magnetic', 'points',
      'pixel-select', 'pixel-select-lasso', 'pixel-select-polygon', 'pixel-select-magnetic', 'pixel-select-wand',
      'pencil', 'eraser', 'fill', 'shade', 'dither', 'gradient', 'eyedropper', 'text', 'shape-builder',
      'rect', 'ellipse', 'line', 'polygon', 'star', 'hand', 'zoom',
      'tile-brush', 'tile-rect', 'tile-fill', 'tile-eraser', 'tile-picker',
    ].map((k) => [`tools.${k}`, 'A button on the tool rail']),
  ),
  // Line style: the Dashes, arrows and width fold in the options of the Pen and the shape tools has a row for each.
  ...Object.fromEntries(['solid', 'dashed', 'dotted', 'dashdot'].map((k) => [`stroke.dash.${k}`, 'Line, in Dashes, arrows and width in the tool options'])),
  ...Object.fromEntries(['even', 'swell', 'pinch', 'taper', 'taperStart', 'brush'].map((k) => [`stroke.width.${k}`, 'Width along the line, in Dashes, arrows and width in the tool options'])),
  'stroke.arrow.start': 'Arrow at the start, in Dashes, arrows and width in the tool options',
  'stroke.arrow.end': 'Arrow at the end, in Dashes, arrows and width in the tool options',
  // The rows of a tool's own options.
  'pixel.mirror': 'Mirror drawing, in the options of every drawing tool',
  'pixel.gradientColours': 'Colours, in the Gradient tool options on a pixel layer',
  'pixel.gradientDither': 'Dither, in the Gradient tool options on a pixel layer',
  'pixel.gradientRadial': 'Shape, in the Gradient tool options on a pixel layer',
  'eraser.bit': 'Rub out, in the Eraser options',
  'select.scope': 'Picks, in the Select options',
  'draw.moreBrushOptions': 'More brush options, in the Brush options',
  'draw.toggleMerge': 'Merge shapes together, in the options of every vector drawing tool',
  'draw.holdToTidy': 'Hold to tidy, in the Brush and Pencil options',
  'select.flipH': 'Flip left-right, in the Select options',
  'select.flipV': 'Flip up-down, in the Select options',
  'arrange.forward': 'Bring forward, in the Select options',
  'arrange.backward': 'Send back, in the Select options',
  'transform.apply': 'Apply, in the Transform options',
  'transform.putBack': 'Put back, in the Transform options',
  'transform.pivotMiddle': 'Pivot to the middle, in the Transform options',
  // The Text panel, which opens when text is picked.
  'text.onPath': 'Put on a curve, in the Text panel',
  'text.offPath': 'Take off the curve, in the Text panel',
  'text.toShapes': 'Convert to shapes, in the Text panel',
  // Recolour: one entry opens the dialog, and its Where row (everything, this layer, this frame, the selection) does the rest.
  'colors.recolourLayer': 'This layer, in the Where row of the Recolour dialog',
  'colors.recolourFrame': 'This frame, in the Where row of the Recolour dialog',
  'colors.recolourSelection': 'The selection, in the Where row of the Recolour dialog',
  // The brush tips: each tip is a row in the Tip picker in the Brush options (every stamp shape is the Stamp row), and the
  // buttons that take a drawing from the selection are in the options of the tip that uses it. Next and previous tip (keys
  // only) and Turn brush lines into plain shapes have no control on screen, so they stay in the Brush tips menu.
  ...Object.fromEntries(['plain', 'chalk', 'charcoal', 'watercolour', 'stamp', 'nib', 'along', 'edged', 'bristle'].map((k) => [`brush.tip.${k}`, 'The Tip picker, in the Brush options'])),
  'brush.fromSelection': 'Brush from selection, in the Brush options and the pixel brush options',
  'brush.makeAlong': 'Use the selection as the drawing, in the Along the line tip options',
  ...Object.fromEntries(['sides', 'start', 'end', 'inner', 'outer'].map((k) => [`brush.edged.${k}`, 'Use selection, in the parts of the Edged tip options'])),
  'brush.backToHowItCame': 'The Back to how it came button, under Parts of this brush in the Brush options',
  'brush.resetTip': 'The small reset beside Tip, under Parts of this brush in the Brush options',
  'brush.resetStick': 'The small reset beside Stick, under Parts of this brush in the Brush options',
  'brush.pixelReset': 'Back to the usual brush, in the pixel brush options',
  // The pixel brush's picture tip, grain and dual tip: each is a button in its own part of the pixel brush options, and the
  // Draw menu is better short.
  'pixelbrush.picture.edit': 'Draw a picture... or Edit the picture..., in the pixel brush options when Tip is Picture',
  'pixelbrush.picture.file': 'From a picture file..., in the pixel brush options when Tip is Picture',
  'pixelbrush.grain.picture': 'Use a picture as the paper..., in the Paper box of the pixel brush options',
  'pixelbrush.dual.picture': 'Use a picture for the dots..., in the Dual tip fold of the pixel brush options',
  // The right-click menu on a panel tab or a window.
  'view.floatPanel': 'Move to its own window, in the right-click menu of a panel',
  'view.renamePanel': 'Rename, in the right-click menu of a panel',
  'view.splitPanelGroup': 'Move to a new group, in the right-click menu of a panel',
  'view.joinPanelGroups': 'Join this side into one group, in the right-click menu of a panel',
  'view.dockAllWindows': 'Dock every window back, in the right-click menu of a window',
};

/** True for a command the menus do not list, so it does not turn up at the bottom of its menu either. */
export const isLeftOutOfMenus = (id: string): boolean => id in LEFT_OUT_OF_MENUS;
