// @vitest-environment jsdom
// The rail on the page while it is built: names over groups, put-away tools and their chip, groups folded one by one,
// a press that opens a menu while the tools are being changed, and Put the tools back with its Undo.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { clearToasts, toasts } from '../../src/ui/toast';
import { resetDock, dock } from '../../src/ui/dock';
import { dockMenu, closeDockMenu } from '../../src/ui/dockMenus';
import { resetPrefs, getPrefs, setPrefs } from '../../src/ui/prefs';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { bringToolBack, currentGroups, foldToolGroup, putToolAway, putToolsBack, setToolbarEditing, startToolGroupHere, joinToolGroupAbove, toolbarIsChanged } from '../../src/ui/toolRail';
import { resolveTarget } from '../../src/quests/target';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

describe('the rail while it is built', () => {
  let host: HTMLDivElement;
  let root: Root;
  const mount = () => act(() => root.render(<ToolStrip />));
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const ids = () => [...host.querySelectorAll('button.ui-tool[data-tool-id]')].map((b) => (b as HTMLElement).dataset.toolId!);

  beforeEach(() => {
    resetDock();
    resetPrefs();
    clearToasts();
    closeDockMenu();
    setToolbarEditing(false);
    resetStore(newDoc({ width: 100, height: 100 }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('shows the group names out of the box, and a plain divider for a group nobody named', () => {
    mount();
    const heads = [...host.querySelectorAll('.ui-tool-head')].map((h) => h.textContent);
    expect(heads.slice(0, 3)).toEqual(['Draw', 'Colour', 'Shapes']);
    act(() => startToolGroupHere('ellipse'));
    expect([...host.querySelectorAll('.ui-tool-head')].length).toBe(heads.length);
    expect(host.querySelectorAll('.ui-tool-gap').length).toBeGreaterThan(heads.length - 1);
  });

  it('the names go with the preference', () => {
    setPrefs({ toolNames: false });
    mount();
    expect(host.querySelector('.ui-tool-head')).toBeNull();
    expect(q('nav')!.className).not.toContain('has-names');
  });

  it('a tool put away leaves the rail, a chip counts it, and bringing it back puts it where it was', () => {
    mount();
    const before = ids();
    act(() => putToolAway('eraser'));
    expect(ids()).not.toContain('eraser');
    expect(ids().length).toBe(before.length - 1);
    expect(q('.ui-tools-away')?.textContent).toBe('1');
    expect(host.querySelectorAll('[data-tool-id="eraser"]').length).toBe(0);
    act(() => bringToolBack('eraser'));
    expect(ids()).toEqual(before);
    expect(q('.ui-tools-away')).toBeNull();
  });

  it('a put-away tool is still on the command and in the arrangement once', () => {
    act(() => putToolAway('eraser'));
    const all = currentGroups().flatMap((g) => g.tools);
    expect(all.filter((t) => t === 'eraser')).toHaveLength(1);
  });

  it('a quest pointing at a tool that is put away finds the chip', () => {
    mount();
    act(() => putToolAway('eraser'));
    expect(resolveTarget("[data-command=\"tools.eraser\"]", () => true)?.className).toContain('ui-tools-away');
  });

  it('a folded group is one button, the others stay as they are, and it opens out again', () => {
    mount();
    const n = ids().length;
    const g = currentGroups().find((x) => x.tools.includes('rect'))!;
    const inIt = host.querySelectorAll(`[data-tool-group="${g.id}"] button`).length;
    act(() => foldToolGroup(g.id, true));
    expect(host.querySelectorAll('.ui-tool.is-stack')).toHaveLength(1);
    expect(ids().length).toBe(n - inIt);
    expect(q('.ui-tool.is-stack')!.className).toContain('has-more');
    act(() => foldToolGroup(g.id, false));
    expect(host.querySelectorAll('.ui-tool.is-stack')).toHaveLength(0);
    expect(ids().length).toBe(n);
  });

  it('the one-per-group style does not overwrite the folds you chose', () => {
    const g = currentGroups().find((x) => x.tools.includes('rect'))!;
    act(() => foldToolGroup(g.id, true));
    setPrefs({ toolRail: 'stacked' });
    expect(currentGroups().find((x) => x.id === g.id)!.fold).toBe(true);
    setPrefs({ toolRail: 'two' });
    expect(currentGroups().find((x) => x.id === g.id)!.fold).toBe(true);
  });

  it('a hidden tool in a folded group is not the front of it', () => {
    const g = currentGroups().find((x) => x.tools.includes('rect'))!;
    act(() => {
      foldToolGroup(g.id, true);
      putToolAway(g.tools[0]);
    });
    mount();
    expect(q('.ui-tool.is-stack')!.getAttribute('data-command')).not.toBe(`tools.${g.tools[0]}`);
  });

  it('while the tools are being changed, a press on a tool opens its menu instead of picking it', () => {
    act(() => setToolbarEditing(true));
    mount();
    const before = store().get().ui.tool;
    act(() => q('[data-tool-id="rect"]')!.click());
    expect(store().get().ui.tool).toBe(before);
    const labels = dockMenu.get()!.items.flatMap((i) => ('label' in i ? [i.label] : []));
    expect(labels).toContain('Hide this tool');
    expect(labels).toContain('Start a new group here');
    expect(q('nav')!.className).toContain('is-editing');
    expect(document.querySelector('[role="dialog"][aria-label="Change the tools"]')).toBeTruthy();
  });

  it('the panel has a shelf with the tools put away, and Done closes it', () => {
    act(() => putToolAway('eraser'));
    act(() => setToolbarEditing(true));
    mount();
    expect(document.querySelector('[data-tool-shelf] button')?.getAttribute('aria-label')).toContain('Eraser');
    act(() => document.querySelector<HTMLElement>('.ui-tb-done')!.click());
    expect(document.querySelector('.ui-tb-panel')).toBeNull();
  });

  it('button size sets the class the rail is sized by', () => {
    setPrefs({ toolSize: 'large' });
    mount();
    expect(q('nav')!.className).toContain('is-size-large');
  });

  it('join the group above takes a divider away', () => {
    mount();
    const groups = currentGroups().length;
    const g = currentGroups()[1];
    act(() => joinToolGroupAbove(g.id));
    expect(currentGroups().length).toBe(groups - 1);
  });
});

describe('Put the tools back', () => {
  beforeEach(() => {
    resetDock();
    resetPrefs();
    clearToasts();
  });

  it('puts arrangement, size, names, style and layer handling back, and Undo brings them all again', () => {
    expect(toolbarIsChanged()).toBe(false);
    foldToolGroup(currentGroups()[2].id, true);
    putToolAway('eraser');
    setPrefs({ toolSize: 'small', toolNames: false, toolRail: 'stacked', toolsOffLayer: 'grey' });
    const mine = dock.get().rails!.draw;
    expect(toolbarIsChanged()).toBe(true);
    putToolsBack();
    expect(dock.get().rails).toBeUndefined();
    expect(getPrefs()).toMatchObject({ toolSize: 'medium', toolNames: true, toolRail: 'two', toolsOffLayer: 'hide' });
    expect(toolbarIsChanged()).toBe(false);
    const undo = toasts.get().find((t) => t.action?.label === 'Undo');
    expect(undo).toBeTruthy();
    undo!.action!.run();
    expect(dock.get().rails!.draw).toEqual(mine);
    expect(getPrefs()).toMatchObject({ toolSize: 'small', toolNames: false, toolRail: 'stacked', toolsOffLayer: 'grey' });
  });

  it('only says so when there is nothing to put back', () => {
    putToolsBack();
    expect(toasts.get().map((t) => t.message)).toEqual(['The tools are already the way they come.']);
  });
});
