// @vitest-environment jsdom
// Menu changes are kept per workspace: saved with it, carried in its file, moved over from the old single set.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { line } from '../../src/ui/mascot/lines';
import {
  applyWorkspace,
  deleteWorkspace,
  DOCK_KEY,
  dock,
  importWorkspace,
  menuEditsOf,
  menuMapOf,
  resetDock,
  restoreMenuMap,
  saveWorkspace,
  shareMenusWithAll,
  workspaceText,
} from '../../src/ui/dock';
import { getMenuEdits, resetMenuEdits, setMenuEdits } from '../../src/ui/menuState';
import { isUnchanged, setList, type MenuEdits } from '../../src/ui/menuEdits';
import { MENUS } from '../../src/ui/menus';
import { parseWorkspaceText, WORKSPACE_FORMAT } from '../../src/ui/workspaceFile';
import { cleanBrought, MENUS_KEY, migrateLegacyMenus, ownAfter, sanitizeMenuMap } from '../../src/ui/workspaceMenus';

beforeAll(async () => {
  await import('../../src/renderer/features');
});
beforeEach(() => {
  localStorage.clear();
  resetDock();
});

const helpItems = MENUS.find((m) => m.label === 'Help')!.items;
/** Help with its first entry taken out: a small, real change. */
const changedHelp = (): MenuEdits => setList({ v: 1 }, 'Help', helpItems.slice(1), helpItems);
const titled = (title: string): MenuEdits => ({ v: 1, titles: { File: title } });

describe('the pure rules', () => {
  it('a file with nothing in it, or rubbish, brings nothing', () => {
    expect(cleanBrought(undefined)).toBeUndefined();
    expect(cleanBrought({ v: 1 })).toBeUndefined();
    expect(cleanBrought('x')).toBeUndefined();
    expect(cleanBrought({ v: 1, lists: { File: { items: 5 } } })).toBeUndefined();
    expect(cleanBrought(titled('Files'))).toEqual(titled('Files'));
  });
  it('the saved map keeps only good workspace ids with object values, and keeps an empty one', () => {
    const map = sanitizeMenuMap({ draw: titled('A'), __proto__: titled('B'), 'bad id!': titled('C'), x: 'no', y: [1], none: { v: 1 } });
    expect(Object.keys(map).sort()).toEqual(['draw', 'none']);
    expect(sanitizeMenuMap(5)).toEqual({});
    expect(sanitizeMenuMap([titled('A')])).toEqual({});
  });
  it('putting the menus back keeps nothing, unless the workspace brings changes: then it keeps an empty set', () => {
    expect(ownAfter({ v: 1 }, undefined)).toBeUndefined();
    expect(ownAfter({ v: 1 }, titled('A'))).toEqual({ v: 1 });
    expect(ownAfter(titled('A'), titled('A'))).toBeUndefined();
    expect(ownAfter(titled('B'), titled('A'))).toEqual(titled('B'));
  });
  it('old menu changes go to the workspace the person was on, once', () => {
    expect(migrateLegacyMenus(titled('A'), undefined, 'animate')).toEqual({ animate: titled('A') });
    expect(migrateLegacyMenus(titled('A'), {}, 'animate')).toBeUndefined();
    expect(migrateLegacyMenus(null, undefined, 'animate')).toBeUndefined();
    expect(migrateLegacyMenus({ v: 1 }, undefined, 'animate')).toBeUndefined();
    expect(migrateLegacyMenus('rubbish', undefined, 'animate')).toBeUndefined();
  });
});

describe('each workspace has its own menus', () => {
  it('a change in one workspace is not in the others, and comes back when you come back', () => {
    setMenuEdits(titled('Files'));
    expect(getMenuEdits().titles).toEqual({ File: 'Files' });
    applyWorkspace('pixel');
    expect(isUnchanged(getMenuEdits())).toBe(true);
    setMenuEdits(changedHelp());
    applyWorkspace('draw');
    expect(getMenuEdits().titles).toEqual({ File: 'Files' });
    expect(getMenuEdits().lists).toBeUndefined();
    applyWorkspace('pixel');
    expect(getMenuEdits().lists?.Help.items).toEqual(helpItems.slice(1));
  });
  it('is written with the dock, by workspace id, and nothing is written for an untouched workspace', () => {
    expect(JSON.parse(localStorage.getItem(DOCK_KEY) ?? '{}').menus).toBeUndefined();
    applyWorkspace('animate');
    setMenuEdits(titled('Files'));
    const saved = JSON.parse(localStorage.getItem(DOCK_KEY)!).menus;
    expect(Object.keys(saved)).toEqual(['animate']);
    setMenuEdits({ v: 1 });
    expect(JSON.parse(localStorage.getItem(DOCK_KEY)!).menus).toBeUndefined();
  });
  it('the old storage key is not written any more', () => {
    setMenuEdits(titled('Files'));
    expect(localStorage.getItem(MENUS_KEY)).toBeNull();
  });
  it('resetMenuEdits puts back only this workspace', () => {
    setMenuEdits(titled('Files'));
    applyWorkspace('animate');
    setMenuEdits(titled('Frames'));
    resetMenuEdits();
    expect(isUnchanged(getMenuEdits())).toBe(true);
    applyWorkspace('draw');
    expect(getMenuEdits().titles).toEqual({ File: 'Files' });
  });
});

describe('saved with the workspace', () => {
  it('Save workspace keeps the menus you have, and they are there after switching away and back', () => {
    setMenuEdits(changedHelp());
    const ws = saveWorkspace('Mine')!;
    expect(ws.menus?.lists?.Help.items).toEqual(helpItems.slice(1));
    // The changes are now the workspace's own, no longer a separate entry.
    expect(dock.get().menus?.[ws.id]).toBeUndefined();
    // Draw, which you saved it from, keeps its own changes; Pixel is untouched.
    applyWorkspace('pixel');
    expect(isUnchanged(getMenuEdits())).toBe(true);
    applyWorkspace(ws.id);
    expect(getMenuEdits().lists?.Help.items).toEqual(helpItems.slice(1));
  });
  it('a workspace saved with no menu changes saves none', () => {
    expect(saveWorkspace('Plain')!.menus).toBeUndefined();
  });
  it('changing the menus in a saved workspace wins over what it brings, and putting them back goes to the plain menus', () => {
    setMenuEdits(titled('Files'));
    const ws = saveWorkspace('Mine')!;
    setMenuEdits(titled('Papers'));
    expect(getMenuEdits().titles).toEqual({ File: 'Papers' });
    expect(dock.get().user.find((w) => w.id === ws.id)!.menus?.titles).toEqual({ File: 'Files' });
    setMenuEdits({ v: 1 });
    expect(isUnchanged(getMenuEdits())).toBe(true);
    // Remembered across a restart as "put back", not forgotten.
    expect(JSON.parse(localStorage.getItem(DOCK_KEY)!).menus[ws.id]).toEqual({ v: 1 });
  });
  it('setting the same changes the workspace already brings keeps nothing of your own', () => {
    setMenuEdits(titled('Files'));
    const ws = saveWorkspace('Mine')!;
    setMenuEdits(titled('Papers'));
    setMenuEdits(titled('Files'));
    expect(dock.get().menus?.[ws.id]).toBeUndefined();
  });
  it('deleting a workspace takes its menu changes with it', () => {
    setMenuEdits(titled('Files'));
    const ws = saveWorkspace('Mine')!;
    setMenuEdits(titled('Papers'));
    deleteWorkspace(ws.id);
    expect(dock.get().menus?.[ws.id]).toBeUndefined();
    expect(dock.get().workspaceId).toBe('draw');
  });
});

describe('in a shared workspace file', () => {
  it('the file carries the menu changes, and importing it brings them', () => {
    setMenuEdits(changedHelp());
    const text = workspaceText()!;
    expect(JSON.parse(text).menus.lists.Help.items).toEqual(helpItems.slice(1));
    resetMenuEdits();
    const r = importWorkspace(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    applyWorkspace(r.workspace.id);
    expect(getMenuEdits().lists?.Help.items).toEqual(helpItems.slice(1));
  });
  it('a workspace you changed the menus of since saving shares the changes in force', () => {
    setMenuEdits(titled('Files'));
    const ws = saveWorkspace('Mine')!;
    setMenuEdits(titled('Papers'));
    expect(JSON.parse(workspaceText(ws.id)!).menus.titles).toEqual({ File: 'Papers' });
    setMenuEdits({ v: 1 });
    expect(JSON.parse(workspaceText(ws.id)!).menus).toBeUndefined();
  });
  it('a workspace with no menu changes writes no menus field', () => {
    expect(JSON.parse(workspaceText('draw')!).menus).toBeUndefined();
  });
  it('a file from before menus were in it still opens, and brings none', () => {
    const old = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Old one', layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2 } } });
    const r = parseWorkspaceText(old);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workspace.menus).toBeUndefined();
    const i = importWorkspace(old);
    expect(i.ok).toBe(true);
  });
  it('rubbish in the menus field is dropped, and the rest of the file still opens', () => {
    const file = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Odd', menus: { v: 1, lists: { File: { items: 'x' } }, bar: 7 }, layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2 } } });
    const r = parseWorkspaceText(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workspace.menus).toBeUndefined();
  });
  it('an imported file cannot smuggle in a menu of your own that points nowhere', () => {
    const file = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Odd', menus: { v: 1, lists: { Help: { items: ['help.contents', 'sub:my-gone'], seen: [] } } }, layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2 } } });
    const r = parseWorkspaceText(file);
    expect(r.ok && r.workspace.menus?.lists?.Help.items).toEqual(['help.contents']);
  });
});

describe('use these menus in every workspace', () => {
  it('copies this workspace\'s menus to all the others, and can be undone', () => {
    setMenuEdits(titled('Files'));
    const before = menuMapOf(dock.get());
    shareMenusWithAll();
    for (const id of ['animate', 'pixel']) {
      applyWorkspace(id);
      expect(getMenuEdits().titles).toEqual({ File: 'Files' });
    }
    restoreMenuMap(before);
    applyWorkspace('pixel');
    expect(isUnchanged(menuEditsOf(dock.get()))).toBe(true);
  });
  it('a workspace of your own that already brings other menus gets these as its own change', () => {
    setMenuEdits(titled('Papers'));
    const ws = saveWorkspace('Mine')!;
    applyWorkspace('draw');
    setMenuEdits(titled('Files'));
    shareMenusWithAll();
    applyWorkspace(ws.id);
    expect(getMenuEdits().titles).toEqual({ File: 'Files' });
  });
});

describe('menu changes from before workspaces had their own', () => {
  const dockWith = (extra: object) => localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2 } }, workspaceId: 'animate', user: [], ...extra }));
  const load = async () => {
    vi.resetModules();
    return import('../../src/ui/dock');
  };
  it('go to the workspace the person was on, and the others start as the menus came', async () => {
    dockWith({});
    localStorage.setItem(MENUS_KEY, JSON.stringify(titled('Files')));
    const m = await load();
    expect(m.dock.get().menus).toEqual({ animate: titled('Files') });
    expect(m.menuEditsOf(m.dock.get()).titles).toEqual({ File: 'Files' });
    m.applyWorkspace('pixel');
    expect(m.menuEditsOf(m.dock.get())).toEqual({ v: 1 });
  });
  it('the old key stays until the dock is saved with them, then goes, and nothing is lost on a second start', async () => {
    dockWith({});
    localStorage.setItem(MENUS_KEY, JSON.stringify(titled('Files')));
    let m = await load();
    expect(localStorage.getItem(MENUS_KEY)).not.toBeNull();
    // A restart before anything was saved moves them again, to the same place.
    m = await load();
    expect(m.dock.get().menus).toEqual({ animate: titled('Files') });
    m.applyWorkspace('animate');
    m.flushDock();
    expect(localStorage.getItem(MENUS_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(DOCK_KEY)!).menus).toEqual({ animate: titled('Files') });
    m = await load();
    expect(m.dock.get().menus).toEqual({ animate: titled('Files') });
  });
  it('a first run with old menu changes and no saved layout still keeps them', async () => {
    localStorage.setItem(MENUS_KEY, JSON.stringify(titled('Files')));
    const m = await load();
    expect(m.dock.get().menus).toEqual({ draw: titled('Files') });
  });
  it('nothing happens when there was nothing, or only rubbish, to move', async () => {
    dockWith({});
    expect((await load()).dock.get().menus).toBeUndefined();
    localStorage.setItem(MENUS_KEY, '{"v":1,"lists":{"File":{"items":5}},"bar":"x"}');
    expect((await load()).dock.get().menus).toBeUndefined();
    localStorage.setItem(MENUS_KEY, 'not json at all');
    expect((await load()).dock.get().menus).toBeUndefined();
  });
  it('a dock that already holds menu changes is not overwritten by a leftover old key', async () => {
    dockWith({ menus: { draw: titled('Mine') } });
    localStorage.setItem(MENUS_KEY, JSON.stringify(titled('Files')));
    const m = await load();
    expect(m.dock.get().menus).toEqual({ draw: titled('Mine') });
    m.flushDock();
    expect(localStorage.getItem(MENUS_KEY)).toBeNull();
  });
  it('an old dock with no menus field at all still loads as before', async () => {
    dockWith({ rails: { animate: [{ id: 'g1', tools: ['hand'] }] } });
    const m = await load();
    expect(m.dock.get().workspaceId).toBe('animate');
    expect(m.dock.get().menus).toBeUndefined();
  });
  it('the person is told once, by workspace name', async () => {
    dockWith({});
    localStorage.setItem(MENUS_KEY, JSON.stringify(titled('Files')));
    const m = await load();
    expect(m.takeMenusMigrationNote()).toBe('Animate');
    expect(m.takeMenusMigrationNote()).toBeNull();
    expect((await load()).takeMenusMigrationNote()).toBeNull();
  });
  it('says nothing when there was nothing to move', async () => {
    dockWith({});
    expect((await load()).takeMenusMigrationNote()).toBeNull();
  });
  it('the note is a Quill line with the workspace filled in', () => {
    expect(line('workspaces.menusKept', { workspace: 'Animate' })).toBe('Your menu changes stay in Animate. Other workspaces now keep their own.');
  });
});
