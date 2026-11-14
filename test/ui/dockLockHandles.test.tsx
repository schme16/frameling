// @vitest-environment jsdom
// While locked, what invites a move is not on show: the rail's grip goes altogether with nothing in its place, the
// page says what is locked on its root (so the edges and cursors leave in CSS), and the window's bar can't be
// double-clicked back to a side. Unlocking brings the handles back.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { clearToasts, toasts } from '../../src/ui/toast';
import { dock, floatPanel, resetDock, setLock } from '../../src/ui/dock';
import { dockFloatBack } from '../../src/ui/lockedDock';
import { forgetRefusals } from '../../src/ui/lockState';
import { resetPrefs } from '../../src/ui/prefs';
import { ToolStrip } from '../../src/ui/ToolStrip';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

describe('the handles while locked', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    resetDock();
    resetPrefs();
    clearToasts();
    forgetRefusals();
    resetStore(newDoc({ width: 100, height: 100 }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<ToolStrip place="left" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lock-tools');
    document.documentElement.removeAttribute('data-lock-panels');
  });

  it('the rail has its grip until it is locked, then nothing at all in its place, and the grip is back when unlocked', () => {
    const grip = () => host.querySelector('.ui-tools-grip');
    expect(grip()!.tagName).toBe('BUTTON');
    act(() => setLock('tools', true));
    expect(grip()).toBeNull();
    expect(host.querySelector('.ui-tabbar-lock')).toBeNull();
    act(() => setLock('tools', false));
    expect(grip()!.tagName).toBe('BUTTON');
  });

  it('a group name stops saying it can be renamed with a double-click', () => {
    const tip = () => host.querySelector('.ui-tool-gap[data-tip-desc]')?.getAttribute('data-tip-desc') ?? '';
    expect(tip()).toMatch(/Double-click to rename/);
    act(() => setLock('tools', true));
    expect(tip()).toBe('Locked in place. Right-click for more.');
  });

  it('the page root says what is locked, for the CSS that hides the edges', () => {
    const root = document.documentElement;
    expect(root.hasAttribute('data-lock-tools')).toBe(false);
    setLock('tools', true);
    expect(root.hasAttribute('data-lock-tools')).toBe(true);
    expect(root.hasAttribute('data-lock-panels')).toBe(false);
    setLock('panels', true);
    expect(root.hasAttribute('data-lock-panels')).toBe(true);
    setLock('tools', false);
    setLock('panels', false);
    expect(root.hasAttribute('data-lock-tools')).toBe(false);
    expect(root.hasAttribute('data-lock-panels')).toBe(false);
  });

  it("a window's bar can't be double-clicked back to a side while the panels are locked", () => {
    floatPanel('library', { x: 100, y: 100 });
    const id = dock.get().layout.floats[0].id;
    setLock('panels', true);
    dockFloatBack(id);
    expect(dock.get().layout.floats).toHaveLength(1);
    expect(toasts.get()[0]?.message).toMatch(/can't be moved/);
    setLock('panels', false);
    dockFloatBack(id);
    expect(dock.get().layout.floats).toHaveLength(0);
  });
});
