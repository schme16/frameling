// @vitest-environment jsdom
// The rail on the page with a width: the edge you pull (keys, double-click), the buttons across following the width,
// the width left alone on a rail that floats or lies along the top, and the commands.
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';
import { clearToasts } from '../../src/ui/toast';
import { dock, placeTools, railWidthOf, resetDock, setRailWidth } from '../../src/ui/dock';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { ToolSlot, ToolStrip } from '../../src/ui/ToolStrip';
import { putToolsBack, setToolbarEditing, toolbarIsChanged } from '../../src/ui/toolRail';
import { RAIL_MAX } from '../../src/ui/toolRailWidth';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

describe('the rail with a width', () => {
  let host: HTMLDivElement;
  let root: Root;
  const mount = (el: React.ReactElement) => act(() => root.render(el));
  const nav = () => host.querySelector<HTMLElement>('nav.ui-tools')!;
  const edge = () => host.querySelector<HTMLElement>('.ui-rail-splitter')!;
  const key = (k: string, shiftKey = false) => act(() => void edge().dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })));

  beforeEach(() => {
    localStorage.clear();
    resetDock();
    resetPrefs();
    clearToasts();
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

  it('has no width of its own to begin with, so it is two across as it always was', () => {
    mount(<ToolSlot at="left" />);
    expect(nav().style.width).toBe('');
    expect(nav().style.getPropertyValue('--tool-cols')).toBe('');
    expect(edge().getAttribute('aria-valuenow')).toBe('94');
  });

  it('takes the saved width, and the buttons across follow it', () => {
    setRailWidth(178);
    mount(<ToolSlot at="left" />);
    expect(nav().style.width).toBe('178px');
    expect(nav().style.getPropertyValue('--tool-cols')).toBe('4');
    act(() => setRailWidth(262));
    expect(nav().style.getPropertyValue('--tool-cols')).toBe('6');
    act(() => setRailWidth(60));
    expect(nav().style.getPropertyValue('--tool-cols')).toBe('1');
  });

  it('in the one-per-group style the width is for the names and a group stays one button', () => {
    setRailWidth(200);
    setPrefs({ toolRail: 'stacked' });
    mount(<ToolSlot at="left" />);
    expect(nav().style.width).toBe('200px');
    expect(nav().style.getPropertyValue('--tool-cols')).toBe('1');
  });

  it('the edge is a separator with its limits, and the arrow keys move it', () => {
    mount(<ToolSlot at="left" />);
    expect(edge().getAttribute('role')).toBe('separator');
    expect(edge().getAttribute('aria-valuemin')).toBe('50');
    expect(edge().getAttribute('aria-valuemax')).toBe(String(RAIL_MAX));
    key('ArrowRight');
    expect(railWidthOf(dock.get())).toBe(110);
    key('ArrowRight', true);
    expect(railWidthOf(dock.get())).toBe(174);
    key('ArrowLeft');
    expect(railWidthOf(dock.get())).toBe(158);
    key('End');
    expect(railWidthOf(dock.get())).toBe(RAIL_MAX);
    key('Home');
    expect(railWidthOf(dock.get())).toBe(50);
    key('ArrowLeft');
    expect(railWidthOf(dock.get())).toBe(50);
  });

  it('on the right the edge is on the other side and the arrows go the other way', () => {
    placeTools('right');
    mount(<ToolSlot at="right" />);
    const kids = [...host.children];
    expect(kids[0]).toBe(edge());
    key('ArrowLeft');
    expect(railWidthOf(dock.get())).toBe(110);
  });

  it('on the left the edge comes after the rail', () => {
    mount(<ToolSlot at="left" />);
    expect([...host.children].map((c) => c.tagName)).toEqual(['NAV', 'DIV']);
    expect(host.children[1]).toBe(edge());
  });

  it('a floating rail and one along the top have no edge to pull, and keep their natural size', () => {
    setRailWidth(200);
    placeTools('top');
    mount(<ToolSlot at="top" />);
    expect(edge()).toBeNull();
    expect(nav().style.width).toBe('');
    mount(<ToolStrip place="float" />);
    expect(nav().style.width).toBe('');
  });

  it('names never wrap: the stylesheet keeps them on one line and ends them in dots', () => {
    const css = readFileSync('src/ui/ui.css', 'utf8');
    for (const sel of ['.ui-tool-head', '.ui-tool-head-name']) {
      const body = css.match(new RegExp(`\\n${sel.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(body, sel).toMatch(/white-space: nowrap/);
      expect(body, sel).toMatch(/text-overflow: ellipsis/);
      expect(body, sel).toMatch(/overflow: hidden/);
    }
  });

  it('Put the tools back puts the width back', () => {
    setRailWidth(220);
    mount(<ToolSlot at="left" />);
    expect(toolbarIsChanged()).toBe(true);
    act(() => putToolsBack());
    expect(railWidthOf(dock.get())).toBeUndefined();
    expect(nav().style.width).toBe('');
    expect(toolbarIsChanged()).toBe(false);
  });

  it('Undo on its message brings the width back', async () => {
    const { toasts } = await import('../../src/ui/toast');
    setRailWidth(220);
    mount(<ToolSlot at="left" />);
    act(() => putToolsBack());
    const undo = toasts.get().find((t) => t.action?.label === 'Undo');
    expect(undo).toBeTruthy();
    act(() => undo!.action!.run());
    expect(railWidthOf(dock.get())).toBe(220);
  });
});

describe('the commands', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDock();
    resetPrefs();
  });

  it('are in the command search, with help', () => {
    for (const id of ['view.toolRailWider', 'view.toolRailNarrower', 'view.toolRailFit', 'view.toolRailWidthReset']) {
      const c = getCommand(id);
      expect(c, id).toBeTruthy();
      expect(c!.help).toBe('tool-builder');
      expect(c!.label.startsWith('Tool rail')).toBe(true);
      expect(c!.label + (c!.description ?? '')).not.toMatch(/—/);
    }
  });

  it('wider and narrower move a button column at a time, and stop at the limits', () => {
    const wider = getCommand('view.toolRailWider')!;
    const narrower = getCommand('view.toolRailNarrower')!;
    wider.run();
    expect(railWidthOf(dock.get())).toBe(136);
    wider.run();
    expect(railWidthOf(dock.get())).toBe(178);
    narrower.run();
    narrower.run();
    // Back at the natural width it is kept as no width.
    expect(railWidthOf(dock.get())).toBeUndefined();
    narrower.run();
    expect(railWidthOf(dock.get())).toBe(52);
    for (let i = 0; i < 10; i++) narrower.run();
    expect(railWidthOf(dock.get())).toBe(50);
    for (let i = 0; i < 12; i++) wider.run();
    expect(railWidthOf(dock.get())).toBe(RAIL_MAX);
  });

  it('are off for a rail that is not at a side, and the reset only when there is a width to reset', () => {
    const reset = getCommand('view.toolRailWidthReset')!;
    expect(reset.enabled?.(store().get())).toBe(false);
    setRailWidth(200);
    expect(reset.enabled?.(store().get())).toBe(true);
    reset.run();
    expect(railWidthOf(dock.get())).toBeUndefined();
    placeTools('float', { x: 10, y: 10 });
    expect(getCommand('view.toolRailWider')!.enabled?.(store().get())).toBe(false);
  });
});
