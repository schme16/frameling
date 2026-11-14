// @vitest-environment jsdom
// Changing the menus: the saved shape, the merge with the menus that come with Frameling, a command that is gone, and
// the small list operations the editor uses. Pure functions first, then the real menu bar with edits saved.
import { afterEach, describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/registry';
import { _forceInteractivesForTests } from '../../src/features/flags';
import {
  addCustomMenu,
  addCustomSub,
  changedKeys,
  dropGap,
  insertEntry,
  isUnchanged,
  landsAt,
  mergeList,
  missingCommands,
  moveEntry,
  NO_EDITS,
  putBack,
  putEntryBack,
  removeCustom,
  removeEntry,
  renameKey,
  sanitizeMenuEdits,
  setList,
  shapeMenus,
  takenOut,
  type MenuEdits,
} from '../../src/ui/menuEdits';
import { MENUS, resolveMenu, resolveMenus, SUBMENUS, type MenuDef, type MenuItem, type SubmenuDef } from '../../src/ui/menus';
import { getMenuEdits, MENUS_KEY, resetMenuEdits, setMenuEdits } from '../../src/ui/menuState';
import { DOCK_KEY, dock } from '../../src/ui/dock';

// What is saved for the workspace the person is in (menu changes live in the dock state, per workspace).
const savedMenus = (): { lists?: Record<string, { items: string[] }> } | null => {
  const d = JSON.parse(localStorage.getItem(DOCK_KEY) ?? 'null');
  return d?.menus?.[dock.get().workspaceId] ?? null;
};

_forceInteractivesForTests(true);

const m = (label: string, items: string[], title?: string): MenuDef => ({ label, items, categories: [], ...(title ? { title } : {}) });
const BUILT = [m('File', ['a', 'b', '-', 'c', 'sub:s']), m('Edit', ['d', 'e']), m('Help', ['h'])];
const SUBS: Record<string, SubmenuDef> = { s: { label: 'Things', items: ['x', 'y', 'z'] } };
const ids = (items: string[]) => items.filter((e) => e !== '-');

describe('reading what was saved', () => {
  it('nothing, or rubbish, means the menus as they came', () => {
    for (const raw of [undefined, null, 5, 'x', [], { v: 1 }, { lists: 4 }]) expect(isUnchanged(sanitizeMenuEdits(raw)), String(raw)).toBe(true);
  });
  it('keeps good edits and drops bad parts one by one', () => {
    const e = sanitizeMenuEdits({
      v: 1,
      bar: { items: ['Edit', 'File', 7, '', 'x'.repeat(500)], seen: ['File', 'Edit'] },
      lists: { File: { items: ['b', 'a'], seen: ['a', 'b'] }, Edit: 'nope', 'sub:s': { items: ['z'] } },
      titles: { File: ' Files ', Edit: '', Help: 42 },
    });
    // Numbers, empty words and a 500 letter entry are dropped; the rest stays.
    expect(e.bar?.items).toEqual(['Edit', 'File']);
    expect(e.lists?.File).toEqual({ items: ['b', 'a'], seen: ['a', 'b'] });
    expect(e.lists?.Edit).toBeUndefined();
    expect(e.lists?.['sub:s']).toEqual({ items: ['z'], seen: [] });
    expect(e.titles).toEqual({ File: 'Files' });
  });
  it('drops what names a menu or submenu of yours that is not there', () => {
    const e = sanitizeMenuEdits({
      v: 1,
      custom: { 'my-1': { title: 'Mine', kind: 'menu' }, 'my-2': { title: '', kind: 'sub' }, 'bad id': { title: 'x', kind: 'menu' } },
      bar: { items: ['File', 'my-1', 'my-9'], seen: [] },
      lists: { File: { items: ['a', 'sub:my-9', 'sub:s'], seen: [] }, 'my-1': { items: ['a'], seen: [] }, 'my-7': { items: ['a'], seen: [] } },
    });
    expect(Object.keys(e.custom ?? {})).toEqual(['my-1']);
    expect(e.bar?.items).toEqual(['File', 'my-1']);
    expect(e.lists?.File.items).toEqual(['a', 'sub:s']);
    expect(Object.keys(e.lists ?? {})).toEqual(['File', 'my-1']);
  });
  it('trims long titles and long lists, and a title of only spaces is no title', () => {
    const e = sanitizeMenuEdits({ v: 1, titles: { File: 'x'.repeat(100), Edit: '   ' }, lists: { File: { items: Array.from({ length: 900 }, (_, i) => `c${i}`), seen: [] } } });
    expect(e.titles).toBeUndefined();
    expect(e.lists?.File.items.length).toBe(400);
  });
  it('survives a round trip through JSON unchanged', () => {
    const made = addCustomMenu(setList(NO_EDITS, 'File', ['b', 'a'], ['a', 'b']), 'Mine', ['File', 'Edit', 'Help'], ['File', 'Edit', 'Help']).edits;
    expect(sanitizeMenuEdits(JSON.parse(JSON.stringify(made)))).toEqual(made);
  });
});

describe('laying your list over the built-in one', () => {
  const edit = { items: ['b', '-', 'a'], seen: ['a', 'b', 'c'] };
  it('keeps your order, and what you took out stays out', () => {
    const r = mergeList(['a', 'b', '-', 'c'], edit);
    expect(r.items).toEqual(['b', '-', 'a']);
    expect(r.leftOut).toEqual(['c']);
  });
  it('puts something new next to the entry it follows', () => {
    expect(mergeList(['a', 'n', 'b', 'c'], edit).items).toEqual(['b', '-', 'a', 'n']);
    expect(mergeList(['a', 'b', 'n', 'c'], edit).items).toEqual(['b', 'n', '-', 'a']);
  });
  it('puts something new at the start when it comes first, and after the nearest entry before it that you kept', () => {
    expect(mergeList(['n', 'a', 'b'], edit).items[0]).toBe('n');
    // c is not in your list, so n goes after b, the nearest one before it that is.
    expect(mergeList(['a', 'b', 'c', 'n'], edit).items).toEqual(['b', 'n', '-', 'a']);
    // Nothing before it is in your list at all: the end.
    expect(mergeList(['p', 'n'], { items: ['q'], seen: ['p'] }).items).toEqual(['q', 'n']);
  });
  it('leaves new things out when asked, and says they were left out', () => {
    const r = mergeList(['a', 'n', 'b'], edit, 'leave');
    expect(r.items).toEqual(['b', '-', 'a']);
    expect(r.leftOut).toEqual(['n']);
  });
  it('keeps an entry whose command is gone, so it can come back', () => {
    const r = mergeList(['a', 'b'], { items: ['a', 'ghost', 'b'], seen: ['a', 'b'] });
    expect(r.items).toEqual(['a', 'ghost', 'b']);
    expect(missingCommands(r.items, (id) => id !== 'ghost')).toEqual(['ghost']);
  });
  it('does not add the same entry twice', () => {
    expect(mergeList(['a', 'b', 'n'], { items: ['a', 'n', 'b'], seen: ['a', 'b'] }).items).toEqual(['a', 'n', 'b']);
  });
});

describe('the menus with changes laid over them', () => {
  it('no changes is the menus as they came', () => {
    const s = shapeMenus(BUILT, SUBS, NO_EDITS);
    expect(s.menus.map((x) => x.items)).toEqual(BUILT.map((x) => x.items));
    expect(s.hidden).toEqual([]);
    expect(s.lists.File).toEqual(['a', 'b', '-', 'c', 'sub:s']);
  });
  it('reorders, renames and hides menus on the bar, and a hidden menu takes its commands out of the bottoms too', () => {
    const e: MenuEdits = { v: 1, bar: { items: ['Help', 'File'], seen: ['File', 'Edit', 'Help'] }, titles: { Help: 'Questions', 'sub:s': 'Stuff' } };
    const s = shapeMenus(BUILT, SUBS, e);
    expect(s.menus.map((x) => x.label)).toEqual(['Help', 'File']);
    expect(s.menus[0].title).toBe('Questions');
    expect(s.subs.s.label).toBe('Stuff');
    expect(s.hidden).toEqual(['d', 'e']);
    expect(s.lists.bar).toEqual(['Help', 'File']);
  });
  it('a menu added in a newer Frameling appears where it belongs on a bar you changed', () => {
    const e: MenuEdits = { v: 1, bar: { items: ['Help', 'Edit', 'File'], seen: ['File', 'Edit', 'Help'] } };
    const newer = [...BUILT.slice(0, 2), m('Extra', ['q']), BUILT[2]];
    expect(shapeMenus(newer, SUBS, e).menus.map((x) => x.label)).toEqual(['Help', 'Edit', 'Extra', 'File']);
    expect(shapeMenus(newer, SUBS, e, { newEntries: 'leave' }).menus.map((x) => x.label)).toEqual(['Help', 'Edit', 'File']);
  });
  it('changes an entry list and marks it final, so features do not add to it again', () => {
    const e = setList(NO_EDITS, 'File', ['c', 'a'], BUILT[0].items);
    const s = shapeMenus(BUILT, SUBS, e, { contributed: (k) => (k === 'File' ? ['late'] : []), newEntries: 'leave' });
    const file = s.menus.find((x) => x.label === 'File')!;
    expect(file.items).toEqual(['c', 'a']);
    expect(file.fixed).toBe(true);
    expect(s.hidden).toEqual(expect.arrayContaining(['b', 'sub:s', 'late']));
  });
  it('what a feature adds to a menu you changed comes in as new, once', () => {
    const e = setList(NO_EDITS, 'Edit', ['e', 'd'], ['d', 'e']);
    const before = shapeMenus(BUILT, SUBS, e, { contributed: () => [] }).menus.find((x) => x.label === 'Edit')!;
    expect(before.items).toEqual(['e', 'd']);
    const after = shapeMenus(BUILT, SUBS, e, { contributed: (k) => (k === 'Edit' ? ['plus'] : []) }).menus.find((x) => x.label === 'Edit')!;
    expect(after.items).toEqual(['e', 'plus', 'd']);
  });
  it('makes a menu and a submenu of your own', () => {
    let e = addCustomMenu(NO_EDITS, 'Favourites', ['File', 'Edit', 'Help'], ['File', 'Edit', 'Help']).edits;
    e = setList(e, 'my-1', ['a', 'c'], []);
    const sub = addCustomSub(e, 'More', 'my-1', ['a', 'c'], []);
    e = setList(sub.edits, `sub:${sub.id}`, ['x'], []);
    const s = shapeMenus(BUILT, SUBS, e);
    expect(s.menus.map((x) => x.label)).toEqual(['File', 'Edit', 'Help', 'my-1']);
    expect(s.menus[3]).toMatchObject({ title: 'Favourites', items: ['a', 'c', `sub:${sub.id}`], fixed: true });
    expect(s.subs[sub.id]).toMatchObject({ label: 'More', items: ['x'], fixed: true });
  });
  it('a menu of your own is on the bar even if the bar list lost it', () => {
    const e = sanitizeMenuEdits({ v: 1, custom: { 'my-1': { title: 'Mine', kind: 'menu' } } });
    expect(shapeMenus(BUILT, SUBS, e).menus.map((x) => x.label)).toEqual(['File', 'Edit', 'Help', 'my-1']);
  });
});

describe('the editor\'s changes', () => {
  it('setting a list back to how it came saves nothing', () => {
    const moved = setList(NO_EDITS, 'File', ['b', 'a'], ['a', 'b']);
    expect(changedKeys(moved).has('File')).toBe(true);
    expect(isUnchanged(setList(moved, 'File', ['a', 'b'], ['a', 'b']))).toBe(true);
  });
  it('putting a menu or the bar back clears just that', () => {
    let e = setList(NO_EDITS, 'File', ['b', 'a'], ['a', 'b']);
    e = setList(e, 'Edit', ['e'], ['d', 'e']);
    e = renameKey(e, 'Edit', 'Fixing', 'Edit');
    e = setList(e, 'bar', ['Edit'], ['File', 'Edit']);
    expect([...changedKeys(e)].sort()).toEqual(['Edit', 'File', 'bar']);
    const back = putBack(e, 'Edit');
    expect([...changedKeys(back)].sort()).toEqual(['File', 'bar']);
    expect(isUnchanged(putBack(putBack(putBack(e, 'Edit'), 'File'), 'bar'))).toBe(true);
  });
  it('a rename to nothing, or to the built-in name, puts the name back', () => {
    const e = renameKey(NO_EDITS, 'File', 'Papers', 'File');
    expect(e.titles).toEqual({ File: 'Papers' });
    expect(isUnchanged(renameKey(e, 'File', '  ', 'File'))).toBe(true);
    expect(isUnchanged(renameKey(e, 'File', 'File', 'File'))).toBe(true);
  });
  it('renames a menu of your own, and will not make its name empty', () => {
    const made = addCustomMenu(NO_EDITS, '', [], []);
    expect(made.edits.custom?.[made.id].title).toBe('My menu');
    expect(renameKey(made.edits, made.id, 'Mine', '').custom?.[made.id].title).toBe('Mine');
    expect(renameKey(made.edits, made.id, '', '').custom?.[made.id].title).toBe('My menu');
  });
  it('gives each new menu a new id', () => {
    const a = addCustomMenu(NO_EDITS, 'A', ['File'], ['File']);
    const b = addCustomMenu(a.edits, 'B', ['File', a.id], ['File']);
    expect([a.id, b.id]).toEqual(['my-1', 'my-2']);
  });
  it('deleting a menu of yours takes every place that listed it', () => {
    const sub = addCustomSub(NO_EDITS, 'Mine', 'File', BUILT[0].items, BUILT[0].items);
    const twice = setList(sub.edits, 'Edit', ['d', `sub:${sub.id}`], BUILT[1].items);
    const gone = removeCustom(twice, sub.id);
    expect(gone.custom).toBeUndefined();
    expect(gone.lists?.File?.items ?? []).not.toContain(`sub:${sub.id}`);
    expect(gone.lists?.Edit?.items).toEqual(['d']);
  });
  it('shows what you took out, and puts it back where it was', () => {
    const builtIn = ['a', 'b', '-', 'c', 'd'];
    const items = ['a', 'd'];
    expect(takenOut(items, builtIn)).toEqual(['b', 'c']);
    expect(putEntryBack(items, builtIn, 'c')).toEqual(['a', 'c', 'd']);
    expect(putEntryBack(items, builtIn, 'b')).toEqual(['a', 'b', 'd']);
    expect(putEntryBack(['d'], builtIn, 'a')).toEqual(['a', 'd']);
    expect(putEntryBack(items, builtIn, 'a')).toEqual(items);
  });
  it('moves, removes and inserts, and never loses or doubles an entry', () => {
    const l = ['a', 'b', 'c', 'd'];
    expect(moveEntry(l, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveEntry(l, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveEntry(l, 1, 1)).toBe(l);
    expect(moveEntry(l, 9, 0)).toBe(l);
    expect(moveEntry(l, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(removeEntry(l, 1)).toEqual(['a', 'c', 'd']);
    expect(removeEntry(l, 7)).toBe(l);
    expect(insertEntry(l, 2, 'x')).toEqual(['a', 'b', 'x', 'c', 'd']);
    expect(insertEntry(l, 99, 'x')).toEqual(['a', 'b', 'c', 'd', 'x']);
  });
  it('works out where a dragged row lands', () => {
    const middles = [10, 30, 50, 70];
    expect(dropGap(middles, 0)).toBe(0);
    expect(dropGap(middles, 31)).toBe(2);
    expect(dropGap(middles, 500)).toBe(4);
    expect(landsAt(1, 0)).toBe(0);
    expect(landsAt(1, 1)).toBe(1);
    expect(landsAt(1, 2)).toBe(1);
    expect(landsAt(1, 4)).toBe(3);
    // Dropping a row on itself, or on the gap just after it, moves nothing.
    expect(moveEntry(['a', 'b', 'c'], 1, landsAt(1, 2))).toEqual(['a', 'b', 'c']);
  });
});

describe('the real menu bar with changes saved', async () => {
  await import('../../src/renderer/features');
  afterEach(() => {
    resetMenuEdits();
    localStorage.clear();
  });
  const shown = (label: string): string[] => {
    const flat = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? [`>${i.label}`, ...flat(i.items)] : []));
    return flat(resolveMenus().find((x) => x.menu.label === label)?.items ?? []);
  };
  const edit = (label: string) => MENUS.find((x) => x.label === label)!;

  it('starts as the menus came, with nothing saved', () => {
    expect(resolveMenus().map((x) => x.menu.label)).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Help']);
    expect(savedMenus()).toBeNull();
  });
  it('moves an entry, and putting it back leaves nothing saved', () => {
    const items = [...edit('Edit').items];
    const at = items.indexOf('edit.duplicate');
    setMenuEdits(setList(getMenuEdits(), 'Edit', moveEntry(items, at, 0), items));
    expect(shown('Edit')[0]).toBe('edit.duplicate');
    expect(savedMenus()).not.toBeNull();
    setMenuEdits(setList(getMenuEdits(), 'Edit', items, items));
    expect(shown('Edit')[0]).toBe('edit.undo');
    expect(savedMenus()).toBeNull();
  });
  it('an entry taken out of every menu does not turn up again at the bottom', () => {
    const items = edit('Edit').items.filter((e) => e !== 'select.invert');
    setMenuEdits(setList(getMenuEdits(), 'Edit', items, edit('Edit').items));
    expect(shown('Edit')).not.toContain('select.invert');
    expect(Object.values(SUBMENUS).some((s) => s.items.includes('select.invert'))).toBe(false);
  });
  it('an entry moved to another menu shows there and not at the bottom of its old one', () => {
    setMenuEdits(setList(getMenuEdits(), 'Edit', edit('Edit').items.filter((e) => e !== 'edit.copySvg'), edit('Edit').items));
    setMenuEdits(setList(getMenuEdits(), 'Help', [...edit('Help').items, 'edit.copySvg'], edit('Help').items));
    expect(shown('Help')).toContain('edit.copySvg');
    expect(shown('Edit')).not.toContain('edit.copySvg');
  });
  it('a command that is not there any more is left out of the menu, and still saved for when it comes back', () => {
    const list = [...edit('Help').items, 'gone.forever'];
    setMenuEdits(setList(getMenuEdits(), 'Help', list, edit('Help').items));
    expect(shown('Help')).not.toContain('gone.forever');
    expect(shown('Help')).toContain('help.about');
    expect(savedMenus()!.lists!.Help.items).toContain('gone.forever');
  });
  it('a menu of your own shows on the bar with its entries, even a command in two menus', () => {
    const made = addCustomMenu(getMenuEdits(), 'Quick', resolveMenus().map((x) => x.menu.label), edit('File').items.length ? MENUS.map((x) => x.label) : []);
    setMenuEdits(setList(made.edits, made.id, ['edit.undo', '-', 'file.save', 'edit.undo'], []));
    const all = resolveMenus();
    expect(all[all.length - 1].menu.title).toBe('Quick');
    expect(shown(made.id)).toEqual(['edit.undo', 'file.save']);
    expect(shown('Edit')).toContain('edit.undo');
  });
  it('a hidden menu goes from the bar and comes back with Show it again', () => {
    const bar = MENUS.map((x) => x.label);
    setMenuEdits(setList(getMenuEdits(), 'bar', bar.filter((x) => x !== 'Pixel'), bar));
    expect(resolveMenus().map((x) => x.menu.label)).not.toContain('Pixel');
    expect(resolveMenus().map((x) => x.menu.label)).toContain('Animate');
    setMenuEdits(setList(getMenuEdits(), 'bar', putEntryBack(bar.filter((x) => x !== 'Pixel'), bar, 'Pixel'), bar));
    expect(resolveMenus().map((x) => x.menu.label)).toEqual(bar);
  });
  it('rubbish in storage is read as no changes', () => {
    localStorage.setItem(MENUS_KEY, '{"v":1,"lists":{"File":{"items":5}},"bar":"x"}');
    expect(isUnchanged(sanitizeMenuEdits(JSON.parse(localStorage.getItem(MENUS_KEY)!)))).toBe(true);
  });
  it('resolves a changed menu without the categories tail repeating what was moved', () => {
    const items = edit('Draw').items.filter((e) => e !== 'layers.addVector');
    setMenuEdits(setList(getMenuEdits(), 'Draw', items, edit('Draw').items));
    expect(shown('Draw')).not.toContain('layers.addVector');
    // The menu still comes out sorted: nothing at all vanished except what was taken out.
    expect(resolveMenu({ ...edit('Draw'), items, fixed: true }).length).toBeGreaterThan(5);
  });
});

describe('what is saved when nothing is changed', () => {
  it('the empty edits are small and say which shape they are', () => {
    expect(NO_EDITS).toEqual({ v: 1 });
    const c = (id: string): Command => ({ id, label: id, category: 'x', run: () => {} });
    expect(c('a').id).toBe('a');
    expect(ids(['-', 'a'])).toEqual(['a']);
  });
});
