// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { applyWorkspace, builtinWorkspaces, clampSize, deleteWorkspace, dock, hidePanel, isVisible, listWorkspaces, movePanel, reconcile, resetDock, resetLayout, resizeZone, saveWorkspace, setActive, showPanel, syncPanels, toggleCollapsed, togglePanel, zoneOf } from '../../src/ui/dock';

const Nothing = () => null;
beforeAll(() => {
  registerPanel({ id: 'timeline', title: 'Timeline', icon: 'timeline', component: Nothing, zone: 'bottom', order: 10 });
  registerPanel({ id: 'layers', title: 'Layers', icon: 'layers', component: Nothing, zone: 'right', order: 20 });
  registerPanel({ id: 'colours', title: 'Colours', icon: 'palette', component: Nothing, zone: 'right', order: 10 });
  registerPanel({ id: 'help', title: 'Help', icon: 'help', component: Nothing, zone: 'right', order: 90 });
});
beforeEach(() => resetDock());
const zones = () => {
  const l = dock.get().layout;
  const f = (a: string[]) => a.filter((x) => x !== 'late');
  return { left: f(l.zones.left.tabs), right: f(l.zones.right.tabs), bottom: f(l.zones.bottom.tabs) };
};

describe('built-in workspaces', () => {
  it('Draw, Animate and Pixel, each placing every registered panel exactly once', () => {
    const ws = builtinWorkspaces();
    expect(ws.map((w) => w.name)).toEqual(['Draw', 'Animate', 'Pixel']);
    for (const w of ws) {
      const all = [...w.layout.zones.left.tabs, ...w.layout.zones.right.tabs, ...w.layout.zones.bottom.tabs];
      expect(all.sort()).toEqual(['colours', 'help', 'layers', 'timeline']);
    }
  });
  it('differ the way they promise', () => {
    const [draw, animate, pixel] = builtinWorkspaces();
    expect(draw.layout.zones.right.tabs).toEqual(['colours', 'layers', 'help']);
    expect(animate.layout.zones.right.tabs[0]).toBe('layers');
    expect(animate.layout.zones.bottom.size).toBeGreaterThan(draw.layout.zones.bottom.size);
    expect(pixel.layout.zones.left.tabs).toEqual(['colours']);
  });
  it('applying one changes the layout and remembers which', () => {
    applyWorkspace('pixel');
    expect(zones().left).toEqual(['colours']);
    expect(dock.get().workspaceId).toBe('pixel');
  });
});

describe('moving panels', () => {
  it('reorders within a zone', () => {
    movePanel('help', 'right', 0);
    expect(zones().right).toEqual(['help', 'colours', 'layers']);
    movePanel('help', 'right', 3);
    expect(zones().right).toEqual(['colours', 'layers', 'help']);
  });
  it('moves to another zone and makes it the front tab', () => {
    movePanel('layers', 'left');
    expect(zones().left).toEqual(['layers']);
    expect(zones().right).not.toContain('layers');
    expect(dock.get().layout.zones.left.active).toBe('layers');
  });
  it('picks a new front tab when the front one leaves', () => {
    expect(dock.get().layout.zones.right.active).toBe('colours');
    movePanel('colours', 'left');
    expect(dock.get().layout.zones.right.active).toBe('layers');
  });
  it('ignores panels that do not exist', () => {
    movePanel('nope', 'left');
    expect(zones().left).toEqual([]);
  });
});

describe('showing, hiding, collapsing, resizing', () => {
  it('hides and shows', () => {
    hidePanel('layers');
    expect(isVisible('layers')).toBe(false);
    expect(dock.get().layout.hidden).toContain('layers');
    showPanel('layers');
    expect(zoneOf('layers')).toBe('right');
    expect(dock.get().layout.hidden).not.toContain('layers');
  });
  it('toggle: hidden opens, behind comes forward, in front closes', () => {
    togglePanel('layers');
    expect(dock.get().layout.zones.right.active).toBe('layers');
    togglePanel('layers');
    expect(isVisible('layers')).toBe(false);
    togglePanel('layers');
    expect(isVisible('layers')).toBe(true);
  });
  it('a hidden panel stays hidden when panels are synced', () => {
    hidePanel('help');
    syncPanels();
    expect(isVisible('help')).toBe(false);
  });
  it('collapse and open again by choosing a tab', () => {
    toggleCollapsed('right');
    expect(dock.get().layout.zones.right.collapsed).toBe(true);
    setActive('right', 'layers');
    expect(dock.get().layout.zones.right.collapsed).toBe(false);
  });
  it('keeps sizes in range', () => {
    resizeZone('right', 5);
    expect(dock.get().layout.zones.right.size).toBe(clampSize('right', 5));
    resizeZone('right', 99999);
    expect(dock.get().layout.zones.right.size).toBeLessThan(1000);
  });
  it('picks up a panel that registers later, and forgets ones that are gone', () => {
    registerPanel({ id: 'late', title: 'Late', icon: 'plus', component: Nothing, zone: 'left', order: 5 });
    syncPanels();
    expect(dock.get().layout.zones.left.tabs).toContain('late');
    const l = reconcile({ ...dock.get().layout, zones: { ...dock.get().layout.zones, right: { ...dock.get().layout.zones.right, tabs: ['gone', 'layers'] } } });
    expect(l.zones.right.tabs).not.toContain('gone');
  });
});

describe('saved workspaces', () => {
  it('saves the current layout under a name and brings it back', () => {
    movePanel('layers', 'left');
    const ws = saveWorkspace('  My corner ')!;
    expect(ws.name).toBe('My corner');
    expect(listWorkspaces().map((w) => w.name)).toContain('My corner');
    applyWorkspace('draw');
    expect(zones().left).toEqual([]);
    applyWorkspace(ws.id);
    expect(zones().left).toEqual(['layers']);
  });
  it('saving the same name again replaces it', () => {
    saveWorkspace('Mine');
    movePanel('layers', 'left');
    saveWorkspace('mine');
    expect(dock.get().user).toHaveLength(1);
  });
  it('refuses an empty name and deletes by id', () => {
    expect(saveWorkspace('   ')).toBeNull();
    const ws = saveWorkspace('Temp')!;
    deleteWorkspace(ws.id);
    expect(dock.get().user).toHaveLength(0);
    expect(dock.get().workspaceId).toBe('draw');
  });
  it('reset layout goes back to where the workspace started', () => {
    movePanel('layers', 'left');
    resetLayout();
    expect(zones().left).toEqual([]);
  });
});
