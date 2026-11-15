// @vitest-environment jsdom
// Put the panels back: the pure part (what the panels go back to, whether there is anything to do, what Undo restores)
// and the real thing on the dock (the lock, "already", Undo in its own workspace only, the question about windows).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import { getCommand } from '../../src/core/registry';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { applyWorkspace, dock, saveWorkspace, floatPanel, hidePanel, isVisible, movePanel, placeOf, renamePanel, resetDock, resizeZone, setLock, setActive, toggleCollapsed, placeTools } from '../../src/ui/dock';
import { clone, emptyLayout, type Layout } from '../../src/ui/dockModel';
import { inWindows, panelsBackLayout, panelsDiffer, panelsRestored, panelsSignature } from '../../src/ui/dockBack';
import { floatMenu, panelMenu, panelsAreChanged, putBackItem, putPanelsBack, type DockMenuItem } from '../../src/ui/dockMenus';
import { clearToasts, toasts } from '../../src/ui/toast';
import { forgetRefusals } from '../../src/ui/lockState';
import { resetPrefs } from '../../src/ui/prefs';

vi.mock('../../src/ui/rightDock.css', () => ({}));

beforeAll(async () => {
  await import('../../src/renderer/features');
});

const said = () => toasts.get().map((t) => t.message);
const labelled = (items: DockMenuItem[]) => items.filter((i): i is Extract<DockMenuItem, { label: string }> => 'label' in i);

/** A small layout: Layers and Colours stacked on the right, Timeline at the bottom. */
function sample(): Layout {
  const l = emptyLayout();
  l.zones.right = { tabs: ['layers'], active: 'layers', size: 316, collapsed: false, more: [{ tabs: ['colors'], active: 'colors' }], shares: [0.5, 0.5] };
  l.zones.bottom = { tabs: ['timeline'], active: 'timeline', size: 230, collapsed: false };
  l.known = ['layers', 'colors', 'timeline', 'preview'];
  l.hidden = ['preview'];
  return l;
}

describe('the layout the panels go back to', () => {
  it('is the target, with the tool rail and the panels it has met kept as they are', () => {
    const target = sample();
    const now = clone(target);
    now.tools = { place: 'right', x: 1, y: 2, home: 'left' };
    now.known.push('later');
    const back = panelsBackLayout(now, target, 'dock');
    expect(back.tools).toEqual(now.tools);
    expect(back.known).toContain('later');
    expect(back.zones).toEqual(target.zones);
  });

  it('says nothing has changed when it is the target', () => {
    expect(panelsDiffer(sample(), sample(), 'dock')).toBe(false);
  });

  it('sees a panel opened or closed, a tab reordered, a panel moved to another group, a size, a share, a fold and a name', () => {
    const edits: ((l: Layout) => void)[] = [
      (l) => l.hidden.pop(),
      (l) => l.hidden.push('layers'),
      (l) => (l.zones.right.more![0].tabs = ['colors', 'preview']),
      (l) => (l.zones.right.tabs = ['colors', 'layers']),
      (l) => (l.zones.right.size = 400),
      (l) => (l.zones.right.shares = [0.7, 0.3]),
      (l) => (l.zones.bottom.collapsed = true),
      (l) => (l.names = { layers: 'My layers' }),
    ];
    for (const edit of edits) {
      const now = sample();
      edit(now);
      expect(panelsDiffer(now, sample(), 'dock'), edit.toString()).toBe(true);
    }
  });

  it('does not count the front tab, or where a window sits, as a mess', () => {
    const now = sample();
    now.zones.right.more![0].active = 'colors';
    now.zones.right.active = 'layers';
    expect(panelsDiffer(now, sample(), 'dock')).toBe(false);
    const target = sample();
    target.floats = [{ id: 'w', tabs: ['preview'], active: 'preview', x: 5, y: 5, w: 300, h: 300 }];
    target.hidden = [];
    const moved = clone(target);
    moved.floats[0].x = 400;
    expect(panelsDiffer(moved, target, 'dock')).toBe(false);
  });

  it('ignores the size of a side with nothing in it', () => {
    const now = sample();
    now.zones.top.size = 400;
    expect(panelsDiffer(now, sample(), 'dock')).toBe(false);
  });

  it('puts back a named window too, when windows are docked', () => {
    const now = sample();
    now.hidden = [];
    now.floats = [{ id: 'w', name: 'Mine', tabs: ['preview'], active: 'preview', x: 0, y: 0, w: 300, h: 300 }];
    const back = panelsBackLayout(now, sample(), 'dock');
    expect(back.floats).toEqual([]);
    expect(back.hidden).toEqual(['preview']);
  });

  describe('with the windows left alone', () => {
    const withWindow = (): Layout => {
      const now = sample();
      now.zones.right.tabs = ['layers', 'colors'];
      delete now.zones.right.more;
      delete now.zones.right.shares;
      now.hidden = [];
      now.zones.bottom.tabs = [];
      now.zones.bottom.active = null;
      now.floats = [{ id: 'w', name: 'Clock', tabs: ['timeline'], active: 'timeline', x: 10, y: 20, w: 300, h: 200 }];
      now.names = { timeline: 'Time', layers: 'Stuff' };
      return now;
    };

    it('keeps the window, its panel and its name, and puts the rest back', () => {
      const now = withWindow();
      const back = panelsBackLayout(now, sample(), 'leave');
      expect(back.floats).toEqual(now.floats);
      expect([...inWindows(back)]).toEqual(['timeline']);
      expect(back.zones.bottom.tabs).toEqual([]);
      expect(back.zones.right.tabs).toEqual(['layers']);
      expect(back.zones.right.more?.[0].tabs).toEqual(['colors']);
      expect(back.names).toEqual({ timeline: 'Time' });
    });

    it('is not a mess when only a window is out, and is one when docking would move it', () => {
      const now = panelsBackLayout(withWindow(), sample(), 'leave');
      expect(panelsDiffer(now, sample(), 'leave')).toBe(false);
      expect(panelsDiffer(now, sample(), 'dock')).toBe(true);
    });

    it('never holds a panel twice', () => {
      const back = panelsBackLayout(withWindow(), sample(), 'leave');
      const all = [...back.zones.right.tabs, ...(back.zones.right.more ?? []).flatMap((g) => g.tabs), ...back.zones.bottom.tabs, ...back.floats.flatMap((f) => f.tabs), ...back.hidden];
      expect(new Set(all).size).toBe(all.length);
    });
  });

  it('is the same however many times it is done', () => {
    const now = sample();
    now.zones.right.size = 500;
    now.names = { layers: 'x' };
    const once = panelsBackLayout(now, sample(), 'dock');
    expect(panelsSignature(panelsBackLayout(once, sample(), 'dock'))).toBe(panelsSignature(once));
  });

  it('Undo puts the panels back as they were and leaves a tool rail moved since', () => {
    const before = sample();
    before.zones.right.size = 500;
    before.names = { layers: 'x' };
    const now = panelsBackLayout(before, sample(), 'dock');
    now.tools = { place: 'top', x: 3, y: 4 };
    const undone = panelsRestored(now, before);
    expect(undone.zones).toEqual(before.zones);
    expect(undone.names).toEqual({ layers: 'x' });
    expect(undone.tools.place).toBe('top');
  });
});

describe('Put the panels back, on the dock', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetChoicesForTests();
    resetDock();
    resetPrefs();
    clearToasts();
    forgetRefusals();
  });

  const mess = () => {
    movePanel('layers', 'bottom');
    hidePanel('colors');
    renamePanel('timeline', 'Frames');
    resizeZone('right', 480);
  };

  it('says so, and changes nothing, when the panels are as they come', () => {
    expect(panelsAreChanged()).toBe(false);
    const before = dock.get().layout;
    putPanelsBack();
    expect(said()).toEqual(['The panels are already the way they come.']);
    expect(dock.get().layout).toBe(before);
  });

  it('puts back what is open, where it sits, its sizes and its names, and offers Undo', () => {
    const start = panelsSignature(dock.get().layout);
    mess();
    expect(panelsAreChanged()).toBe(true);
    const messy = clone(dock.get().layout);
    putPanelsBack();
    expect(panelsSignature(dock.get().layout)).toBe(start);
    expect(isVisible('colors')).toBe(true);
    expect(dock.get().layout.names?.timeline).toBeUndefined();
    expect(panelsAreChanged()).toBe(false);
    const t = toasts.get()[0];
    expect(t.message).toBe('The panels are back the way they come.');
    expect(t.action?.label).toBe('Undo');
    t.action!.run();
    expect(panelsSignature(dock.get().layout)).toBe(panelsSignature(messy));
    expect(dock.get().layout.names?.timeline).toBe('Frames');
  });

  it('leaves the tool rail where it is', () => {
    placeTools('right');
    mess();
    putPanelsBack();
    expect(dock.get().layout.tools.place).toBe('right');
  });

  it('refuses when the panels are locked, in the same words as the tools', () => {
    mess();
    setLock('panels', true);
    const before = panelsSignature(dock.get().layout);
    putPanelsBack();
    expect(said()[0]).toMatch(/locked, so they can't be put back/);
    expect(panelsSignature(dock.get().layout)).toBe(before);
  });

  it('Undo only applies in the workspace it was done in', () => {
    mess();
    const messy = panelsSignature(dock.get().layout);
    putPanelsBack();
    const undo = toasts.get()[0].action!.run;
    applyWorkspace('animate');
    const there = panelsSignature(dock.get().layout);
    undo();
    expect(panelsSignature(dock.get().layout)).toBe(there);
    applyWorkspace('draw');
    expect(panelsSignature(dock.get().layout)).not.toBe(messy);
  });

  it('goes back to the workspace you are in, not the one you started in', () => {
    applyWorkspace('pixel');
    const pixel = panelsSignature(dock.get().layout);
    mess();
    putPanelsBack();
    expect(panelsSignature(dock.get().layout)).toBe(pixel);
    applyWorkspace('draw');
    expect(panelsSignature(dock.get().layout)).not.toBe(pixel);
  });

  it('puts one of your own workspaces back the way you saved it', () => {
    movePanel('layers', 'bottom');
    const mine = saveWorkspace('Mine')!;
    applyWorkspace('draw');
    applyWorkspace(mine.id);
    expect(placeOf('layers')).toMatchObject({ zone: 'bottom' });
    movePanel('layers', 'left');
    renamePanel('layers', 'Stuff');
    putPanelsBack();
    expect(placeOf('layers')).toMatchObject({ zone: 'bottom' });
    expect(dock.get().layout.names?.layers).toBeUndefined();
  });

  describe('with a panel in a window of its own', () => {
    it('docks it too by default, with no question when asking is not possible', () => {
      floatPanel('layers');
      expect(dock.get().layout.floats).toHaveLength(1);
      putPanelsBack();
      expect(dock.get().layout.floats).toHaveLength(0);
      expect(isVisible('layers')).toBe(true);
    });

    it('leaves it when that is the answer', () => {
      setChoice('panels.putBackWindows', 'leave');
      floatPanel('layers');
      hidePanel('colors');
      putPanelsBack();
      expect(dock.get().layout.floats).toHaveLength(1);
      expect(isVisible('colors')).toBe(true);
      expect(placeOf('layers')).toHaveProperty('float');
    });

    it('says the windows were left when that is all there is', () => {
      setChoice('panels.putBackWindows', 'leave');
      floatPanel('layers');
      expect(panelsAreChanged()).toBe(false);
      putPanelsBack();
      expect(said()[0]).toBe('The panels are already the way they come. The windows are left alone.');
    });

    it('is greyed in the menu with its reason when nothing is left to do', () => {
      setChoice('panels.putBackWindows', 'leave');
      floatPanel('layers');
      const item = labelled(floatMenu(dock.get().layout.floats[0].id, { x: 0, y: 0 })).find((i) => i.label === 'Put the panels back')!;
      expect(item.disabled).toBe(true);
      expect(item.why).toBe('The panels are already the way they come.');
    });
  });

  it('is in a panel menu, a window menu and the command search, and greys with the lock', () => {
    mess();
    expect(labelled(panelMenu('layers', { x: 0, y: 0 })).find((i) => i.label === 'Put the panels back')?.disabled).toBeFalsy();
    expect(putBackItem().disabled).toBe(false);
    const cmd = getCommand('view.panelsReset')!;
    expect(cmd.label).toBe('Put the panels back');
    expect(cmd.enabled?.({} as never)).toBe(true);
    setLock('panels', true);
    const locked = labelled(panelMenu('layers', { x: 0, y: 0 })).find((i) => i.label === 'Put the panels back')!;
    expect(locked.disabled).toBe(true);
    expect(locked.why).toMatch(/Locked/);
    setLock('panels', false);
    cmd.run();
    expect(isVisible('colors')).toBe(true);
  });

  it('does not count choosing a tab or folding nothing as a mess', () => {
    setActive('right', 'layers');
    toggleCollapsed('top', false);
    expect(panelsAreChanged()).toBe(false);
  });
});
