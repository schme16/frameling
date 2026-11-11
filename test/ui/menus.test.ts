// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/registry';
import { MENUS, resolveMenu, SUBMENUS, type MenuDef, type SubmenuDef } from '../../src/ui/menus';

const c = (id: string, label = id, category = 'Test'): Command => ({ id, label, category, run: () => {} });
const registry = (list: Command[]) => ({ lookup: (id: string) => list.find((x) => x.id === id), all: () => list });
const shape = (items: ReturnType<typeof resolveMenu>): unknown[] => items.map((i) => (i.kind === 'separator' ? '-' : i.kind === 'submenu' ? { [i.label]: shape(i.items) } : i.command.id));

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
  it('the real menus are named File, Edit, View, Draw, Pixel, Animate, Rig, Effects, Plugins and Help', () => {
    expect(MENUS.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Rig', 'Effects', 'Plugins', 'Help']);
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
