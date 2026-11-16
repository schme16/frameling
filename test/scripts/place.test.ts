// @vitest-environment jsdom
// Where Scripts lives: the bottom drawer, closed until asked for, with a window of its own one press away.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { getPanel } from '../../src/core/registry';
import { builtinWorkspaces, dock, placedIds, resetDock, showPanel } from '../../src/ui/dock';
import { leftOutForStill } from '../../src/ui/stillZone';
import { DRAWER_LEAST, drawerHeightToOpen, scriptsPlace, windowBox, WINDOW_SIZE } from '../../src/scripts/place';
import { openScriptsPanel, scriptsToDrawer, scriptsToWindow, toggleScriptsWindow } from '../../src/scripts/placeRun';

beforeEach(() => resetDock());

describe('Scripts in the bottom drawer', () => {
  it('is registered for the bottom, and starts closed in every built-in workspace', () => {
    expect(getPanel('scripts')?.zone).toBe('bottom');
    expect(getPanel('scripts')?.startsAway).toBe(true);
    for (const w of builtinWorkspaces()) {
      expect(w.layout.hidden, w.name).toContain('scripts');
      expect(placedIds(w.layout), w.name).not.toContain('scripts');
    }
  });

  it('opens into the bottom zone, beside the timeline, and the drawer then exists even for a still', () => {
    expect(scriptsPlace(dock.get().layout)).toBe('closed');
    openScriptsPanel();
    const l = dock.get().layout;
    expect(scriptsPlace(l)).toBe('drawer');
    expect(l.zones.bottom.tabs).toContain('scripts');
    expect(l.zones.bottom.active).toBe('scripts');
    expect(leftOutForStill('bottom', l.zones.bottom.tabs, false, 'draw')).toBe(false);
    expect(l.zones.bottom.tabs).toContain('timeline');
  });

  it('a drawer too short to write in grows when it opens, and a tall one is left alone', () => {
    const l = dock.get().layout;
    expect(drawerHeightToOpen({ ...l, zones: { ...l.zones, bottom: { ...l.zones.bottom, size: 200 } } }, 'closed')).toBe(DRAWER_LEAST);
    expect(drawerHeightToOpen({ ...l, zones: { ...l.zones, bottom: { ...l.zones.bottom, size: 400 } } }, 'closed')).toBeNull();
    expect(drawerHeightToOpen({ ...l, zones: { ...l.zones, bottom: { ...l.zones.bottom, size: 200 } } }, 'drawer')).toBeNull();
    openScriptsPanel();
    expect(dock.get().layout.zones.bottom.size).toBeGreaterThanOrEqual(DRAWER_LEAST);
  });

  it('the timeline can come to the front over Scripts, and Scripts stays a tab beside it', () => {
    openScriptsPanel();
    showPanel('timeline');
    const l = dock.get().layout;
    expect(l.zones.bottom.active).toBe('timeline');
    expect(scriptsPlace(l)).toBe('drawer');
  });
});

describe('Scripts in a window of its own', () => {
  it('goes to a wide window, and back to the drawer in one press', () => {
    openScriptsPanel();
    scriptsToWindow();
    const l = dock.get().layout;
    expect(scriptsPlace(l)).toBe('window');
    const f = l.floats.find((x) => x.tabs.includes('scripts'))!;
    expect(f.w).toBeGreaterThanOrEqual(600);
    expect(l.zones.bottom.tabs).not.toContain('scripts');
    scriptsToDrawer();
    expect(scriptsPlace(dock.get().layout)).toBe('drawer');
    expect(dock.get().layout.floats.length).toBe(0);
  });

  it('the toggle works from closed too, and is its own undo', () => {
    toggleScriptsWindow();
    expect(scriptsPlace(dock.get().layout)).toBe('window');
    toggleScriptsWindow();
    expect(scriptsPlace(dock.get().layout)).toBe('drawer');
  });

  it('the window fits the screen it is on', () => {
    expect(windowBox({ w: 1920, h: 1080 })).toMatchObject({ w: WINDOW_SIZE.w, h: WINDOW_SIZE.h });
    const small = windowBox({ w: 700, h: 500 });
    expect(small.x + small.w).toBeLessThanOrEqual(700);
    expect(small.y + small.h).toBeLessThanOrEqual(500);
  });
});
