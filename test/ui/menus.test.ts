// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/registry';
import { jumpTo } from '../../src/ui/MenuBar';
import { MENUS, resolveMenu, SUBMENUS, type MenuDef, type SubmenuDef } from '../../src/ui/menus';

const c = (id: string, label = id, category = 'Test'): Command => ({ id, label, category, run: () => {} });
const registry = (list: Command[]) => ({ lookup: (id: string) => list.find((x) => x.id === id), all: () => list });
const shape = (items: ReturnType<typeof resolveMenu>): unknown[] => items.map((i) => (i.kind === 'separator' ? '-' : i.kind === 'submenu' ? { [i.label]: shape(i.items) } : i.kind === 'heading' ? `# ${i.label}` : i.command.id));

describe('menu filtering', () => {
  const menu: MenuDef = { label: 'File', categories: ['File'], items: ['file.new', 'file.open', '-', 'file.save', 'file.ghost', '-', 'file.export'] };
  const other: MenuDef = { label: 'Edit', categories: ['Edit'], items: ['edit.undo'] };

  it('leaves out commands nobody registered', () => {
    const r = registry([c('file.new'), c('file.open'), c('file.export')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new', 'file.open', '-', 'file.export']);
  });
  it('never leaves a separator at the ends or two in a row', () => {
    const r = registry([c('file.open'), c('file.export')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.open', '-', 'file.export']);
    const r2 = registry([c('file.save')]);
    expect(shape(resolveMenu(menu, [menu, other], r2.lookup, r2.all))).toEqual(['file.save']);
  });
  it('is empty when nothing in it exists', () => {
    const r = registry([]);
    expect(resolveMenu(menu, [menu, other], r.lookup, r.all)).toEqual([]);
  });
  it('adds unlisted commands in the menu categories at the end, once', () => {
    const r = registry([c('file.new'), c('file.recent', 'Recent', 'File'), c('edit.undo', 'Undo', 'Edit'), c('misc.thing', 'Thing', 'Other')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new', '-', 'file.recent']);
  });
  it('does not repeat a command another menu names', () => {
    const r = registry([c('file.new'), c('edit.undo', 'Undo', 'File')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new']);
  });
  it('the real menus are named File, Edit, View, Artboards, Draw, Pixel, Animate, Rig, Effects, Plugins and Help', () => {
    expect(MENUS.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Artboards', 'Draw', 'Pixel', 'Animate', 'Rig', 'Effects', 'Plugins', 'Help']);
  });
});

describe('submenus', () => {
  const subs: Record<string, SubmenuDef> = { exp: { label: 'Export', items: ['file.export', '-', 'file.exportGif'], prefixes: ['file.export'] } };
  const menu: MenuDef = { label: 'File', categories: ['File'], items: ['file.new', '-', 'sub:exp', 'audio.import'] };

  it('gathers its entries, plus unnamed commands with its prefix, and nothing of it repeats at the bottom', () => {
    const r = registry([c('file.new'), c('file.export'), c('file.exportGif'), c('file.exportPdf', 'PDF', 'File'), c('audio.import'), c('file.recent', 'Recent', 'File')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual(['file.new', '-', { Export: ['file.export', '-', 'file.exportGif', 'file.exportPdf'] }, 'audio.import', '-', 'file.recent']);
  });
  it('is left out when nothing in it exists', () => {
    const r = registry([c('file.new')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual(['file.new']);
  });
  it('the File menu keeps every export in one Export submenu', () => {
    expect(MENUS[0].items).toContain('sub:export');
    expect(MENUS[0].items.filter((e) => e.startsWith('file.export'))).toEqual([]);
    expect(SUBMENUS.export.items).toContain('file.export');
  });
});

describe('headings', () => {
  const subs: Record<string, SubmenuDef> = { exp: { label: 'Export', items: ['a', 'heading:Games', 'b', 'heading:Empty', 'heading:Other', 'c'] } };
  const menu: MenuDef = { label: 'File', categories: [], items: ['sub:exp'] };
  it('keep a heading only when a command follows it', () => {
    const r = registry([c('a'), c('b'), c('c')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual([{ Export: ['a', '# Games', 'b', '# Other', 'c'] }]);
    const r2 = registry([c('a')]);
    expect(shape(resolveMenu(menu, [menu], r2.lookup, r2.all, subs))).toEqual([{ Export: ['a'] }]);
  });
});

describe('the real menus', async () => {
  await import('../../src/renderer/features');
  const { resolveMenus } = await import('../../src/ui/menus');
  type Item = ReturnType<typeof resolveMenu>[number];
  const flat = (items: Item[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? flat(i.items) : []));
  const menu = (label: string) => resolveMenus().find((m) => m.menu.label === label)!.items;
  const depth = (items: Item[]): number => items.filter((i) => i.kind !== 'separator' && i.kind !== 'heading').length;

  it('View is short enough to see, with workspaces near the top', () => {
    const items = menu('View');
    expect(depth(items)).toBeLessThan(40);
    const ids = items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : []));
    for (const id of ['view.saveWorkspace', 'view.manageWorkspaces', 'view.resetLayout', 'view.workspace.draw', 'view.workspace.pixel']) expect(ids).toContain(id);
    expect(ids.indexOf('view.saveWorkspace')).toBeLessThan(15);
  });
  it('Snapping, panels and windows are their own submenus', () => {
    const subs = menu('View').filter((i) => i.kind === 'submenu').map((i) => (i.kind === 'submenu' ? i.label : ''));
    expect(subs).toEqual(expect.arrayContaining(['Snapping', 'Panels', 'Panel windows and tools']));
    const snap = menu('View').find((i) => i.kind === 'submenu' && i.label === 'Snapping');
    expect(flat(snap && snap.kind === 'submenu' ? snap.items : [])).toEqual(expect.arrayContaining(['view.snap', 'view.snapOptions', 'view.snap.guides', 'view.snap.artboards']));
    expect(flat(menu('View').filter((i) => i.kind === 'command'))).not.toContain('view.snap.guides');
  });
  it('Artboards has its own menu and View no longer carries artboard commands', () => {
    const own = flat(menu('Artboards'));
    for (const id of ['artboards.new', 'artboards.delete', 'artboards.makeVariation', 'artboards.fitFill', 'artboards.pictureFirst', 'artboards.zoomTo']) expect(own).toContain(id);
    expect(flat(menu('View')).filter((id) => id.startsWith('artboards.') && id !== 'view.panel.artboards')).toEqual([]);
  });
  it('every View and Artboards command is still in some menu (and in the palette)', () => {
    const everything = new Set(resolveMenus().flatMap((m) => flat(m.items)));
    return import('../../src/core/registry').then(({ allCommands }) => {
      const missing = allCommands()
        .filter((cmd) => (cmd.category === 'View' || cmd.category === 'Artboards') && !cmd.id.startsWith('view.workspace.'))
        .filter((cmd) => !everything.has(cmd.id))
        .map((cmd) => cmd.id);
      expect(missing).toEqual([]);
    });
  });
  it('no menu lists a command twice', () => {
    for (const m of resolveMenus()) {
      const ids = flat(m.items);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), m.menu.label).toEqual([]);
    }
  });
  it('File lists the two open-a-picture commands once, in Import, not at the bottom', () => {
    const file = menu('File');
    expect(flat(file.filter((i) => i.kind === 'command'))).not.toContain('file.openPicture');
    expect(flat(file).filter((id) => id === 'file.openPicture' || id === 'file.openAseprite')).toHaveLength(2);
  });
  it('Export is grouped: popular first, then game engines (Godot add-on there), then other', () => {
    const exp = menu('File').find((i) => i.kind === 'submenu' && i.label === 'Export');
    const rows = exp && exp.kind === 'submenu' ? exp.items.map((i) => (i.kind === 'heading' ? `# ${i.label}` : i.kind === 'command' ? i.command.id : '-')) : [];
    const at = (x: string) => rows.indexOf(x);
    expect(at('# Popular')).toBeLessThan(at('# Game engines'));
    expect(at('# Game engines')).toBeLessThan(at('file.exportGodotAddon'));
    expect(at('file.exportGodotAddon')).toBeLessThan(at('# Other'));
    expect(at('file.exportLottie')).toBeLessThan(at('# Game engines'));
    expect(at('file.exportPsd')).toBeGreaterThan(at('# Other'));
    expect(rows[0]).toBe('file.export');
  });
});

describe('menu keys', () => {
  it('Home, End and the Page keys land inside the list', () => {
    expect(jumpTo('Home', 5, 20)).toBe(0);
    expect(jumpTo('End', 5, 20)).toBe(19);
    expect(jumpTo('PageDown', 5, 20)).toBe(13);
    expect(jumpTo('PageDown', 15, 20)).toBe(19);
    expect(jumpTo('PageUp', 3, 20)).toBe(0);
  });
});
