// The menu bar, as lists of command ids. Menus are built from the registry: an id nobody has registered is simply
// left out, so a feature that isn't there yet never leaves a dead entry. Commands that register under a menu's
// categories and aren't listed anywhere turn up at the bottom of that menu on their own.
import { allCommands, allPanels, allTools, getCommand, type Command } from '../core/registry';
import { isDynamicCommand, isStaleCommand, syncDynamicCommands, toolEnabled } from './dynamic';
import { oneOfEach } from './toolTwins';
import { listWorkspaces } from './dock';
import { ownedUndo } from '../core/owners';
import { currentChoice } from '../core/choices';
import { getMenuEdits } from './menuState';
import { shapeMenus, type NewEntries, type Shape } from './menuEdits';

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
}

/** `-` is a separator. `group:tools`, `group:panels` and `group:workspaces` expand to every one registered. */
export const MENUS: MenuDef[] = [
  {
    label: 'File',
    categories: ['File', 'Export'],
    items: ['file.new', 'pixel.new', 'file.open', 'file.openRecent', 'file.openPlayable', 'file.recover', '-', 'file.save', 'file.saveAs', 'file.saveVersion', 'file.versions', 'file.saveAsTemplate', 'file.importTemplate', '-', 'sub:export', 'sub:import', 'audio.import', '-', 'file.close', 'app.restart', '-', 'file.quit'],
  },
  {
    label: 'Edit',
    categories: ['Edit'],
    items: ['edit.undo', 'edit.redo', '-', 'view.panel.history', 'history.back', 'history.forward', '-', 'edit.cut', 'edit.copy', 'edit.copySvg', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'select.all', 'select.none', 'select.invert', 'sub:align', 'sub:nudge', '-', 'document.settings', 'document.seeThrough', 'text.swapFonts', '-', 'view.preferences', 'view.penTablet', 'view.performance', 'sub:plugins'],
  },
  {
    label: 'View',
    categories: ['View'],
    items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'view.center', 'sub:turnview', '-', 'group:workspaces', 'sub:workspaces', '-', 'sub:panels', 'sub:panelwin', 'sub:toolrail', 'view.changeMenus', 'view.menusReset', '-', 'view.pixelGrid', 'tiles.tileMode', 'view.emptyGhost', 'camera.lookThrough', 'camera.whilePlaying', 'view.whereDidItGo', '-', 'view.rulers', 'view.guides', 'sub:snapping', 'sub:grids', 'sub:lighttable', 'sub:notes', '-', 'sub:look', 'view.features', 'view.featuresAllOn', 'view.searchSettings', 'view.commandPalette', '-', 'quillPet.open', 'quillPet.give', 'quillPet.pat'],
  },
  {
    label: 'Draw',
    title: 'Tools and layers',
    categories: ['Draw', 'Drawing', 'Tools', 'Select', 'Selection', 'Shape', 'Shapes', 'Geometry', 'Layers', 'Arrange', 'Effects'],
    items: ['sub:tools', 'pixel.mirror', '-', 'select.flipH', 'select.flipV', '-', 'transform.apply', 'transform.putBack', 'transform.pivotMiddle', '-', 'arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', '-', 'arrange.group', 'arrange.ungroup', 'arrange.breakApart', 'sub:symbols', '-', 'sub:combine', 'sub:linestyle', 'sub:tidy', 'sub:recolour', 'sub:brushes', 'sub:toolopts', '-', 'layers.addVector', 'layers.addPixel', 'tiles.addLayer', 'layers.duplicate', 'layers.delete', '-', 'layers.up', 'layers.down', 'layers.toggleVisible', 'layers.toggleLocked', 'timeline.soloLayer', 'layers.toggleReference', '-', 'sub:effects', 'sub:masks', '-', 'view.panel.layers'],
  },
  {
    label: 'Pixel',
    title: 'Pixel tools',
    categories: ['Pixel'],
    items: ['pixel.changeWay', 'pixel.makeItMove', '-', 'pixel.shareLayers', 'pixel.unshareLayers', 'pixel.boardsToFrames', 'pixel.framesToBoards', '-', 'tools.pencil', 'tools.shade', 'tools.dither', 'tools.gradient', 'sub:pixgrad', 'tools.spray', 'text.pixelType', 'sub:pixtext', 'pixel.mirror', 'pixel.sizeUp', 'pixel.sizeDown', 'pixel.swapPaintBack', '-', 'sub:pixturn', 'pixel.outline', 'pixel.outlineInside', '-', 'sub:palette', 'sub:slices', 'sub:pixzoom', '-', 'view.panel.palette', 'view.panel.preview', 'pixel.previewPlay', 'pixel.previewSize', 'view.workspace.pixel'],
  },
  {
    label: 'Animate',
    title: 'Frames and motion',
    categories: ['Animate', 'Animation', 'Timeline', 'Frames', 'Sound', 'Lip sync'],
    items: ['timeline.play', 'timeline.toggleLoop', 'timeline.togglePingPong', '-', 'timeline.toggleOnion', 'timeline.onionKeysOnly', 'timeline.onionBoards', '-', 'sub:range', 'sub:goto', '-', 'timeline.newKey', 'timeline.emptyFrame', 'timeline.duplicateKey', 'timeline.clearKey', 'timeline.deleteKeys', 'sub:keys', 'sub:holds', '-', 'timeline.insertFrame', 'timeline.removeFrame', 'timeline.insertFrameOther', 'timeline.removeFrameOther', 'timeline.tidyEnd', 'timeline.addMarker', '-', 'sub:tween', 'sub:motions', 'sub:camera', 'sub:atext', 'sub:clips', '-', 'sub:rig', 'sub:sound', 'sub:reference', 'sub:artboards'],
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
 * Menus that used to be on the bar and now live inside another, so a feature or plugin that still names the old menu
 * (`registerMenuItems('Rig', ...)`) lands in the right place. The ids underneath did not change.
 */
export const MENU_HOMES: Record<string, string> = { Rig: 'sub:rig', Effects: 'sub:effects', Artboards: 'sub:artboards', Plugins: 'sub:plugins' };

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
}

export const SUBMENUS: Record<string, SubmenuDef> = {
  panels: {
    label: 'Panels',
    items: ['view.allPanels', 'view.properties', '-', 'group:panels'],
  },
  panelwin: {
    label: 'Panel windows and tools',
    items: ['view.floatPanel', 'view.renamePanel', 'view.movePanel.left', 'view.movePanel.right', 'view.movePanel.bottom', 'view.movePanel.top', 'view.splitPanelGroup', 'view.joinPanelGroups', 'view.dockAllWindows', 'view.hidePanels', 'view.lockPanels', '-', 'view.toolsPlace.left', 'view.toolsPlace.right', 'view.toolsPlace.top', 'view.toolsPlace.bottom', 'view.toolsPlace.float'],
    prefixes: ['view.movePanel.', 'view.toolsPlace.'],
  },
  toolrail: {
    label: 'Change the tools',
    items: ['view.toolbarBuilder', 'view.toolsReset', 'view.toolsHome', 'view.lockTools', '-', 'view.toolGroupRename', 'view.toolGroupStart', 'view.toolGroupJoin', 'view.toolGroupFold', 'view.toolHide', 'view.toolsShowAll', '-', 'view.toolSize.small', 'view.toolSize.medium', 'view.toolSize.large', 'view.toolNames', 'view.toolsOffLayer.hide', 'view.toolsOffLayer.grey', '-', 'view.toolRail.two', 'view.toolRail.stacked', '-', 'view.toolRailWider', 'view.toolRailNarrower', 'view.toolRailFit', 'view.toolRailWidthReset'],
    prefixes: ['view.toolRail.', 'view.toolSize.', 'view.toolsOffLayer.'],
  },
  workspaces: {
    label: 'Your workspaces',
    items: ['view.saveWorkspace', 'view.manageWorkspaces', 'view.resetLayout', '-', 'view.exportWorkspace', 'view.importWorkspace', 'view.copyWorkspace', 'view.pasteWorkspace', '-', 'view.previousWorkspace', 'view.nextWorkspace', '-', 'heading:Show the workspace switcher as', 'view.workspaceSwitcher.tabs', 'view.workspaceSwitcher.chip', 'view.workspaceSwitcher.off'],
    prefixes: ['view.workspaceSwitcher.'],
  },
  snapping: {
    label: 'Snapping',
    items: ['view.snap', 'view.snapOptions', '-', 'view.snap.grid', 'view.snap.guides', 'view.snap.page', 'view.snap.centre', 'view.snap.shapes', 'view.snap.allLayers', 'view.snap.artboards', 'view.snap.spacing', 'view.snap.angles', 'view.snap.perspective', 'view.snap.cells', 'view.snap.plugins'],
    prefixes: ['view.snap.'],
  },
  notes: {
    label: 'Notes',
    items: ['tools.notes', 'notes.add', 'notes.toggleShow', 'notes.hideDone', '-', 'notes.previous', 'notes.next', 'notes.toggleDone', 'notes.clearDone'],
  },
  grids: {
    label: 'Guides, grids and perspective',
    items: ['view.lockGuides', 'view.clearGuides', '-', 'view.gridSquare', 'view.gridIso', 'view.gridSettings', '-', 'view.perspective1', 'view.perspective2', 'view.showPerspective', 'view.removePerspective'],
  },
  tools: {
    label: 'Tools',
    items: ['group:tools', '-', 'tiles.newAndDraw'],
  },
  combine: {
    label: 'Combine shapes',
    items: ['shapes.join', 'shapes.cut', 'shapes.overlap', 'shapes.punch'],
  },
  linestyle: {
    label: 'Line style',
    items: ['stroke.dash.solid', 'stroke.dash.dashed', 'stroke.dash.dotted', 'stroke.dash.dashdot', '-', 'stroke.arrow.start', 'stroke.arrow.end', '-', 'stroke.width.even', 'stroke.width.swell', 'stroke.width.pinch', 'stroke.width.taper', 'stroke.width.taperStart', 'stroke.width.brush'],
    prefixes: ['stroke.'],
  },
  symbols: {
    label: 'Symbols',
    items: ['symbols.make', 'symbols.edit', 'symbols.exit', 'symbols.exitAll', '-', 'symbols.swap', 'symbols.resetTransform', 'symbols.deleteUnused'],
    prefixes: ['symbols.'],
  },
  tidy: {
    label: 'Tidy and convert shapes',
    items: ['draw.holdToTidy', 'arrange.tidyStroke', 'arrange.strokeToLine', 'draw.toggleMerge', 'text.toShapes'],
  },
  recolour: {
    label: 'Recolour',
    items: ['colors.recolourSelection', 'colors.recolourFrame', 'colors.recolourLayer', 'colors.recolourAll'],
    prefixes: ['colors.recolour'],
  },
  brushes: {
    label: 'Saved brushes',
    items: ['brush.saveAs', 'brush.update', 'brush.rename', 'brush.delete', '-', 'brush.next', 'brush.previous', '-', 'brush.saveFile', 'brush.copyText', 'brush.addFile', 'brush.pasteText'],
    prefixes: ['brush.pick.'],
  },
  toolopts: {
    label: 'Brush and tool options',
    items: ['draw.moreBrushOptions', 'pen.stabilizer', 'eraser.bit', 'pen.eraserEnd', 'fill.allLayers', '-', 'settings.rememberOnion', 'settings.forgetDrawing'],
  },
  effects: {
    label: 'Effects',
    items: ['view.panel.effects', '-', 'effects.add.blur', 'effects.add.glow', 'effects.add.shadow', 'effects.add.adjust', 'effects.add.outline', 'effects.add.pixelate', '-', 'effects.reset', '-', 'particles.add.confetti', 'particles.add.dust', 'particles.add.rain', 'particles.add.smoke', 'particles.add.snow', 'particles.add.sparkle', 'particles.shuffle'],
    prefixes: ['effects.add.', 'particles.add.'],
    categories: ['Effects'],
  },
  masks: {
    label: 'Masks and folders',
    items: ['layers.clipToBelow', 'layers.addMask', 'layers.useAsMask', 'layers.maskSwitch', 'layers.maskOnOff', 'layers.flipMask', 'layers.removeMask', '-', 'layers.newFolder', 'layers.ungroupFolder', 'layers.intoFolder', 'layers.outOfFolder', 'layers.folderIntoFolder', 'layers.folderOutOfFolder'],
    prefixes: ['layers.mask'],
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
  plugins: {
    label: 'Plugins',
    items: ['plugins.manage', 'plugins.install', '-'],
    categories: ['Plugins'],
  },
  turnview: {
    label: 'Turn and flip the view',
    items: ['view.flip', 'view.turnLeft', 'view.turnRight', 'view.resetTurn'],
  },
  lighttable: {
    label: 'Light table',
    items: ['view.lightTable', 'view.lightTableDrawing', 'view.clearLightTable'],
  },
  look: {
    label: 'Look and sound',
    items: ['view.toggleTheme', 'view.nextTheme', 'view.themes', 'view.toggleLook', 'view.toggleTextures', 'view.toggleSounds', '-', 'view.interfaceSize', 'view.explanations', 'view.cleanTimeline'],
  },
  pixturn: {
    label: 'Flip and turn',
    items: ['pixel.flipH', 'pixel.flipV', 'pixel.rotateRight', 'pixel.rotateLeft', 'pixel.rotate180', 'pixel.rotate'],
  },
  palette: {
    label: 'Palette',
    items: ['pixel.paletteLock', 'pixel.reduceToPalette', '-', 'pixel.nextColor', 'pixel.previousColor', '-', 'palette.fromDrawing', 'palette.import', 'palette.fromPicture', 'palette.fromAseprite', '-', 'palette.exportGpl', 'palette.exportHex', 'palette.exportPal'],
    prefixes: ['palette.'],
  },
  slices: {
    label: 'Slices',
    items: ['pixel.showSlices', 'pixel.deleteSlice', 'view.panel.slices'],
  },
  pixgrad: {
    label: 'Pixel gradient style',
    items: ['pixel.gradientColours', 'pixel.gradientDither', 'pixel.gradientRadial'],
    prefixes: ['pixel.gradient'],
  },
  pixtext: {
    label: 'Pixel text style',
    items: ['text.pixelFont.classic', 'text.pixelFont.tiny', '-', 'text.pixelBold', 'text.pixelBigger', 'text.pixelSmaller'],
    prefixes: ['text.pixelFont.'],
  },
  pixzoom: {
    label: 'Zoom to a pixel size',
    items: ['pixel.zoom1', 'pixel.zoom2', 'pixel.zoom3', 'pixel.zoom4', 'pixel.zoom5', 'pixel.zoom6'],
    prefixes: ['pixel.zoom'],
  },
  range: {
    label: 'Play range',
    items: ['timeline.setIn', 'timeline.setOut', 'timeline.clearInOut'],
  },
  goto: {
    label: 'Move around the timeline',
    items: ['timeline.prevFrame', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.nextKey', 'timeline.firstFrame', 'timeline.lastFrame', '-', 'timeline.zoomFit', 'timeline.toggleProperties', 'perf.quickScrub'],
  },
  keys: {
    label: 'Copy, move and stretch keys',
    items: ['timeline.copyKeys', 'timeline.cutKeys', 'timeline.pasteKeys', 'timeline.pasteKeysAtEnd', 'timeline.pasteKeysInPlace', '-', 'timeline.keysEarlier', 'timeline.keysLater', 'timeline.keysSpread', 'timeline.keysSqueeze'],
  },
  holds: {
    label: 'Hold a drawing',
    items: ['timeline.hold1', 'timeline.hold2', 'timeline.hold3', 'timeline.hold4'],
  },
  tween: {
    label: 'In-betweens and easing',
    items: ['tween.make', 'tween.morph', 'tween.remove', '-', 'tween.drawPath', 'tween.pathFromSelection', '-', 'tween.hints', 'tween.hints.clear', '-', 'tween.ease.linear', 'tween.ease.easeIn', 'tween.ease.easeOut', 'tween.ease.easeInOut', 'tween.ease.backIn', 'tween.ease.backOut', 'tween.ease.bounceOut', 'tween.ease.elasticOut'],
    prefixes: ['tween.'],
  },
  camera: {
    label: 'Camera',
    items: ['camera.add', 'camera.pick', 'camera.reset'],
    prefixes: ['camera.add', 'camera.pick', 'camera.reset'],
  },
  atext: {
    label: 'Animate text',
    items: ['text.animate.fade', 'text.animate.scale', 'text.animate.slide', 'text.animate.rotate', 'text.animate.typewriter', 'text.animate.wave'],
    prefixes: ['text.animate.'],
  },
  clips: {
    label: 'Clips and clip flow',
    items: ['flow.open', 'flow.try', '-', 'timeline.clipForward', 'timeline.clipBackward', 'timeline.clipOnce', 'timeline.clipForever', 'timeline.clipBackAndForth', 'timeline.clipBackAndForthEnd'],
    prefixes: ['timeline.clip', 'flow.'],
  },
  sound: {
    label: 'Sound and lip sync',
    items: ['audio.startHere', 'audio.mute', 'audio.scrub', 'audio.remove'],
    categories: ['Lip sync'],
  },
  rig: {
    label: 'Skeleton (rig)',
    items: ['rig.addBones', 'tools.bone', 'tools.pose', '-', 'rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', '-', 'rig.togglePin', 'rig.resetPose', 'rig.mirrorPose', 'rig.swapSides', 'rig.savePose', '-', 'rig.deleteBone', 'rig.boneLook', 'view.panel.rig'],
    categories: ['Rig'],
  },
  reference: {
    label: 'Reference picture',
    items: ['reference.place', 'reference.fit', 'reference.fill', 'reference.reset', '-', 'reference.pictureFromHere', 'reference.removeFromHere', '-', 'reference.toggleShow'],
  },
  artboards: {
    label: 'Artboards',
    items: [
      'artboards.new', 'artboards.duplicate', 'artboards.delete',
      '-', 'artboards.previous', 'artboards.next', 'artboards.zoomTo', 'artboards.fitAll', 'artboards.lineUp', 'artboards.playAll', 'artboards.sameSpeed',
      'heading:Variations', 'artboards.makeVariation', 'artboards.variation.wide', 'artboards.variation.tall', 'artboards.variation.square', 'artboards.goToOriginal', 'artboards.resetVariation', 'artboards.detachVariation', 'artboards.recolourVariation',
      'heading:Joined shots', 'artboards.pictureFirst', 'artboards.pictureLargest', 'artboards.pictureCustom', 'artboards.fitFill', 'artboards.fitBars',
      '-', 'artboards.export', 'artboards.exportVariations', 'artboards.exportAtlas', '-', 'view.panel.artboards',
    ],
    prefixes: ['artboards.variation.', 'artboards.picture'],
    categories: ['Artboards'],
  },
  motions: {
    label: 'One-click motions',
    items: ['motion.bounce', 'motion.wobble', 'motion.float', 'motion.popIn', 'motion.shake', 'motion.fadeIn'],
    prefixes: ['motion.'],
  },
  import: {
    label: 'Import',
    items: ['heading:Add to this drawing', 'file.importPicture', 'file.importAseprite', 'heading:Frames, logos and layers', 'file.importSequenceFiles', 'file.importSequenceFolder', 'file.importSvg', 'file.importLayered', 'heading:To trace over', 'file.importReference', 'reference.paste', 'file.importVideo', 'heading:Open as a new drawing', 'file.openPicture', 'file.openAseprite', 'heading:Colours', 'palette.import', 'palette.fromPicture'],
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
 * `visible` is for drawing a menu: the Draw menu then lists only the tools that work on the layer you are on, each
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
function listedIds(menus: MenuDef[], subs: Record<string, SubmenuDef> = SUBMENUS, hidden?: ReadonlySet<string>): Set<string> {
  const s = new Set<string>(hidden);
  for (const m of menus) for (const e of menuItems(m)) for (const id of expand(e, subs)) s.add(id);
  return s;
}

/** A menu's entries: the listed ones, then what features added (unless the list is already final). */
const menuItems = (m: MenuDef): string[] => (m.fixed ? m.items : [...m.items, ...contributedFor(m.label)]);

/**
 * The entries to show for a menu: named commands that exist, then any extra registered commands in the menu's
 * categories. Separators are tidied so there are never two in a row, or one at either end. `hidden` is commands the
 * person took out of every menu: they don't come back at the bottom either.
 */
export function resolveMenu(menu: MenuDef, menus: MenuDef[] = MENUS, lookup: (id: string) => Command | undefined = getCommand, all: () => Command[] = allCommands, subs: Record<string, SubmenuDef> = SUBMENUS, hidden?: ReadonlySet<string>): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const named = listedIds(menus, subs, hidden);
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
      const inner = resolveMenu({ label: sub.label, categories: [], items: subItems(e.slice(4), subs), fixed: true }, menus, lookup, all, subs, hidden);
      const extra = all()
        .filter((c) => ((sub.prefixes ?? []).some((p) => c.id.startsWith(p)) || (sub.categories ?? []).includes(c.category)) && !c.hidden && !named.has(c.id) && !isDynamicCommand(c.id) && !isStaleCommand(c.id))
        .sort((a, b) => a.label.localeCompare(b.label));
      for (const c of extra) inner.push({ kind: 'command', command: c });
      if (inner.length) out.push({ kind: 'submenu', label: sub.label, items: inner });
      continue;
    }
    for (const id of expand(e, subs, true)) {
      const c = lookup(id);
      if (!c || seen.has(id) || isStaleCommand(id)) continue;
      seen.add(id);
      out.push({ kind: 'command', command: c });
    }
  }
  const extra = all()
    .filter((c) => menu.categories.includes(c.category) && !c.hidden && !named.has(c.id) && !seen.has(c.id) && !claimed.some((p) => c.id.startsWith(p)) && !claimedCats.includes(c.category) && !isDynamicCommand(c.id) && !isStaleCommand(c.id))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (extra.length) {
    out.push({ kind: 'separator' });
    for (const c of extra) out.push({ kind: 'command', command: c });
  }
  return tidy(out);
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
  return shape.menus.map((menu) => ({ menu, items: resolveMenu(menu, shape.menus, getCommand, allCommands, shape.subs, hidden) })).filter((m) => m.items.length || m.menu.label.startsWith('my-'));
}
