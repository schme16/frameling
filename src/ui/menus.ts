// The menu bar, as lists of command ids. Menus are built from the registry: an id nobody has registered is simply
// left out, so a feature that isn't there yet never leaves a dead entry. Commands that register under a menu's
// categories and aren't listed anywhere turn up at the bottom of that menu on their own.
import { allCommands, allPanels, allTools, getCommand, type Command } from '../core/registry';
import { isDynamicCommand, isStaleCommand, syncDynamicCommands } from './dynamic';
import { listWorkspaces } from './dock';
import { ownedUndo } from '../core/owners';

export type MenuEntry = string;

export interface MenuDef {
  label: string;
  items: MenuEntry[];
  /** Registered commands in these categories that aren't named anywhere else show up at the end. */
  categories: string[];
}

/** `-` is a separator. `group:tools`, `group:panels` and `group:workspaces` expand to every one registered. */
export const MENUS: MenuDef[] = [
  {
    label: 'File',
    categories: ['File', 'Export'],
    items: ['file.new', 'pixel.new', 'file.open', 'file.openRecent', 'file.openPlayable', 'file.recover', '-', 'file.save', 'file.saveAs', 'file.saveVersion', 'file.versions', 'file.saveAsTemplate', 'file.importTemplate', '-', 'sub:export', 'sub:import', 'audio.import', '-', 'file.quit'],
  },
  {
    label: 'Edit',
    categories: ['Edit'],
    items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'select.all', 'select.none', '-', 'document.settings', 'view.preferences', 'view.penTablet'],
  },
  {
    label: 'View',
    categories: ['View'],
    items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'view.center', '-', 'group:workspaces', 'view.saveWorkspace', 'view.manageWorkspaces', 'sub:wsshare', 'view.resetLayout', '-', 'sub:panels', 'sub:panelwin', '-', 'view.pixelGrid', 'tiles.tileMode', 'view.emptyGhost', 'camera.lookThrough', 'camera.whilePlaying', 'view.whereDidItGo', '-', 'view.rulers', 'view.guides', 'sub:snapping', 'sub:grids', 'sub:lighttable', '-', 'sub:look', '-', 'view.interfaceSize', 'view.features', 'view.commandPalette'],
  },
  {
    label: 'Artboards',
    categories: ['Artboards'],
    items: ['artboards.new', 'artboards.duplicate', 'artboards.delete', '-', 'artboards.previous', 'artboards.next', 'artboards.zoomTo', 'artboards.fitAll', 'artboards.lineUp', 'artboards.playAll', '-', 'sub:variations', 'sub:joined', '-', 'artboards.export', 'artboards.exportVariations', 'artboards.exportAtlas', '-', 'view.panel.artboards'],
  },
  {
    label: 'Draw',
    categories: ['Draw', 'Drawing', 'Tools', 'Select', 'Selection', 'Shape', 'Shapes', 'Geometry', 'Layers', 'Arrange'],
    items: ['group:tools', '-', 'select.flipH', 'select.flipV', '-', 'arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', '-', 'layers.addVector', 'layers.addPixel', 'layers.duplicate', 'layers.delete', '-', 'layers.up', 'layers.down', 'layers.toggleVisible', 'layers.toggleLocked', '-', 'view.panel.layers'],
  },
  {
    label: 'Pixel',
    categories: ['Pixel'],
    items: ['pixel.changeWay', 'pixel.makeItMove', 'pixel.shareLayers', 'pixel.unshareLayers', '-', 'tools.pencil', 'tools.shade', 'tools.dither', 'tools.spray', 'pixel.mirror', '-', 'pixel.flipH', 'pixel.flipV', 'pixel.rotateRight', 'pixel.rotateLeft', 'pixel.rotate180', 'pixel.rotate', '-', 'pixel.outline', 'pixel.outlineInside', '-', 'view.panel.palette', 'view.panel.preview', 'pixel.previewPlay', 'pixel.previewSize', 'view.workspace.pixel', '-', 'pixel.paletteLock', 'pixel.reduceToPalette', 'palette.fromDrawing', 'palette.import', 'palette.fromPicture', 'palette.fromAseprite', 'palette.exportGpl', 'palette.exportHex', 'palette.exportPal'],
  },
  {
    label: 'Animate',
    categories: ['Animate', 'Animation', 'Timeline', 'Frames', 'Sound', 'Lip sync'],
    items: ['timeline.play', 'timeline.toggleLoop', 'timeline.togglePingPong', 'timeline.toggleOnion', 'timeline.onionKeysOnly', 'timeline.onionBoards', '-', 'timeline.setIn', 'timeline.setOut', 'timeline.clearInOut', '-', 'timeline.prevFrame', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.nextKey', 'timeline.firstFrame', 'timeline.lastFrame', '-', 'timeline.newKey', 'timeline.emptyFrame', 'timeline.duplicateKey', 'timeline.clearKey', '-', 'timeline.insertFrame', 'timeline.removeFrame', 'timeline.tidyEnd', 'timeline.addMarker', '-', 'sub:motions'],
  },
  {
    label: 'Rig',
    categories: ['Rig'],
    items: ['rig.addBones', 'tools.bone', 'tools.pose', '-', 'rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', '-', 'rig.togglePin', 'rig.resetPose', 'rig.mirrorPose', 'rig.swapSides', 'rig.savePose', '-', 'view.panel.rig', 'rig.boneLook'],
  },
  {
    label: 'Effects',
    categories: ['Effects'],
    items: ['view.panel.effects', '-', 'effects.add.blur', 'effects.add.glow', 'effects.add.shadow', 'effects.add.adjust', 'effects.add.outline', 'effects.add.pixelate', '-', 'layers.clipToBelow', 'layers.useAsMask', '-', 'layers.newFolder', 'layers.ungroupFolder', 'layers.intoFolder', 'layers.outOfFolder', 'layers.folderIntoFolder', 'layers.folderOutOfFolder', '-', 'effects.reset'],
  },
  {
    label: 'Plugins',
    categories: ['Plugins'],
    items: ['plugins.manage', 'plugins.install', '-'],
  },
  {
    label: 'Help',
    categories: ['Help'],
    items: ['help.contents', 'quests.open', 'file.openExample', 'help.shortcuts', 'help.welcome', 'help.meetQuill', '-', 'help.about'],
  },
];

/** A submenu, named in a menu as `sub:<key>`. */
export interface SubmenuDef {
  label: string;
  items: MenuEntry[];
  /** Commands nobody names whose id starts with one of these join it at the end (new export formats land here). */
  prefixes?: string[];
}

export const SUBMENUS: Record<string, SubmenuDef> = {
  panels: {
    label: 'Panels',
    items: ['view.allPanels', 'view.properties', '-', 'group:panels'],
  },
  panelwin: {
    label: 'Panel windows and tools',
    items: ['view.floatPanel', 'view.renamePanel', 'view.movePanel.left', 'view.movePanel.right', 'view.movePanel.bottom', 'view.movePanel.top', 'view.splitPanelGroup', 'view.joinPanelGroups', 'view.dockAllWindows', 'view.hidePanels', '-', 'view.toolsPlace.left', 'view.toolsPlace.right', 'view.toolsPlace.top', 'view.toolsPlace.bottom', 'view.toolsPlace.float', '-', 'view.toolGroupRename', 'view.toolsReset', 'view.toolRail.two', 'view.toolRail.stacked'],
    prefixes: ['view.movePanel.', 'view.toolsPlace.', 'view.toolRail.'],
  },
  wsshare: {
    label: 'Share a workspace',
    items: ['view.exportWorkspace', 'view.importWorkspace', 'view.copyWorkspace', 'view.pasteWorkspace', '-', 'view.previousWorkspace', 'view.nextWorkspace'],
  },
  snapping: {
    label: 'Snapping',
    items: ['view.snap', 'view.snapOptions', '-', 'view.snap.grid', 'view.snap.guides', 'view.snap.page', 'view.snap.centre', 'view.snap.shapes', 'view.snap.allLayers', 'view.snap.artboards', 'view.snap.spacing', 'view.snap.angles', 'view.snap.perspective', 'view.snap.cells', 'view.snap.plugins'],
    prefixes: ['view.snap.'],
  },
  grids: {
    label: 'Guides, grids and perspective',
    items: ['view.lockGuides', 'view.clearGuides', '-', 'view.gridSquare', 'view.gridIso', 'view.gridSettings', '-', 'view.perspective1', 'view.perspective2', 'view.showPerspective', 'view.removePerspective'],
  },
  lighttable: {
    label: 'Light table',
    items: ['view.lightTable', 'view.lightTableDrawing', 'view.clearLightTable'],
  },
  look: {
    label: 'Look and sound',
    items: ['view.toggleTheme', 'view.nextTheme', 'view.themes', 'view.toggleLook', 'view.toggleTextures', 'view.toggleSounds', '-', 'view.cleanTimeline'],
  },
  variations: {
    label: 'Variations',
    items: ['artboards.makeVariation', 'artboards.variation.wide', 'artboards.variation.tall', 'artboards.variation.square', '-', 'artboards.goToOriginal', 'artboards.resetVariation', 'artboards.detachVariation'],
    prefixes: ['artboards.variation.'],
  },
  joined: {
    label: 'Joined shots',
    items: ['heading:Picture size of the joined film', 'artboards.pictureFirst', 'artboards.pictureLargest', 'artboards.pictureCustom', 'heading:Shots of different sizes', 'artboards.fitFill', 'artboards.fitBars'],
    prefixes: ['artboards.picture'],
  },
  motions: {
    label: 'One-click motions',
    items: ['motion.bounce', 'motion.wobble', 'motion.float', 'motion.popIn', 'motion.shake', 'motion.fadeIn'],
    prefixes: ['motion.'],
  },
  import: {
    label: 'Import',
    items: ['heading:Add to this drawing', 'file.importPicture', 'file.importAseprite', 'heading:Open as a new drawing', 'file.openPicture', 'file.openAseprite', 'heading:Colours', 'palette.import', 'palette.fromPicture'],
  },
  export: {
    label: 'Export',
    items: [
      'file.export', 'file.exportAgain',
      'heading:Popular', 'file.exportLottie', 'file.exportSvgAnimated', 'file.exportPdf',
      'heading:Game engines', 'file.exportGodotAddon', 'tiles.export',
      'heading:Artboards', 'artboards.export', 'artboards.exportVariations', 'artboards.exportAtlas',
      'heading:Other', 'file.exportInteractives', 'file.exportProres', 'file.exportPsd', 'file.exportIllustrator', 'file.toggleUpdatePlayable',
    ],
    prefixes: ['file.export'],
  },
};

const contributed = new Map<string, string[][]>();

/** A feature adds command ids to the end of a named menu (after the listed ones, before any category extras). Taken away with the feature. */
export function registerMenuItems(menu: string, items: string[]): void {
  const list = contributed.get(menu) ?? [];
  list.push(items);
  contributed.set(menu, list);
  ownedUndo(() => {
    const now = contributed.get(menu);
    if (!now) return;
    const at = now.indexOf(items);
    if (at >= 0) now.splice(at, 1);
    if (!now.length) contributed.delete(menu);
  });
}
const contributedFor = (menu: string): string[] => (contributed.get(menu) ?? []).flat();

export type MenuItem = { kind: 'command'; command: Command } | { kind: 'separator' } | { kind: 'heading'; label: string } | { kind: 'submenu'; label: string; items: MenuItem[] };

function expand(entry: string, subs: Record<string, SubmenuDef> = SUBMENUS): string[] {
  if (entry.startsWith('heading:')) return [];
  if (entry.startsWith('sub:')) return (subs[entry.slice(4)]?.items ?? []).filter((e) => e !== '-').flatMap((e) => expand(e, subs));
  if (entry === 'group:tools') return allTools().map((t) => `tools.${t.id}`);
  if (entry === 'group:panels') return allPanels().map((p) => `view.panel.${p.id}`);
  if (entry === 'group:workspaces') return listWorkspaces().map((w) => `view.workspace.${w.id}`);
  return [entry];
}

/** Every command id named in any menu, so the auto-added ones don't repeat across menus. */
function listedIds(menus: MenuDef[], subs: Record<string, SubmenuDef> = SUBMENUS): Set<string> {
  const s = new Set<string>();
  for (const m of menus) for (const e of [...m.items, ...contributedFor(m.label)]) for (const id of expand(e, subs)) s.add(id);
  return s;
}

/**
 * The entries to show for a menu: named commands that exist, then any extra registered commands in the menu's
 * categories. Separators are tidied so there are never two in a row, or one at either end.
 */
export function resolveMenu(menu: MenuDef, menus: MenuDef[] = MENUS, lookup: (id: string) => Command | undefined = getCommand, all: () => Command[] = allCommands, subs: Record<string, SubmenuDef> = SUBMENUS): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const named = listedIds(menus, subs);
  // Prefixes the submenus here claim, so their stray commands don't also land at the bottom of the menu.
  const claimed = menu.items.filter((e) => e.startsWith('sub:')).flatMap((e) => subs[e.slice(4)]?.prefixes ?? []);
  for (const e of [...menu.items, ...contributedFor(menu.label)]) {
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
      const inner = resolveMenu({ label: sub.label, categories: [], items: sub.items }, menus, lookup, all, subs);
      const extra = all()
        .filter((c) => (sub.prefixes ?? []).some((p) => c.id.startsWith(p)) && !named.has(c.id) && !isDynamicCommand(c.id) && !isStaleCommand(c.id))
        .sort((a, b) => a.label.localeCompare(b.label));
      for (const c of extra) inner.push({ kind: 'command', command: c });
      if (inner.length) out.push({ kind: 'submenu', label: sub.label, items: inner });
      continue;
    }
    for (const id of expand(e, subs)) {
      const c = lookup(id);
      if (!c || seen.has(id) || isStaleCommand(id)) continue;
      seen.add(id);
      out.push({ kind: 'command', command: c });
    }
  }
  const extra = all()
    .filter((c) => menu.categories.includes(c.category) && !named.has(c.id) && !seen.has(c.id) && !claimed.some((p) => c.id.startsWith(p)) && !isDynamicCommand(c.id) && !isStaleCommand(c.id))
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

/** The menus that have anything in them. */
export function resolveMenus(): { menu: MenuDef; items: MenuItem[] }[] {
  syncDynamicCommands();
  return MENUS.map((menu) => ({ menu, items: resolveMenu(menu) })).filter((m) => m.items.length);
}
