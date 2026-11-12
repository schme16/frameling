// @vitest-environment jsdom
// Naming the tool rail's groups: the pure rename, where the names are kept (per workspace, in saved and shared
// workspaces), and the ways to rename one in the page (a tool's menu, the divider, the Stacked flyout).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { applyWorkspace, dock, importWorkspace, railOf, resetDock, saveWorkspace, setToolGroups, workspaceText } from '../../src/ui/dock';
import { DockOverlays } from '../../src/ui/DockOverlays';
import { dockMenu, renaming } from '../../src/ui/dockMenus';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { cleanGroupName, groupName, hasOwnName, moveTool, renameGroup, sanitizeGroups, type ToolGroup } from '../../src/ui/toolArrange';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { currentGroups, flyRequest, frontTools, groupMenu, railNote, renameToolGroup, toolMenu } from '../../src/ui/toolRail';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

const G = (id: string, tools: string[], name?: string): ToolGroup => ({ id, tools, ...(name ? { name } : {}) });

describe('renameGroup', () => {
  const groups = [G('draw', ['pencil', 'brush']), G('g3', ['pen']), G('view', ['hand'])];

  it('names a group, and the name shows', () => {
    const next = renameGroup(groups, 'g3', '  Pen   tools ');
    expect(next[1].name).toBe('Pen tools');
    expect(groupName(next[1], next)).toBe('Pen tools');
    expect(next[0]).toBe(groups[0]);
  });

  it('a group of your own is called Group N until it has a name', () => {
    expect(groupName(groups[1], groups)).toBe('Group 2');
    const named = renameGroup(groups, 'g3', 'Pens');
    expect(groupName(named[1], named)).toBe('Pens');
  });

  it('an empty name takes it away again', () => {
    const named = renameGroup(groups, 'g3', 'Pens');
    const back = renameGroup(named, 'g3', '   ');
    expect(back[1].name).toBeUndefined();
    expect(groupName(back[1], back)).toBe('Group 2');
  });

  it('the usual groups keep their usual name when cleared', () => {
    const named = renameGroup(groups, 'draw', 'Sketching');
    expect(groupName(named[0], named)).toBe('Sketching');
    const back = renameGroup(named, 'draw', '');
    expect(groupName(back[0], back)).toBe('Draw');
  });

  it('gives the same arrangement back when nothing changes or the group is gone', () => {
    expect(renameGroup(groups, 'nope', 'X')).toBe(groups);
    expect(renameGroup(groups, 'g3', '')).toBe(groups);
    const named = renameGroup(groups, 'g3', 'Pens');
    expect(renameGroup(named, 'g3', 'Pens')).toBe(named);
  });

  it('cuts long names and strips control characters', () => {
    expect(cleanGroupName('a\u0000b\nc')).toBe('a b c');
    expect(cleanGroupName('x'.repeat(100))).toHaveLength(40);
    expect(cleanGroupName(7)).toBe('');
  });

  it('knows a name of your own from the usual one', () => {
    expect(hasOwnName(groups[0], groups)).toBe(false);
    expect(hasOwnName(G('draw', [], 'Draw'), groups)).toBe(false);
    expect(hasOwnName(G('draw', [], 'Sketching'), groups)).toBe(true);
    expect(hasOwnName(G('g3', [], 'Group 2'), groups)).toBe(false);
  });

  it('names survive moving tools around', () => {
    const named = renameGroup(groups, 'g3', 'Pens');
    const moved = moveTool(named, 'hand', { group: 'g3' });
    expect(moved.find((g) => g.id === 'g3')!.name).toBe('Pens');
    expect(sanitizeGroups(JSON.parse(JSON.stringify(moved)))!.find((g) => g.id === 'g3')!.name).toBe('Pens');
  });
});

describe('names are kept per workspace', () => {
  beforeEach(() => resetDock());

  it('a name goes with this workspace alone', () => {
    applyWorkspace('draw');
    renameToolGroup('shapes', 'Boxes');
    expect(groupName(currentGroups().find((g) => g.id === 'shapes')!, currentGroups())).toBe('Boxes');
    expect(dock.get().rails?.draw).toBeDefined();
    applyWorkspace('animate');
    expect(groupName(currentGroups().find((g) => g.id === 'shapes')!, currentGroups())).toBe('Shapes');
    applyWorkspace('draw');
    expect(groupName(currentGroups().find((g) => g.id === 'shapes')!, currentGroups())).toBe('Boxes');
  });

  it('clearing the only change puts the workspace back to its own default', () => {
    renameToolGroup('shapes', 'Boxes');
    renameToolGroup('shapes', '');
    expect(dock.get().rails).toBeUndefined();
  });

  it('a name tells a screen reader', () => {
    renameToolGroup('shapes', 'Boxes');
    expect(railNote.get()).toBe('Group named Boxes.');
  });

  it('a group of your own, made by moving a tool, can be named', () => {
    const before = currentGroups();
    setToolGroups(moveTool(before, 'hand', { newGroupAt: 0 }));
    const g = currentGroups()[0];
    expect(groupName(g, currentGroups())).toBe('Group 1');
    renameToolGroup(g.id, 'Navigation');
    expect(groupName(currentGroups()[0], currentGroups())).toBe('Navigation');
  });

  it('saved workspaces and shared files carry the names', () => {
    renameToolGroup('shapes', 'Boxes');
    const ws = saveWorkspace('Named')!;
    expect(ws.rail!.find((g) => g.id === 'shapes')!.name).toBe('Boxes');
    applyWorkspace('animate');
    applyWorkspace(ws.id);
    expect(currentGroups().find((g) => g.id === 'shapes')!.name).toBe('Boxes');
    const text = workspaceText(ws.id)!;
    expect(text).toContain('Boxes');
    const r = importWorkspace(text);
    expect(r.ok && r.workspace.rail!.find((g) => g.id === 'shapes')!.name).toBe('Boxes');
    expect(railOf(dock.get())).toBeDefined();
  });

  it('the menus offer it', () => {
    const labels = (items: ReturnType<typeof groupMenu>) => items.flatMap((i) => ('label' in i ? [i.label] : []));
    expect(labels(toolMenu('pencil', () => true))).toContain('Rename Draw...');
    expect(labels(groupMenu('shapes'))).toEqual(['Rename group...']);
    renameToolGroup('shapes', 'Boxes');
    expect(labels(groupMenu('shapes'))).toEqual(['Rename group...', 'Use the usual name again']);
    expect(labels(toolMenu('rect', () => true))).toContain('Rename Boxes...');
  });
});

describe('renaming in the page', () => {
  let host: HTMLDivElement;
  let root: Root;
  const mount = (rail: 'two' | 'stacked') => {
    setPrefs({ toolRail: rail });
    act(() =>
      root.render(
        <>
          <ToolStrip />
          <DockOverlays />
        </>,
      ),
    );
  };
  beforeEach(() => {
    resetDock();
    resetPrefs();
    resetStore(newDoc({ width: 100, height: 100 }));
    frontTools.set({});
    flyRequest.set(null);
    renaming.set(null);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    dockMenu.set(null);
    renaming.set(null);
    document.body.querySelectorAll('.ui-tool-fly').forEach((e) => e.remove());
  });
  const fire = (el: Element, type: string, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })));
  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const box = () => document.querySelector<HTMLFormElement>('.ui-dock-rename');
  const submit = () => act(() => void box()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const names = () => [...host.querySelectorAll('.ui-tool-group')].map((g) => g.getAttribute('aria-label'));

  it('double-clicking the divider above a group opens the name box for that group, filled with its name', () => {
    mount('two');
    const gap = host.querySelector<HTMLElement>('[data-tool-gap="2"]')!;
    expect(gap.getAttribute('data-tip')).toBe('Shapes');
    fire(gap, 'dblclick');
    expect(renaming.get()).toMatchObject({ kind: 'group', id: 'shapes' });
    expect(box()!.textContent).toContain('Name this group of tools');
    expect(box()!.querySelector('input')!.value).toBe('Shapes');
  });

  it('saving a name shows it on the group and in its tooltip', () => {
    mount('two');
    fire(host.querySelector('[data-tool-gap="2"]')!, 'dblclick');
    type(box()!.querySelector('input')!, 'Boxes and rings');
    submit();
    expect(box()).toBeNull();
    expect(names()).toContain('Boxes and rings');
    expect(host.querySelector('[data-tool-gap="2"]')!.getAttribute('data-tip')).toBe('Boxes and rings');
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Group named Boxes and rings.');
  });

  it('typing the usual name back clears the custom one', () => {
    mount('two');
    renameToolGroup('shapes', 'Boxes');
    fire(host.querySelector('[data-tool-gap="2"]')!, 'dblclick');
    type(box()!.querySelector('input')!, 'Shapes');
    submit();
    expect(dock.get().rails).toBeUndefined();
  });

  it('right-clicking a divider opens a menu with Rename', () => {
    mount('two');
    fire(host.querySelector('[data-tool-gap="1"]')!, 'contextmenu');
    const items = dockMenu.get()!.items.flatMap((i) => ('label' in i ? [i.label] : []));
    expect(items[0]).toBe('Rename group...');
    expect(items).toContain('Reset tools to default');
  });

  it('right-clicking a tool offers renaming its group', () => {
    mount('two');
    fire(host.querySelector('[data-tool-id="rect"]')!, 'contextmenu');
    const items = dockMenu.get()!.items;
    const rename = items.find((i) => 'label' in i && i.label === 'Rename Shapes...')!;
    expect(rename).toBeDefined();
    act(() => 'onClick' in rename && rename.onClick());
    expect(renaming.get()).toMatchObject({ kind: 'group', id: 'shapes' });
  });

  it('Escape closes the box without changing the name', () => {
    mount('two');
    fire(host.querySelector('[data-tool-gap="2"]')!, 'dblclick');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(box()).toBeNull();
    expect(dock.get().rails).toBeUndefined();
  });

  it('the Stacked flyout shows the group name over its tools, and a button to rename it', () => {
    mount('stacked');
    const btn = host.querySelector<HTMLElement>('.ui-tool.is-stack[data-tool-group="shapes"]')!;
    expect(btn.getAttribute('data-tip')).toContain('in Shapes');
    fire(btn, 'contextmenu');
    const fly = document.querySelector('.ui-tool-fly')!;
    expect(fly.querySelector('.ui-tool-fly-name')!.textContent).toBe('Shapes');
    const rename = fly.querySelector<HTMLElement>('.ui-tool-fly-rename')!;
    expect(rename.getAttribute('aria-label')).toBe('Rename Shapes');
    fire(rename, 'click');
    expect(document.querySelector('.ui-tool-fly')).toBeNull();
    expect(renaming.get()).toMatchObject({ kind: 'group', id: 'shapes' });
  });

  it('a renamed group is named in the Stacked flyout and on its button for a screen reader', () => {
    renameToolGroup('shapes', 'Boxes');
    mount('stacked');
    const btn = host.querySelector<HTMLElement>('.ui-tool.is-stack[data-tool-group="shapes"]')!;
    expect(btn.getAttribute('aria-label')).toContain('Boxes group');
    fire(btn, 'contextmenu');
    expect(document.querySelector('.ui-tool-fly')!.getAttribute('aria-label')).toBe('Boxes tools');
  });

  it('a double-click on the flyout name opens the box too', () => {
    mount('stacked');
    fire(host.querySelector('.ui-tool.is-stack[data-tool-group="draw"]')!, 'contextmenu');
    fire(document.querySelector('.ui-tool-fly-name')!, 'dblclick');
    expect(renaming.get()).toMatchObject({ kind: 'group', id: 'draw' });
  });
});
