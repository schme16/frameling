// The menu bar, as lists of command ids. Menus are built from the registry: an id nobody has registered is simply
// left out, so a feature that isn't there yet never leaves a dead entry. Commands that register under a menu's
// categories and aren't listed anywhere turn up at the bottom of that menu on their own.
import { allCommands, allPanels, allTools, getCommand, type Command } from '../core/registry';
import { isDynamicCommand, isStaleCommand, syncDynamicCommands } from './dynamic';
import { listWorkspaces } from './dock';

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
    items: ['file.new', 'file.open', 'file.openRecent', 'file.openPlayable', 'file.recover', '-', 'file.save', 'file.saveAs', 'file.saveAsTemplate', 'file.importTemplate', '-', 'file.export', 'file.exportInteractives', 'file.exportLottie', 'file.exportSvgAnimated', 'file.exportAgain', 'file.toggleUpdatePlayable', '-', 'audio.import'],
  },
  {
    label: 'Edit',
    categories: ['Edit'],
    items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'select.all', 'select.none', '-', 'view.preferences'],
  },
  {
    label: 'View',
    categories: ['View'],
    items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'view.center', 'view.pixelGrid', '-', 'group:panels', '-', 'group:workspaces', 'view.saveWorkspace', 'view.resetLayout', '-', 'view.toggleTheme', 'view.nextTheme', 'view.themes', 'view.toggleLook', '-', 'view.commandPalette'],
  },
  {
    label: 'Draw',
    categories: ['Draw', 'Drawing', 'Tools', 'Select', 'Selection', 'Shape', 'Shapes', 'Geometry', 'Layers', 'Arrange'],
    items: ['group:tools', '-', 'select.flipH', 'select.flipV', '-', 'arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', '-', 'layers.addVector', 'layers.addPixel', 'layers.duplicate', 'layers.delete', '-', 'layers.up', 'layers.down', 'layers.toggleVisible', 'layers.toggleLocked'],
  },
  {
    label: 'Pixel',
    categories: ['Pixel'],
    items: ['tools.pencil', 'tools.shade', 'tools.dither', 'pixel.mirror', '-', 'pixel.flipH', 'pixel.flipV', 'pixel.rotateRight', 'pixel.rotateLeft', 'pixel.rotate180', 'pixel.rotate', '-', 'pixel.outline', 'pixel.outlineInside', '-', 'view.panel.palette', 'pixel.paletteLock', 'pixel.reduceToPalette', 'palette.fromDrawing', 'palette.import', 'palette.exportGpl', 'palette.exportHex', 'palette.exportPal'],
  },
  {
    label: 'Animate',
    categories: ['Animate', 'Animation', 'Timeline', 'Frames', 'Sound', 'Lip sync'],
    items: ['timeline.play', 'timeline.toggleLoop', 'timeline.toggleOnion', '-', 'timeline.prevFrame', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.nextKey', 'timeline.firstFrame', 'timeline.lastFrame', '-', 'timeline.newKey', 'timeline.emptyFrame', 'timeline.duplicateKey', 'timeline.clearKey', '-', 'timeline.insertFrame', 'timeline.removeFrame', 'timeline.addMarker'],
  },
  {
    label: 'Rig',
    categories: ['Rig'],
    items: ['rig.addBones', 'tools.bone', 'tools.pose', '-', 'rig.autoAttach', 'rig.bendLayer', 'rig.detachLayer', '-', 'rig.togglePin', 'rig.resetPose', 'rig.mirrorPose', 'rig.swapSides', 'rig.savePose', '-', 'view.panel.rig', 'rig.boneLook'],
  },
  {
    label: 'Effects',
    categories: ['Effects'],
    items: ['view.panel.effects', '-', 'effects.add.blur', 'effects.add.glow', 'effects.add.shadow', 'effects.add.adjust', 'effects.add.outline', 'effects.add.pixelate', '-', 'layers.clipToBelow', 'layers.useAsMask', '-', 'layers.newFolder', 'layers.ungroupFolder', '-', 'effects.reset'],
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

export type MenuItem = { kind: 'command'; command: Command } | { kind: 'separator' };

function expand(entry: string): string[] {
  if (entry === 'group:tools') return allTools().map((t) => `tools.${t.id}`);
  if (entry === 'group:panels') return allPanels().map((p) => `view.panel.${p.id}`);
  if (entry === 'group:workspaces') return listWorkspaces().map((w) => `view.workspace.${w.id}`);
  return [entry];
}

/** Every command id named in any menu, so the auto-added ones don't repeat across menus. */
function listedIds(menus: MenuDef[]): Set<string> {
  const s = new Set<string>();
  for (const m of menus) for (const e of m.items) for (const id of expand(e)) s.add(id);
  return s;
}

/**
 * The entries to show for a menu: named commands that exist, then any extra registered commands in the menu's
 * categories. Separators are tidied so there are never two in a row, or one at either end.
 */
export function resolveMenu(menu: MenuDef, menus: MenuDef[] = MENUS, lookup: (id: string) => Command | undefined = getCommand, all: () => Command[] = allCommands): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  for (const e of menu.items) {
    if (e === '-') {
      out.push({ kind: 'separator' });
      continue;
    }
    for (const id of expand(e)) {
      const c = lookup(id);
      if (!c || seen.has(id) || isStaleCommand(id)) continue;
      seen.add(id);
      out.push({ kind: 'command', command: c });
    }
  }
  const named = listedIds(menus);
  const extra = all()
    .filter((c) => menu.categories.includes(c.category) && !named.has(c.id) && !seen.has(c.id) && !isDynamicCommand(c.id) && !isStaleCommand(c.id))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (extra.length) {
    out.push({ kind: 'separator' });
    for (const c of extra) out.push({ kind: 'command', command: c });
  }
  return tidy(out);
}

function tidy(list: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of list) {
    if (it.kind === 'separator' && (!out.length || out[out.length - 1].kind === 'separator')) continue;
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
