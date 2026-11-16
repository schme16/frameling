// The menu bar, as lists of command ids. Menus are built from the registry: an id nobody has registered is simply
// left out, so a feature that isn't there yet never leaves a dead entry. Commands that register under a menu's
// categories and aren't listed anywhere turn up at the bottom of that menu on their own.
import { allCommands, allPanels, allTools, getCommand, type Command } from '../core/registry';
import { isDynamicCommand, isStaleCommand, syncDynamicCommands, toolEnabled } from './dynamic';
import { oneOfEach } from './toolTwins';
import { listWorkspaces } from './dock';
import { ownedUndo } from '../core/owners';
import { currentChoice } from '../core/choices';
import { animationKind } from '../core/animationGate';
import { isAnimated } from '../core/animation';
import { store } from '../core/store';
import { getMenuEdits } from './menuState';
import { shapeMenus, type NewEntries, type Shape } from './menuEdits';
import { isLeftOutOfMenus } from './paletteFirst';

export type MenuEntry = string;

/** The words for a menu on screen. */
export const menuTitle = (m: Pick<MenuDef, 'label' | 'title'>): string => m.title ?? m.label;

export interface MenuDef {
  /** The menu's id: features add items by this name, so it stays put even when the words on screen change. */
  label: string;
  /** What the menu bar and screen readers say, when that isn't the id. Says what is in the menu, not a workspace's name. */
  title?: string;
  items: MenuEntry[];
  /** Registered commands in these categories that aren't named anywhere else show up at the end. */
  categories: string[];
  /** The list is already final (the person changed it, and what features added is in it): add nothing to it. */
  fixed?: boolean;
  /** Tool ids a `group:tools` in this list skips, because each one is listed where its own feature is. */
  leaveOut?: readonly string[];
}

/**
 * Tools that the Tools menu leaves out, so that list is the ones you draw and select with. Each is in the menu of the
 * feature it belongs to (the skeleton tools in Skeleton, the motion tools in In-betweens, Notes and Marks in View), and
 * on the tool rail and in the palette as ever. A test checks each one is named somewhere else.
 */
export const TOOLS_WITH_THEIR_FEATURE: readonly string[] = [
  'tools.bone', 'tools.bone-edit', 'tools.bone-remove', 'tools.pose', 'tools.weights',
  'tools.motion-path', 'tools.shape-hints', 'tools.record-move',
  'tools.notes', 'tools.marks',
  // The pixel tools that fade at the edge, chalk and charcoal, and the pixel brush, sit in the Soft paint menu.
  'tools.soft-brush', 'tools.airbrush', 'tools.highlighter', 'tools.soft-eraser', 'tools.smudge', 'tools.charcoal', 'tools.pixel-brush',
];

const RIG_ITEMS: MenuEntry[] = [
  'rig.addBones', 'tools.bone', 'tools.bone-edit', 'tools.bone-remove', 'tools.pose', 'tools.weights', '-', 'rig.addChildBone', 'rig.renameBone', 'rig.pickParent', 'rig.pickChild', '-', 'rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', '-', 'rig.togglePin', 'rig.resetPose', 'rig.mirrorPose', 'rig.swapSides', 'rig.savePose', 'rig.grab.pin', 'rig.grab.stretch', 'rig.grab.turn', '-', 'rig.deleteBone', 'rig.deleteBranch', 'rig.boneLook', 'view.panel.rig'
];

const EFFECT_ITEMS: MenuEntry[] = [
  'view.panel.effects', '-', 'effects.add.blur', 'effects.add.glow', 'effects.add.shadow', 'effects.add.adjust', 'effects.add.outline', 'effects.add.pixelate', '-', 'effects.add.grain', 'effects.add.wave', 'effects.add.fringe', 'effects.add.vignette', 'effects.add.motionblur', 'effects.add.tooth', '-', 'effects.reset', 'effects.shapesReset', '-', 'particles.add.confetti', 'particles.add.dust', 'particles.add.rain', 'particles.add.smoke', 'particles.add.snow', 'particles.add.sparkle', 'particles.shuffle'
];

/** `-` is a separator. `group:tools`, `group:panels` and `group:workspaces` expand to every one registered. */
export const MENUS: MenuDef[] = [
  {
    label: 'File',
    categories: ['File', 'Export'],
    items: ['file.new', 'file.newCustom', 'pixel.new', 'file.open', 'file.openRecent', 'file.openPlayable', 'file.recover', '-', 'file.save', 'file.saveAs', 'file.sendCopy', 'file.shareCode', 'file.receiveCode', 'review.toggle', 'review.join', 'review.copyLink', 'review.card', 'review.bringIn', 'review.keep', 'review.addAsTheyCome', 'review.savePicture', 'file.saveVersion', 'file.versions', 'file.saveAsTemplate', 'file.importTemplate', '-', 'sub:export', 'sub:import', 'audio.import', '-', 'file.close', 'app.restart', '-', 'file.quit'],
  },
  {
    label: 'Edit',
    categories: ['Edit'],
    items: ['edit.undo', 'edit.redo', '-', 'view.panel.history', 'history.back', 'history.forward', '-', 'edit.cut', 'edit.copy', 'edit.copySvg', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'select.all', 'select.none', 'select.invert', 'sub:align', 'sub:nudge', 'sub:repeat', '-', 'document.settings', 'document.seeThrough', 'text.swapFonts', '-', 'view.preferences', 'view.penTablet', 'view.performance', 'sub:plugins', 'sub:scripts'],
  },
  {
    label: 'View',
    categories: ['View'],
    items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'sub:turnview', '-', 'group:workspaces', 'sub:workspaces', '-', 'sub:panels', 'sub:panelwin', 'sub:toolrail', '-', 'view.pixelGrid', 'view.rulers', 'view.guides', 'sub:snapping', 'sub:grids', 'sub:moreview', 'sub:notes', 'sub:marks', '-', 'sub:look', 'sub:sharing', 'sub:customise', 'view.searchSettings', 'view.commandPalette', 'sub:quill'],
  },
  {
    // The menu's id stays Draw (saved menu changes and plugins name it); the bar says Tools.
    label: 'Draw',
    title: 'Tools',
    categories: ['Draw', 'Drawing', 'Tools', 'Select', 'Selection', 'Shape', 'Shapes', 'Geometry', 'Arrange', 'Pixel'],
    items: [
      'sub:tools', 'pixel.mirror', '-',
      'select.flipH', 'select.flipV', 'sub:arrange', '-',
      'sub:symbols', 'sub:shapes', 'sub:linestyle', 'sub:palette', '-',
      'sub:brushes', 'sub:brushtips', 'sub:toolopts',
    ],
  },
  {
    // Spray, soft paint, chalk and charcoal, and the pixel brush: thirty commands that took Tools over its cap of 150 when
    // the Pixel menu went. They are one family and they only work on a pixel layer, so they have a menu of their own.
    label: 'Soft',
    title: 'Soft paint',
    categories: [],
    items: ['tools.spray', '-', 'tools.soft-brush', 'tools.airbrush', 'tools.highlighter', 'tools.soft-eraser', 'tools.smudge', '-', 'sub:charcoal', 'sub:pixelbrush'],
  },
  {
    // The three things this menu is about come first, each a submenu: Layer, Artboards, Tiles. A tile layer is a layer,
    // so tilemaps live here, and a sprite's boards and frames and its shared layers are the general rows below them.
    label: 'Layers',
    title: 'Layers and artboards',
    categories: ['Layers'],
    items: [
      'sub:layer', 'sub:artboards', 'sub:tiles', '-',
      'pixel.shareLayers', 'pixel.unshareLayers', 'pixel.changeWay', 'pixel.boardsToFrames', 'pixel.framesToBoards', '-',
      'heading:Pixels and vectors', 'layers.draw.pixel', 'layers.draw.vector', 'layers.draw.swap', '-', 'layers.addHalf', 'layers.unpair', 'layers.deletePair', '-', 'layers.go.pixel', 'layers.go.vector', '-',
      'view.panel.layers',
    ],
  },
  {
    label: 'Animate',
    title: 'Animation',
    categories: ['Animate', 'Animation', 'Timeline', 'Frames', 'Sound', 'Lip sync'],
    items: ['animation.add', 'animation.remove', '-', 'timeline.play', 'timeline.toggleLoop', 'timeline.togglePingPong', '-', 'timeline.toggleOnion', 'sub:onion', '-', 'sub:range', 'sub:goto', '-', 'timeline.newKey', 'timeline.emptyFrame', 'timeline.duplicateKey', 'timeline.deleteKeys', 'sub:keys', 'sub:holds', 'sub:movedrawing', '-', 'timeline.insertFrame', 'timeline.removeFrame', 'sub:moreframes', '-', 'sub:tween', 'sub:readymotion', 'sub:camera', 'sub:clips', '-', 'sub:sound', 'sub:reference'],
  },
  {
    // The skeleton kit, flat in its own menu. The id stays Extras (saved menu changes name it). Tiles are not here:
    // a tile layer is a layer, so tilemaps live in Layers and artboards.
    label: 'Extras',
    title: 'Rigging',
    categories: ['Rig'],
    items: [...RIG_ITEMS],
  },
  {
    label: 'Effects',
    categories: ['Effects'],
    items: [...EFFECT_ITEMS],
  },
  {
    // Everything that is only for people who draw live: the audience tools, each part a submenu of its own so every entry
    // is three clicks from the bar. The menu is not on the bar while the streaming tools are tucked away. What anybody
    // who shares a screen can use (stream-safe, OBS, the capture view) is in View > Sharing your screen.
    label: 'Streaming',
    categories: ['Audience'],
    items: [
      'audience.start', 'audience.walk', '-', 'heading:Audience features', 'audience.toggle', 'audience.drawing', 'audience.view', 'audience.show', 'streamboard.toggle', 'audience.clearQueue', 'audience.kill', '-',
      'sub:streamdoor', 'sub:streamoverlay', 'sub:twitch', 'sub:promptjar', 'sub:votes', 'sub:guess', 'sub:quillreacts', 'sub:dares', 'sub:penmods',
    ],
  },
  {
    label: 'Help',
    // Nothing joins by category: shortcut sets live in Preferences > Keyboard, the quest controls with the Quests panel
    // and the pen check in Preferences. They stay in the command palette.
    categories: [],
    items: ['help.contents', 'quests.open', 'quests.tuckCard', 'file.openExample', 'help.shortcuts', 'help.welcome', 'help.meetQuill', 'quill.nudges', '-', 'help.sendReport', 'help.sendCrashNotes', '-', 'help.checkUpdates', 'help.about'],
  },
];

/**
 * Menus that moved, so a feature or plugin that still names the old menu or submenu (`registerMenuItems('Rig', ...)`)
 * lands in the right place. Rig and Effects are menus of their own now, Artboards is inside Layers, Pixel is gone. The ids underneath did not change.
 */
export const MENU_HOMES: Record<string, string> = {
  Rig: 'Extras',
  'sub:rig': 'Extras',
  'sub:effects': 'Effects',
  Artboards: 'sub:artboards',
  // Masks and folders is a group inside the Layer submenu now, and Pixels and vectors a group in the Layers menu.
  'sub:masks': 'sub:layer',
  'sub:pairs': 'Layers',
  Plugins: 'sub:plugins',
  // The Pixel menu is gone: what a feature adds to it goes to Tools, where the pixel tools now are.
  Pixel: 'Draw',
  'sub:tools': 'Draw',
};

/** A submenu, named in a menu as `sub:<key>`. */
export interface SubmenuDef {
  label: string;
  items: MenuEntry[];
  /** Commands nobody names whose id starts with one of these join it at the end (new export formats land here). */
  prefixes?: string[];
  /** Commands nobody names in these categories join it at the end (a new Rig command lands in the Skeleton submenu). */
  categories?: string[];
  /** The list is already final (the person changed it, and what features added is in it): add nothing to it. */
  fixed?: boolean;
  /** Tool ids a `group:tools` in this list skips, because each one is listed where its own feature is. */
  leaveOut?: readonly string[];
}

export const SUBMENUS: Record<string, SubmenuDef> = {
  panels: {
    label: 'Panels',
    items: ['view.allPanels', 'view.properties', '-', 'group:panels'],
  },
  panelwin: {
    label: 'Panel windows and tools',
    items: ['popout.toggle', 'popout.front', '-', 'view.movePanel.left', 'view.movePanel.right', 'view.movePanel.bottom', 'view.movePanel.top', 'view.panelsReset', 'view.hidePanels', 'view.lockPanels', '-', 'view.toolsPlace.left', 'view.toolsPlace.right', 'view.toolsPlace.top', 'view.toolsPlace.bottom', 'view.toolsPlace.float'],
    prefixes: ['view.movePanel.', 'view.toolsPlace.'],
  },
  toolrail: {
    label: 'Change the tools',
    items: ['view.toolbarBuilder', 'view.toolsReset', 'view.toolsHome', 'view.lockTools', '-', 'view.toolGroupRename', 'view.toolGroupStart', 'view.toolGroupJoin', 'view.toolGroupFold', 'view.toolHide', '-', 'view.toolRailWider', 'view.toolRailNarrower', 'view.toolRailFit', 'view.toolRailWidthReset'],
    prefixes: ['view.toolRail.', 'view.toolSize.', 'view.toolsOffLayer.'],
  },
  workspaces: {
    label: 'Your workspaces',
    items: ['view.saveWorkspace', 'view.manageWorkspaces', '-', 'view.exportWorkspace', 'view.importWorkspace', 'view.copyWorkspace', 'view.pasteWorkspace', '-', 'view.previousWorkspace', 'view.nextWorkspace', '-', 'heading:Show the workspace switcher as', 'view.workspaceSwitcher.tabs', 'view.workspaceSwitcher.chip', 'view.workspaceSwitcher.off'],
    prefixes: ['view.workspaceSwitcher.'],
  },
  snapping: {
    label: 'Snapping',
    items: ['view.snap', 'view.snapOptions'],
    prefixes: ['view.snap.'],
  },
  quillreacts: {
    label: 'Try Quill reacting to chat',
    items: ['quillreacts.cheer', 'quillreacts.hop', 'quillreacts.snack', 'quillreacts.nuzzle', 'quillreacts.wave', 'quillreacts.sign', 'quillreacts.welcome'],
  },
  quill: {
    label: "Quill's house",
    items: ['quillPet.open', '-', 'quillPet.things', 'quillPet.presents', 'quillPet.lately', '-', 'quillPet.give', 'quillPet.pat', 'quillPet.yours'],
  },
  notes: {
    label: 'Notes',
    items: ['tools.notes', 'notes.add', 'notes.toggleShow', 'notes.hideDone', '-', 'notes.toggleDone'],
  },
  marks: {
    label: 'Marks',
    items: ['tools.marks', '-', 'marks.toggleShow', '-'],
  },
  grids: {
    label: 'Guides, grids and perspective',
    items: ['view.lockGuides', 'view.clearGuides', '-', 'view.gridSquare', 'view.gridSettings', '-'],
  },
  tools: {
    label: 'Pick a tool',
    items: ['group:tools', '-', 'tiles.newAndDraw'],
    // These are on the rail and in the palette as ever, and each is in the menu of the thing it is for.
    leaveOut: TOOLS_WITH_THEIR_FEATURE,
  },
  arrange: {
    label: 'Arrange, group and transform',
    items: ['arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', '-', 'arrange.group', 'arrange.ungroup', 'arrange.breakApart', '-', 'transform.apply', 'transform.putBack', 'transform.pivotMiddle', 'heading:Flip and turn the whole drawing', 'pixel.flipH', 'pixel.flipV', 'pixel.rotateRight', 'pixel.rotateLeft', 'pixel.rotate180', 'pixel.rotate'],
    prefixes: ['arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', 'arrange.group', 'arrange.ungroup', 'arrange.breakApart', 'transform.'],
  },
  shapes: {
    label: 'Shapes and colour',
    items: ['heading:Combine shapes', 'shapes.join', 'shapes.cut', 'shapes.overlap', 'shapes.punch', 'heading:Tidy and convert', 'draw.holdToTidy', 'arrange.tidyStroke', 'arrange.strokeToLine', 'draw.toggleMerge', 'text.toShapes', '-', 'convert.toPixels', 'convert.toShapes', 'pixel.outline', 'pixel.outlineInside', 'heading:Recolour', 'colors.recolourSelection', 'colors.recolourFrame', 'colors.recolourLayer', 'colors.recolourAll'],
    prefixes: ['shapes.', 'colors.recolour'],
  },
  linestyle: {
    label: 'Line style',
    items: ['stroke.dash.solid', 'stroke.dash.dashed', 'stroke.dash.dotted', 'stroke.dash.dashdot', '-', 'stroke.arrow.start', 'stroke.arrow.end', '-', 'stroke.width.even', 'stroke.width.swell', 'stroke.width.pinch', 'stroke.width.taper', 'stroke.width.taperStart', 'stroke.width.brush'],
    prefixes: ['stroke.'],
  },
  tiles: {
    label: 'Tiles',
    items: ['tiles.addLayer', '-', 'tiles.new', 'tiles.edit', 'tiles.done', 'tiles.duplicate', 'tiles.delete', '-', 'tiles.solid', 'tiles.drawBox', 'tiles.drawShape', 'tiles.oneWay', 'tiles.clearShapes', '-', 'tiles.addValue', '-', 'tiles.addTerrain', 'tiles.makeEdgeTiles', 'tiles.guessEdges', 'tiles.autoEdges', '-', 'tiles.gridStart', 'tiles.export'],
    prefixes: ['tiles.'],
  },
  symbols: {
    label: 'Symbols',
    items: ['symbols.make', 'symbols.makeFrames', 'symbols.makeOne', 'symbols.edit', 'symbols.exit', 'symbols.exitAll', '-', 'symbols.swap', 'symbols.resetTransform', 'symbols.deleteUnused'],
    prefixes: ['symbols.'],
  },
  brushes: {
    label: 'Saved brushes',
    items: ['brush.picker', 'brush.favourite', 'brush.rows', '-', 'brush.saveAs', 'brush.update', 'brush.rename', 'brush.delete', '-', 'brush.next', 'brush.previous', '-', 'brush.saveFile', 'brush.copyText', 'brush.addFile', 'brush.pasteText'],
    prefixes: ['brush.pick.'],
  },
  brushtips: {
    label: 'Brush tips',
    items: ['brush.tip.plain', 'brush.tip.chalk', 'brush.tip.charcoal', 'brush.tip.watercolour', 'brush.tip.stamp', 'brush.tip.nib', 'brush.tip.along', 'brush.tip.edged', 'brush.tip.bristle', '-', 'brush.tipNext', 'brush.tipPrevious', '-', 'brush.fromSelection', 'brush.makeAlong', 'brush.edged.sides', 'brush.edged.start', 'brush.edged.end', 'brush.edged.inner', 'brush.edged.outer', '-', 'brush.flatten', 'brush.pixelReset'],
    prefixes: ['brush.tip.'],
  },
  toolopts: {
    label: 'Brush and tool options',
    items: ['draw.moreBrushOptions', 'pen.stabilizer', 'eraser.bit', 'select.scope', 'pen.eraserEnd', 'fill.allLayers', '-', 'settings.rememberOnion', 'settings.forgetDrawing',
      'heading:Pixel brush', 'pixel.sizeUp', 'pixel.sizeDown', 'pixel.swapPaintBack',
      'heading:Pixel gradient style', 'pixel.gradientColours', 'pixel.gradientDither', 'pixel.gradientRadial',
      'heading:Pixel text', 'text.pixelType', 'text.pixelFont.classic', 'text.pixelFont.tiny', 'text.pixelBold', 'text.pixelBigger', 'text.pixelSmaller',
    ],
  },
  // Masks and folders is a headed group in here: a menu has one level of submenu, no more. Pixels and vectors is a headed
  // group in the Layers menu itself, since it is about how two layers pair up, the way the sprite rows are about boards and frames.
  layer: {
    label: 'Layer',
    items: [
      'layers.addVector', 'layers.addPixel', 'layers.duplicate', 'layers.delete', '-',
      'layers.up', 'layers.down', 'layers.toggleVisible', 'layers.toggleLocked', 'timeline.soloLayer', 'layers.toggleReference',
      'heading:Masks and folders', 'layers.clipToBelow', 'layers.addMask', 'layers.useAsMask', 'layers.maskSwitch', 'layers.maskOnOff', 'layers.flipMask', 'layers.removeMask', '-', 'layers.newFolder', 'layers.ungroupFolder', 'layers.intoFolder', 'layers.outOfFolder', 'layers.folderIntoFolder', 'layers.folderOutOfFolder',
    ],
    prefixes: ['layers.mask'],
    categories: ['Layers'],
  },
  align: {
    label: 'Align and space out',
    items: ['select.alignLeft', 'select.alignCentre', 'select.alignRight', '-', 'select.alignTop', 'select.alignMiddle', 'select.alignBottom', '-', 'select.spreadAcross', 'select.spreadDown', '-', 'select.alignToPage'],
  },
  nudge: {
    label: 'Nudge and place',
    items: ['select.nudgeLeft', 'select.nudgeRight', 'select.nudgeUp', 'select.nudgeDown', '-', 'select.nudgeLeftMore', 'select.nudgeRightMore', 'select.nudgeUpMore', 'select.nudgeDownMore', '-', 'select.numbers'],
    prefixes: ['select.nudge'],
  },
  repeat: {
    label: 'Repeat a shape',
    items: ['repeat.grid', 'repeat.ring', 'repeat.mirror', '-', 'repeat.tool', 'repeat.expand', 'repeat.off', 'view.panel.repeat'],
    prefixes: ['repeat.'],
  },
  plugins: {
    label: 'Plugins',
    items: ['plugins.manage', 'plugins.install', '-'],
    categories: ['Plugins'],
  },
  // Every saved script is a command in the 'Scripts' category, so each one lands here by itself.
  scripts: {
    label: 'Scripts',
    items: ['scripts.open', 'scripts.new', 'scripts.stop', '-', 'remote.toggle', 'remote.log', 'remote.settings', '-'],
    categories: ['Scripts'],
  },
  turnview: {
    label: 'Centre, turn and flip the view',
    items: ['view.center', '-', 'view.flip', 'view.turnLeft', 'view.turnRight', 'view.resetTurn'],
  },
  sharing: {
    label: 'Sharing your screen',
    items: ['view.streamSafe', 'stream.obsLink', 'stream.obsLook', 'stream.obsSettings', '-', 'capture.toggle', 'capture.background', 'capture.cursor', '-', 'capture.size.free', 'capture.size.1920x1080', 'capture.size.1280x720', 'capture.size.2560x1440', 'capture.size.3840x2160', 'capture.size.1080x1080', 'capture.size.1080x1920'],
    prefixes: ['capture.'],
  },
  look: {
    label: 'Look and sound',
    items: ['view.toggleTheme', 'view.nextTheme', 'view.themes', 'view.toggleLook', 'view.toggleTextures', 'view.toggleSounds', '-', 'view.interfaceSize', 'view.tightLayout', 'view.explanations', 'view.cleanTimeline'],
  },
  streamdoor: { label: 'Actions door', items: [] },
  streamoverlay: { label: 'Stream overlay', items: [] },
  twitch: { label: 'Twitch', items: [] },
  promptjar: { label: 'Prompt jar', items: [] },
  votes: { label: 'Votes', items: [] },
  guess: { label: 'Guess the drawing', items: [] },
  moreview: {
    label: 'More view tools',
    items: ['view.emptyGhost', 'view.whereDidItGo', 'camera.lookThrough', 'camera.whilePlaying', 'tiles.tileMode', 'tiles.showShapes', '-', 'view.lightTable', 'view.lightTableDrawing', 'view.clearLightTable',
      'heading:Pixel art', 'pixel.previewPlay', 'pixel.previewSize', 'pixel.showSlices', 'pixel.deleteSlice',
      'heading:Zoom to a pixel size', 'pixel.zoom1', 'pixel.zoom2', 'pixel.zoom3', 'pixel.zoom4', 'pixel.zoom5', 'pixel.zoom6',
    ],
    prefixes: ['view.lightTable', 'pixel.zoom'],
  },
  customise: {
    label: 'Change the menus and features',
    items: ['view.changeMenus', 'view.menusReset', 'view.menusEverywhere', '-', 'view.features', 'view.featuresAllOn', 'features.streamingOff', 'features.streamingOn'],
  },
  dares: {
    label: 'Audience dares',
    items: ['dares.list', 'dares.stop', '-'],
    prefixes: ['dares.try.'],
  },
  penmods: {
    label: 'Pen modifiers',
    items: ['penmods.list', 'penmods.stop', '-'],
    prefixes: ['penmods.try.'],
  },
  palette: {
    label: 'Palette',
    items: ['pixel.paletteLock', 'pixel.reduceToPalette', '-', 'pixel.nextColor', 'pixel.previousColor', '-', 'palette.fromDrawing', 'palette.fromSwatches', 'palette.import', 'palette.fromPicture', 'palette.fromAseprite', '-', 'palette.exportGpl', 'palette.exportHex', 'palette.exportPal'],
    prefixes: ['palette.'],
  },
  charcoal: {
    label: 'Charcoal, chalk and pencil',
    items: [
      'tools.charcoal',
      'charcoal.medium.vine-charcoal', 'charcoal.medium.compressed-charcoal', 'charcoal.medium.chalk', 'charcoal.medium.soft-pastel', 'charcoal.medium.oil-pastel', 'charcoal.medium.crayon',
      'charcoal.medium.sketch-pencil', 'charcoal.medium.soft-pencil', 'charcoal.medium.colour-pencil', '-',
      'charcoal.paper.smooth', 'charcoal.paper.fine', 'charcoal.paper.medium', 'charcoal.paper.laid', 'charcoal.paper.rough',
    ],
  },
  pixelbrush: {
    label: 'Pixel brush',
    items: ['tools.pixel-brush', 'pixelbrush.tip.round', 'pixelbrush.tip.square', 'pixelbrush.tip.picture', 'pixelbrush.smooth', 'pixelbrush.follow', 'pixelbrush.scatter', 'pixelbrush.spacing.closer', 'pixelbrush.spacing.wider'],
  },
  range: {
    label: 'Play range',
    items: ['timeline.setIn', 'timeline.setOut', 'timeline.clearInOut'],
  },
  goto: {
    label: 'Move around the timeline',
    items: ['timeline.prevFrame', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.nextKey', 'timeline.firstFrame', 'timeline.lastFrame', '-', 'timeline.findDrawing', 'timeline.showDrawings', '-', 'timeline.addMarker', '-', 'timeline.zoomFit', 'timeline.fitLayers', 'timeline.toggleProperties', 'perf.quickScrub'],
  },
  onion: {
    label: 'Onion skin options',
    items: ['timeline.onionKeysOnly', 'timeline.onionBoards', 'timeline.onionAcrossClips'],
  },
  moreframes: {
    label: 'More frame tools',
    items: ['timeline.insertFrameOther', 'timeline.removeFrameOther', 'timeline.tidyEnd', '-', 'pixel.makeItMove'],
  },
  readymotion: {
    label: 'Ready-made motion',
    items: ['heading:One-click motions', 'motion.bounce', 'motion.wobble', 'motion.float', 'motion.popIn', 'motion.shake', 'motion.fadeIn', 'heading:Make a line draw itself', 'trim.drawOn', 'trim.drawOff', 'trim.whole', 'view.panel.draw-on', 'heading:Animate text', 'text.animate.fade', 'text.animate.scale', 'text.animate.slide', 'text.animate.rotate', 'text.animate.typewriter', 'text.animate.wave'],
    prefixes: ['motion.', 'trim.', 'text.animate.'],
  },
  keys: {
    label: 'Copy, move, name and clear keys',
    items: ['timeline.copyKeys', 'timeline.cutKeys', 'timeline.pasteKeys', 'timeline.pasteKeysAtEnd', 'timeline.pasteKeysInPlace', '-', 'timeline.keysEarlier', 'timeline.keysLater', 'timeline.keysSpread', 'timeline.keysSqueeze', '-', 'timeline.nameKey', 'timeline.makeOwnDrawing', 'timeline.clearKey'],
  },
  holds: {
    label: 'Hold a drawing',
    items: ['timeline.hold1', 'timeline.hold2', 'timeline.hold3', 'timeline.hold4'],
  },
  movedrawing: {
    label: 'Move a drawing without redrawing it',
    items: ['timeline.offsetLeft', 'timeline.offsetRight', 'timeline.offsetUp', 'timeline.offsetDown', '-', 'timeline.offsetFolder', 'timeline.offsetReset'],
    prefixes: ['timeline.offset'],
  },
  tween: {
    label: 'In-betweens and easing',
    items: ['tween.make', 'tween.morph', 'tween.remove', '-', 'tween.drawPath', 'tween.pathFromSelection', 'tools.motion-path', '-', 'tween.recordMove', 'tween.recordAgain', 'tween.recordPlay', 'tools.record-move', '-', 'tween.hints', 'tween.hints.clear', 'tools.shape-hints', '-', 'tween.ease.linear', 'tween.ease.easeIn', 'tween.ease.easeOut', 'tween.ease.easeInOut', 'tween.ease.backIn', 'tween.ease.backOut', 'tween.ease.bounceOut', 'tween.ease.elasticOut'],
    prefixes: ['tween.'],
  },
  camera: {
    label: 'Camera',
    items: ['camera.add', 'camera.pick', 'camera.reset'],
    prefixes: ['camera.add', 'camera.pick', 'camera.reset'],
  },
  clips: {
    label: 'Clips and clip flow',
    items: ['flow.open', 'flow.try', 'flow.addToggle', 'flow.addNumber', 'flow.fromAny', '-', 'timeline.clipDuplicate', '-', 'timeline.clipForward', 'timeline.clipBackward', 'timeline.clipOnce', 'timeline.clipForever', 'timeline.clipBackAndForth', 'timeline.clipBackAndForthEnd'],
    prefixes: ['timeline.clip', 'flow.'],
  },
  sound: {
    label: 'Sound and lip sync',
    items: ['audio.startHere', 'audio.mute', 'audio.scrub', 'audio.remove'],
    categories: ['Lip sync'],
  },
  reference: {
    label: 'Reference picture',
    items: ['reference.place', 'reference.fit', 'reference.fill', 'reference.reset', '-', 'reference.pictureFromHere', 'reference.removeFromHere', '-', 'reference.toggleShow'],
  },
  artboards: {
    label: 'Artboards',
    items: [
      'artboards.new', 'artboards.duplicate', 'artboards.delete',
      '-', 'artboards.find', 'artboards.previous', 'artboards.next', 'artboards.zoomTo', 'artboards.fitAll', 'artboards.lineUp', 'artboards.playAll', 'artboards.sameSpeed',
      'heading:Variations', 'artboards.makeVariation', 'artboards.variation.wide', 'artboards.variation.tall', 'artboards.variation.square', 'artboards.goToOriginal', 'artboards.resetVariation', 'artboards.detachVariation', 'artboards.recolourVariation',
      'heading:Joined shots', 'artboards.pictureFirst', 'artboards.pictureLargest', 'artboards.pictureCustom', 'artboards.fitFill', 'artboards.fitBars',
      '-', 'artboards.export', 'artboards.exportVariations', 'artboards.exportAtlas', '-', 'view.panel.artboards',
    ],
    prefixes: ['artboards.variation.', 'artboards.picture'],
    categories: ['Artboards'],
  },
  import: {
    label: 'Import',
    items: ['heading:Add to this drawing', 'file.importPicture', 'file.importAseprite', 'heading:Frames, logos and layers', 'file.importSequenceFiles', 'file.importSequenceFolder', 'file.importSvg', 'file.importVectorcraft', 'file.importLayered', 'file.importPhotocraft', 'heading:To trace over', 'file.importReference', 'reference.paste', 'file.importVideo', 'heading:Open as a new drawing', 'file.openPicture', 'file.openAseprite', 'heading:Colours', 'palette.import', 'palette.fromPicture'],
  },
  export: {
    label: 'Export',
    items: [
      'file.export', 'file.exportAgain', 'file.exportAll',
      'heading:Popular', 'file.exportLottie', 'file.exportSvgAnimated', 'file.exportPdf',
      'heading:Pictures and icons', 'file.exportJpeg', 'file.exportWebp', 'file.exportContactSheet', 'file.exportIcons', 'file.exportFavicon', 'file.exportStickers',
      'heading:Game engines', 'file.exportGodotAddon', 'tiles.export',
      'heading:Artboards', 'artboards.export', 'artboards.exportVariations', 'artboards.exportAtlas',
      'heading:Other', 'file.exportInteractives', 'file.exportProres', 'file.exportPsd', 'file.exportIllustrator', 'file.toggleUpdatePlayable',
    ],
    prefixes: ['file.export'],
  },
};

const contributed = new Map<string, string[][]>();

/** `menu` is a menu's id, or `sub:<key>` for a submenu. An old menu id that now lives inside another goes to its new home. */
const homeOf = (menu: string): string => MENU_HOMES[menu] ?? menu;

/** A feature adds command ids to the end of a named menu or submenu (after the listed ones, before any category extras). Taken away with the feature. */
export function registerMenuItems(menu: string, items: string[]): void {
  const key = homeOf(menu);
  const list = contributed.get(key) ?? [];
  list.push(items);
  contributed.set(key, list);
  ownedUndo(() => {
    const now = contributed.get(key);
    if (!now) return;
    const at = now.indexOf(items);
    if (at >= 0) now.splice(at, 1);
    if (!now.length) contributed.delete(key);
  });
}
/** What features have added to a menu (by its id) or a submenu (`sub:<key>`). */
export const contributedFor = (key: string): string[] => (contributed.get(key) ?? []).flat();

export type MenuItem = { kind: 'command'; command: Command } | { kind: 'separator' } | { kind: 'heading'; label: string } | { kind: 'submenu'; label: string; items: MenuItem[] };

/**
 * `visible` is for drawing a menu: the Tools menu then lists only the tools that work on the layer you are on, each
 * name once. Without it (working out which commands some menu already names) every tool counts.
 */
export function expand(entry: string, subs: Record<string, SubmenuDef> = SUBMENUS, visible = false): string[] {
  if (entry.startsWith('heading:')) return [];
  if (entry.startsWith('sub:')) return subItems(entry.slice(4), subs).filter((e) => e !== '-').flatMap((e) => expand(e, subs));
  if (entry === 'group:tools') {
    const tools = visible ? oneOfEach(allTools().filter((t) => toolEnabled(t.layers)), (t) => t.label, () => true) : allTools();
    return tools.map((t) => `tools.${t.id}`);
  }
  if (entry === 'group:panels') return allPanels().map((p) => `view.panel.${p.id}`);
  if (entry === 'group:workspaces') return listWorkspaces().map((w) => `view.workspace.${w.id}`);
  return [entry];
}

/** What a submenu lists: its own entries, then what features added (unless the list is already final). */
function subItems(key: string, subs: Record<string, SubmenuDef>): string[] {
  const sub = subs[key];
  if (!sub) return [];
  return sub.fixed ? sub.items : [...sub.items, ...contributedFor(`sub:${key}`)];
}

/** Every command id named in any menu, so the auto-added ones don't repeat across menus. */
export function listedIds(menus: MenuDef[], subs: Record<string, SubmenuDef> = SUBMENUS, hidden?: ReadonlySet<string>): Set<string> {
  const s = new Set<string>(hidden);
  for (const m of menus) for (const e of menuItems(m)) for (const id of expand(e, subs)) s.add(id);
  return s;
}

/** A menu's entries: the listed ones, then what features added (unless the list is already final). */
const menuItems = (m: MenuDef): string[] => (m.fixed ? m.items : [...m.items, ...contributedFor(m.label)]);

// One collator for every sort of command labels: the same order as localeCompare, without setting one up per comparison.
const labelOrder = new Intl.Collator();
const byLabel = (a: Command, b: Command): number => labelOrder.compare(a.label, b.label);

/**
 * The entries to show for a menu: named commands that exist, then any extra registered commands in the menu's
 * categories. Separators are tidied so there are never two in a row, or one at either end. `hidden` is commands the
 * person took out of every menu: they don't come back at the bottom either.
 */
export function resolveMenu(menu: MenuDef, menus: MenuDef[] = MENUS, lookup: (id: string) => Command | undefined = getCommand, all: () => Command[] = allCommands, subs: Record<string, SubmenuDef> = SUBMENUS, hidden?: ReadonlySet<string>, known?: Set<string>): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  // Every id the menus name: worked out once for a whole menu bar (`known`), not again for each menu and submenu.
  const named = known ?? listedIds(menus, subs, hidden);
  // Prefixes the submenus here claim, so their stray commands don't also land at the bottom of the menu.
  const claimed = menu.items.filter((e) => e.startsWith('sub:')).flatMap((e) => subs[e.slice(4)]?.prefixes ?? []);
  const claimedCats = menu.items.filter((e) => e.startsWith('sub:')).flatMap((e) => subs[e.slice(4)]?.categories ?? []);
  for (const e of menuItems(menu)) {
    if (e === '-') {
      out.push({ kind: 'separator' });
      continue;
    }
    if (e.startsWith('heading:')) {
      out.push({ kind: 'heading', label: e.slice(8) });
      continue;
    }
    if (e.startsWith('sub:')) {
      const sub = subs[e.slice(4)];
      if (!sub) continue;
      const inner = resolveMenu({ label: sub.label, categories: [], items: subItems(e.slice(4), subs), fixed: true, leaveOut: sub.leaveOut }, menus, lookup, all, subs, hidden, named);
      const extra = all()
        .filter((c) => ((sub.prefixes ?? []).some((p) => c.id.startsWith(p)) || (sub.categories ?? []).includes(c.category)) && !c.hidden && !named.has(c.id) && !isDynamicCommand(c.id) && !isStaleCommand(c.id) && !isLeftOutOfMenus(c.id))
        .sort(byLabel);
      for (const c of extra) inner.push({ kind: 'command', command: c });
      if (inner.length) out.push({ kind: 'submenu', label: sub.label, items: inner });
      continue;
    }
    for (const id of expand(e, subs, true)) {
      const c = lookup(id);
      if (!c || seen.has(id) || isStaleCommand(id) || menu.leaveOut?.includes(id)) continue;
      seen.add(id);
      out.push({ kind: 'command', command: c });
    }
  }
  const extra = all()
    .filter((c) => menu.categories.includes(c.category) && !c.hidden && !named.has(c.id) && !seen.has(c.id) && !claimed.some((p) => c.id.startsWith(p)) && !claimedCats.includes(c.category) && !isDynamicCommand(c.id) && !isStaleCommand(c.id) && !isLeftOutOfMenus(c.id))
    .sort(byLabel);
  if (extra.length) {
    out.push({ kind: 'separator' });
    for (const c of extra) out.push({ kind: 'command', command: c });
  }
  return tidy(out);
}

/** The entries a drawing with no animation shows: everything that is not about frames, with submenus that would be empty gone. */
export function withoutAnimation(items: MenuItem[]): MenuItem[] {
  const kept = items.flatMap((it): MenuItem[] => {
    // Turn animation off has nothing to do on a still, so only the way in stays.
    if (it.kind === 'command') return animationKind(it.command) === 'open' && it.command.id !== 'animation.remove' ? [it] : [];
    if (it.kind === 'submenu') {
      const inner = withoutAnimation(it.items);
      return inner.some((i) => i.kind === 'command' || i.kind === 'submenu') ? [{ ...it, items: inner }] : [];
    }
    return [it];
  });
  return tidy(kept);
}

const isBreak = (it: MenuItem | undefined): boolean => !!it && (it.kind === 'separator' || it.kind === 'heading');

/** No separator at either end or two in a row, and a heading only when something follows it under it. */
function tidy(list: MenuItem[]): MenuItem[] {
  const kept = list.filter((it, i) => it.kind !== 'heading' || (list[i + 1] && !isBreak(list[i + 1])));
  const out: MenuItem[] = [];
  for (const it of kept) {
    // A separator right before a heading is redundant: the heading draws its own gap.
    if (it.kind === 'separator' && (!out.length || isBreak(out[out.length - 1]))) continue;
    if (it.kind === 'heading' && out[out.length - 1]?.kind === 'separator') out.pop();
    out.push(it);
  }
  while (out.length && out[out.length - 1].kind === 'separator') out.pop();
  return out;
}

/** The menus as they are now: the ones that come with Frameling with this person's changes laid over them. */
export function currentShape(): Shape {
  return shapeMenus(MENUS, SUBMENUS, getMenuEdits(), { newEntries: currentChoice<NewEntries>('menus.newEntries'), contributed: contributedFor });
}

/** The menus that have anything in them. */
export function resolveMenus(): { menu: MenuDef; items: MenuItem[] }[] {
  syncDynamicCommands();
  const shape = currentShape();
  // Commands the person took out of every place stay out of the menu bottoms too.
  const hidden = new Set(shape.hidden.flatMap((e) => expand(e)));
  const named = listedIds(shape.menus, shape.subs, hidden);
  // The same list of commands for every menu, read once.
  let every: Command[] | null = null;
  const all = () => (every ??= allCommands());
  // A drawing with no animation leaves the animation entries out of every menu but Add animation, which is the way in (src/core/animationGate.ts).
  const still = !isAnimated(store().get().doc);
  return shape.menus
    .map((menu) => {
      const items = resolveMenu(menu, shape.menus, getCommand, all, shape.subs, hidden, named);
      return { menu, items: still ? withoutAnimation(items) : items };
    })
    .filter((m) => m.items.length || m.menu.label.startsWith('my-'));
}
