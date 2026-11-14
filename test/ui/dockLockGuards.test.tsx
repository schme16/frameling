// @vitest-environment jsdom
// What a lock refuses, in the page: the rail's grip, edge and tools, its menu and commands, Put the tools back, the
// Change the tools panel; the panels' tabs, windows, sizes and menus. Each says why, once. And what Quill teaches.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import { getCommand } from '../../src/core/registry';
import { clearToasts, toasts } from '../../src/ui/toast';
import { dock, floatPanel, hidePanel as rawHide, locksOf, placeTools, resetDock, setLock, setToolGroups } from '../../src/ui/dock';
import { dragState, nudgeTools, startFloatDrag, startFloatResize, startPanelDrag, startToolsDrag } from '../../src/ui/dockDrag';
import { floatMenu, panelMenu, renaming, askRename, toolsMenu, type DockMenuItem } from '../../src/ui/dockMenus';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { hidePanel, resizeZone } from '../../src/ui/lockedDock';
import { forgetRefusals, lastDrag, teachLock } from '../../src/ui/lockState';
import { LINES } from '../../src/ui/mascot/lines';
import { currentGroups, moveToolTo, putToolAway, putToolsBack, setRailLock, setToolbarEditing, setToolRailWidth, stepToolRail, toolbarEditing, toolbarIsChanged, toolMenu, groupMenu } from '../../src/ui/toolRail';
import { resetLayoutAndAsk } from '../../src/ui/workspaceActions';

vi.mock('../../src/ui/rightDock.css', () => ({}));

beforeAll(async () => {
  await import('../../src/renderer/features');
});

const labelled = (items: DockMenuItem[]) => items.filter((i): i is Extract<DockMenuItem, { label: string }> => 'label' in i);
const byLabel = (items: DockMenuItem[], re: RegExp) => labelled(items).find((i) => re.test(i.label))!;
const said = () => toasts.get().map((t) => t.message);
const fire = (type: string, x: number, y: number) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0 }));
const press = (x = 40, y = 50) => ({ button: 0, clientX: x, clientY: y, currentTarget: document.createElement('button') }) as never;

beforeEach(() => {
  localStorage.clear();
  resetDock();
  resetPrefs();
  clearToasts();
  forgetRefusals();
  setToolbarEditing(false);
  lastDrag.ms = 0;
  lastDrag.px = 0;
  vi.useRealTimers();
});

describe('a locked rail', () => {
  beforeEach(() => setLock('tools', true));

  it('is not carried by its grip, and says why once the pointer has really gone somewhere', () => {
    placeTools('left');
    startToolsDrag(press(), { x: 10, y: 6 });
    fire('pointermove', 42, 52);
    expect(said()).toEqual([]);
    fire('pointermove', 300, 300);
    fire('pointermove', 400, 300);
    fire('pointerup', 400, 300);
    expect(dock.get().layout.tools.place).toBe('left');
    expect(dragState.get()).toBeNull();
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatch(/locked/);
    expect(said()[0]).toMatch(/can't be moved/);
    expect(toasts.get()[0].action?.label).toBe('Unlock');
  });
  it('a plain press on the grip says nothing', () => {
    startToolsDrag(press(), { x: 10, y: 6 });
    fire('pointerup', 40, 50);
    expect(said()).toEqual([]);
  });
  it('is not nudged with the arrow keys', () => {
    placeTools('float', { x: 100, y: 100 });
    nudgeTools(16, 0);
    expect(dock.get().layout.tools.x).toBe(100);
    expect(said()[0]).toMatch(/locked/);
  });
  it('is not made wider, narrower or fitted', () => {
    setToolRailWidth(200);
    stepToolRail(1);
    expect(dock.get().railWidths).toBeUndefined();
    expect(said()[0]).toMatch(/wider or narrower/);
  });
  it('keeps its tools where they are: no move, no hiding, no naming', () => {
    const before = JSON.stringify(currentGroups());
    moveToolTo('eraser', { newGroupAt: 0 });
    putToolAway('eraser');
    expect(JSON.stringify(currentGroups())).toBe(before);
    expect(dock.get().rails).toBeUndefined();
    askRename('group', currentGroups()[0].id, 10, 10);
    expect(renaming.get()).toBeNull();
    expect(said().some((m) => /moved, put away, renamed or grouped/.test(m))).toBe(true);
  });
  it('will not open Change the tools, and closes it when locked while open', () => {
    setToolbarEditing(true);
    expect(toolbarEditing.get()).toBe(false);
    expect(said()[0]).toMatch(/can't be changed/);
    setLock('tools', false);
    setToolbarEditing(true);
    expect(toolbarEditing.get()).toBe(true);
    setRailLock(true);
    expect(toolbarEditing.get()).toBe(false);
  });
  it('will not put the tools back, and says so instead of quietly resetting', () => {
    setLock('tools', false);
    putToolAway('eraser');
    setRailLock(true);
    const mine = JSON.stringify(dock.get().rails);
    expect(toolbarIsChanged()).toBe(true);
    putToolsBack();
    expect(JSON.stringify(dock.get().rails)).toBe(mine);
    expect(said()[0]).toMatch(/can't be put back/);
  });
  it('Reset layout keeps the rail where it is and as it is', () => {
    setLock('tools', false);
    putToolAway('eraser');
    setToolRailWidth(180);
    placeTools('right');
    setRailLock(true);
    resetLayoutAndAsk();
    expect(dock.get().layout.tools.place).toBe('right');
    expect(dock.get().rails).toBeDefined();
    expect(dock.get().railWidths).toBeDefined();
  });
  it('its menu has Unlock, and greys what it stops, each with the reason', () => {
    const items = toolsMenu();
    expect(byLabel(items, /^Unlock the tools$/)).toBeTruthy();
    for (const re of [/^To move them/, /^Change the tools/, /^Put the tools back/]) {
      const it = byLabel(items, re);
      expect(it.disabled).toBe(true);
      expect(it.why).toMatch(/Unlock the tools/);
    }
    expect(byLabel(items, /one button per group|two wide/).disabled).toBeFalsy();
    expect(byLabel(items, /What is the tool strip/).disabled).toBeFalsy();
  });
  it("a group's and a tool's menus grey too, with the reason", () => {
    const g = labelled(groupMenu(currentGroups()[0].id));
    expect(g.length).toBeGreaterThan(2);
    for (const it of g) expect(it.disabled && it.why).toBeTruthy();
    for (const it of labelled(toolMenu('eraser', () => true))) expect(it.disabled && it.why).toBeTruthy();
  });
  it('Unlock puts it all back to working', () => {
    byLabel(toolsMenu(), /^Unlock the tools$/).onClick();
    expect(locksOf(dock.get())).toEqual({});
    moveToolTo('eraser', { newGroupAt: 0 });
    expect(dock.get().rails).toBeDefined();
    expect(byLabel(toolsMenu(), /^Lock the tools$/)).toBeTruthy();
  });
  it('the Unlock button on the message unlocks it', () => {
    nudgeTools(1, 1);
    placeTools('float');
    nudgeTools(1, 1);
    toasts.get()[0].action!.run();
    expect(locksOf(dock.get()).tools).toBeFalsy();
  });
});

describe('an unlocked rail', () => {
  it('has Lock the tools in its menu, with nothing greyed on account of it', () => {
    const items = toolsMenu();
    expect(byLabel(items, /^Lock the tools$/)).toBeTruthy();
    expect(labelled(items).some((i) => i.why)).toBe(false);
  });
});

describe('locked panels', () => {
  beforeEach(() => setLock('panels', true));

  it('a tab is not carried, and says why once it has really gone somewhere', () => {
    startPanelDrag(press(), 'layers');
    fire('pointermove', 41, 51);
    fire('pointermove', 400, 300);
    fire('pointerup', 400, 300);
    expect(dragState.get()).toBeNull();
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatch(/panels and windows can't be moved/);
  });
  it('a window is not moved or resized', () => {
    setLock('panels', false);
    floatPanel('layers');
    setLock('panels', true);
    const f = dock.get().layout.floats[0];
    startFloatDrag(press(f.x + 5, f.y + 5), f);
    fire('pointermove', 500, 400);
    fire('pointerup', 500, 400);
    expect(dock.get().layout.floats[0]).toMatchObject({ x: f.x, y: f.y });
    clearToasts();
    startFloatResize(press(f.x + f.w, f.y + f.h), f, 'se');
    fire('pointermove', f.x + f.w + 80, f.y + f.h + 80);
    fire('pointerup', f.x + f.w + 80, f.y + f.h + 80);
    expect(dock.get().layout.floats[0]).toMatchObject({ w: f.w, h: f.h });
    expect(said()[0]).toMatch(/resized/);
  });
  it('a panel is not closed, a side is not resized, nothing is renamed', () => {
    const size = dock.get().layout.zones.bottom.size;
    hidePanel('layers');
    resizeZone('bottom', size + 50);
    askRename('panel', 'layers', 1, 1);
    expect(dock.get().layout.hidden).not.toContain('layers');
    expect(dock.get().layout.zones.bottom.size).toBe(size);
    expect(renaming.get()).toBeNull();
    // The dock itself still does it for code that tidies by itself.
    rawHide('layers');
    expect(dock.get().layout.hidden).toContain('layers');
  });
  it('the commands that move panels say no, and the lock command toggles', () => {
    getCommand('view.movePanel.left')!.run();
    expect(said()[0]).toMatch(/locked/);
    clearToasts();
    getCommand('view.lockPanels')!.run();
    expect(locksOf(dock.get()).panels).toBeFalsy();
    expect(getCommand('view.lockPanels')!.checked?.({} as never)).toBeFalsy();
  });
  it("a panel's menu says Unlock, greys every move, close and rename with the reason, and keeps the help", () => {
    const items = panelMenu('layers', { x: 0, y: 0 });
    expect(byLabel(items, /^Unlock the panels$/)).toBeTruthy();
    for (const it of labelled(items)) {
      if (/^Unlock the panels$|^What is this panel/.test(it.label)) continue;
      expect(it.disabled, it.label).toBe(true);
      expect(it.why, it.label).toMatch(/Unlock the panels/);
    }
    expect(byLabel(items, /^What is this panel/).disabled).toBeFalsy();
  });
  it("a window's menu does the same", () => {
    setLock('panels', false);
    floatPanel('layers');
    setLock('panels', true);
    const items = floatMenu(dock.get().layout.floats[0].id, { x: 0, y: 0 });
    expect(byLabel(items, /^Close window/).disabled).toBe(true);
    expect(byLabel(items, /^Close window/).why).toMatch(/Unlock the panels/);
    expect(byLabel(items, /^What are windows/).disabled).toBeFalsy();
  });
  it('Reset layout refuses', () => {
    dock.set({ ...dock.get(), layout: { ...dock.get().layout, hidden: ['layers'] } });
    resetLayoutAndAsk();
    expect(said()[0]).toMatch(/layout can't be reset/);
    expect(dock.get().layout.hidden).toContain('layers');
  });
  it('and the rail is not locked by it', () => {
    moveToolTo('eraser', { newGroupAt: 0 });
    expect(dock.get().rails).toBeDefined();
  });
});

describe('Quill teaches it once, on a slip', () => {
  const slip = () => {
    lastDrag.ms = 120;
    lastDrag.px = 30;
  };
  it('says it with a Lock it button, which locks', () => {
    slip();
    expect(teachLock('tools', () => setRailLock(true))).toBe(true);
    const t = toasts.get()[0];
    expect(t.message).toMatch(/by accident/);
    expect(t.message).toMatch(/tools/);
    expect(t.action?.label).toBe('Lock it');
    t.action!.run();
    expect(locksOf(dock.get()).tools).toBe(true);
    expect(said().some((m) => /Unlock the tools any time/.test(m))).toBe(true);
  });
  it('only the first time, ever', () => {
    slip();
    expect(teachLock('panels', () => setLock('panels', true))).toBe(true);
    expect(teachLock('tools', () => setRailLock(true))).toBe(false);
    expect(teachLock('panels', () => setLock('panels', true))).toBe(false);
  });
  it('not for a move that was clearly meant', () => {
    lastDrag.ms = 2500;
    lastDrag.px = 500;
    expect(teachLock('tools', () => setRailLock(true))).toBe(false);
    expect(toasts.get()).toHaveLength(0);
    // and it has not used up its one go
    slip();
    expect(teachLock('tools', () => setRailLock(true))).toBe(true);
  });
  it('not when it is already locked, and not when Quill is off', () => {
    slip();
    setLock('tools', true);
    expect(teachLock('tools', () => {})).toBe(false);
    setLock('tools', false);
    setPrefs({ showQuill: false });
    expect(teachLock('tools', () => {})).toBe(false);
    setPrefs({ showQuill: true });
    expect(teachLock('tools', () => {})).toBe(true);
  });
  it('his line is in lines.json with its place, and no em dash', () => {
    const e = LINES['lock.teach'];
    expect(e.where.length).toBeGreaterThan(20);
    expect(JSON.stringify(e.text)).not.toMatch(/—/);
  });
});

describe('the commands', () => {
  it('Lock the tools toggles, and shows a tick while it is on', () => {
    const c = getCommand('view.lockTools')!;
    expect(c.checked?.({} as never)).toBeFalsy();
    c.run();
    expect(locksOf(dock.get()).tools).toBe(true);
    expect(c.checked?.({} as never)).toBe(true);
    c.run();
    expect(locksOf(dock.get()).tools).toBeFalsy();
  });
  it('the commands that move the rail say no while it is locked', () => {
    setLock('tools', true);
    placeTools('left');
    getCommand('view.toolsPlace.top')!.run();
    expect(dock.get().layout.tools.place).toBe('left');
    expect(said()[0]).toMatch(/tool rail can't be moved/);
  });
  it('Put the tools back refuses from the command search too', () => {
    setToolGroups([{ id: 'mine', tools: currentGroups().flatMap((g) => g.tools).reverse() }]);
    setLock('tools', true);
    getCommand('view.toolsReset')!.run();
    expect(said()[0]).toMatch(/can't be put back/);
    expect(dock.get().rails).toBeDefined();
  });
});
