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
    items: ['file.new', 'file.open', 'file.openRecent', 'file.openPlayable', 'file.recover', '-', 'file.save', 'file.saveAs', 'file.saveAsTemplate', 'file.importTemplate', '-', 'sub:export', 'audio.import'],
  },
  {
    label: 'Edit',
    categories: ['Edit'],
    items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'select.all', 'select.none', '-', 'document.settings', 'view.preferences'],
  },
  {
    label: 'View',
    categories: ['View'],
    items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.zoom100', 'view.center', 'view.pixelGrid', 'view.emptyGhost', '-', 'view.rulers', 'view.guides', 'view.snap', 'view.lockGuides', 'view.clearGuides', '-', 'view.gridSquare', 'view.gridIso', 'view.perspective1', 'view.perspective2', 'view.showPerspective', 'view.removePerspective', 'view.gridSettings', '-', 'view.lightTable', 'view.lightTableDrawing', 'view.clearLightTable', '-', 'group:panels', '-', 'group:workspaces', 'view.saveWorkspace', 'view.resetLayout', '-', 'view.toggleTheme', 'view.nextTheme', 'view.themes', 'view.toggleLook', '-', 'view.commandPalette'],
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
    items: ['timeline.play', 'timeline.toggleLoop', 'timeline.togglePingPong', 'timeline.toggleOnion', 'timeline.onionKeysOnly', '-', 'timeline.setIn', 'timeline.setOut', 'timeline.clearInOut', '-', 'timeline.prevFrame', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.nextKey', 'timeline.firstFrame', 'timeline.lastFrame', '-', 'timeline.newKey', 'timeline.emptyFrame', 'timeline.duplicateKey', 'timeline.clearKey', '-', 'timeline.insertFrame', 'timeline.removeFrame', 'timeline.addMarker'],
  },
  {
    label: 'Rig',
    categories: ['Rig'],
    items: ['rig.addBones', 'tools.bone', 'tools.pose', '-', 'rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', '-', 'rig.togglePin', 'rig.resetPose', 'rig.mirrorPose', 'rig.swapSides', 'rig.savePose', '-', 'view.panel.rig', 'rig.boneLook'],
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

/** A submenu, named in a menu as `sub:<key>`. */
export interface SubmenuDef {
  label: string;
  items: MenuEntry[];
  /** Commands nobody names whose id starts with one of these join it at the end (new export formats land here). */
  prefixes?: string[];
}

export const SUBMENUS: Record<string, SubmenuDef> = {
  export: {
    label: 'Export',
    items: ['file.export', 'file.exportAgain', '-', 'file.exportInteractives', 'file.exportLottie', 'file.exportSvgAnimated', 'file.exportProres', 'file.exportPsd', 'file.exportPdf', 'file.exportIllustrator', 'tiles.export', '-', 'file.toggleUpdatePlayable'],
    prefixes: ['file.export'],
  },
};

export type MenuItem = { kind: 'command'; command: Command } | { kind: 'separator' } | { kind: 'submenu'; label: string; items: MenuItem[] };

function expand(entry: string, subs: Record<string, SubmenuDef> = SUBMENUS): string[] {
  if (entry.startsWith('sub:')) return (subs[entry.slice(4)]?.items ?? []).filter((e) => e !== '-').flatMap((e) => expand(e, subs));
  if (entry === 'group:tools') return allTools().map((t) => `tools.${t.id}`);
  if (entry === 'group:panels') return allPanels().map((p) => `view.panel.${p.id}`);
  if (entry === 'group:workspaces') return listWorkspaces().map((w) => `view.workspace.${w.id}`);
  return [entry];
}

/** Every command id named in any menu, so the auto-added ones don't repeat across menus. */
function listedIds(menus: MenuDef[], subs: Record<string, SubmenuDef> = SUBMENUS): Set<string> {
  const s = new Set<string>();
  for (const m of menus) for (const e of m.items) for (const id of expand(e, subs)) s.add(id);
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
  for (const e of menu.items) {
    if (e === '-') {
      out.push({ kind: 'separator' });
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
