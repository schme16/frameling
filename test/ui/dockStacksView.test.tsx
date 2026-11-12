// @vitest-environment jsdom
// Stacked groups in the page: the groups draw with their own tabs, the splitter between them works from the keyboard,
// a drop on a group's edge splits it, and a floating window resizes with Alt and the arrow keys.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { dock, floatPanel, placePanel, resetDock, setActive, togglePanel, reconcile } from '../../src/ui/dock';
import { DockOverlays } from '../../src/ui/DockOverlays';
import { dragState, targetAt } from '../../src/ui/dockDrag';
import { dockMenu, panelMenu } from '../../src/ui/dockMenus';
import { activeOfGroup, groupsOf, sharesOf } from '../../src/ui/dockModel';
import { FloatLayer, setFloatChrome } from '../../src/ui/DockFloats';
import { DockZoneView } from '../../src/ui/DockView';
import { rightStyle } from '../../src/ui/rightStyle';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const r = realRect.call(this);
  return r.width ? r : ({ left: 0, right: 60, top: 0, bottom: 30, width: 60, height: 30, x: 0, y: 0, toJSON() {} } as DOMRect);
};

const body = (text: string) => () => <p>{text}</p>;
beforeAll(() => {
  registerPanel({ id: 'layers', title: 'Layers', icon: 'layers', component: body('layers body'), zone: 'right', order: 10 });
  registerPanel({ id: 'colours', title: 'Colours', icon: 'palette', component: body('colours body'), zone: 'right', order: 20 });
  registerPanel({ id: 'preview', title: 'Preview', icon: 'play', component: body('preview body'), zone: 'right', order: 30 });
  registerPanel({ id: 'timeline', title: 'Timeline', icon: 'timeline', component: body('timeline body'), zone: 'bottom', order: 40 });
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mount = (style: 'tabs' | 'inspector') => {
  rightStyle.set(style);
  act(() =>
    root.render(
      <>
        <DockZoneView zone="right" />
        <FloatLayer />
        <DockOverlays />
      </>,
    ),
  );
};
beforeEach(() => {
  resetDock();
  setFloatChrome('titled');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // Layers and Preview on the right, Colours stacked under them.
  act(() => {
    dock.set((s) => ({ ...s, layout: { ...s.layout, zones: { ...s.layout.zones, right: { tabs: ['layers', 'preview'], active: 'layers', size: 316, collapsed: false }, bottom: { ...s.layout.zones.bottom, tabs: ['timeline'], active: 'timeline' } }, known: [...s.layout.known, 'layers', 'colours', 'preview', 'timeline'], hidden: [] } }));
    placePanel('colours', { zone: 'right', group: 0, split: 'after' });
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  dockMenu.set(null);
  dragState.set(null);
  document.elementsFromPoint = undefined as never;
});

const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));
const split = () => host.querySelector<HTMLElement>('[role="separator"].ui-group-split')!;
const shares = () => sharesOf(dock.get().layout.zones.right);

describe('stacked groups on the tab style', () => {
  beforeEach(() => mount('tabs'));

  it('draw as two groups, each with its own tabs and front panel', () => {
    const groups = host.querySelectorAll('.ui-group');
    expect(groups).toHaveLength(2);
    expect([...groups[0].querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-label'))).toEqual(['Layers', 'Preview']);
    expect([...groups[1].querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-label'))).toEqual(['Colours']);
    expect(host.textContent).toContain('layers body');
    expect(host.textContent).toContain('colours body');
    expect(groups[1].getAttribute('data-dock-group')).toBe('1');
    expect(groups[0].querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('right panels, group 1');
    // Only the first group holds the fold button.
    expect(host.querySelectorAll('.ui-zone-fold')).toHaveLength(1);
  });

  it('clicking a tab in the lower group fronts it there only', () => {
    act(() => placePanel('preview', { zone: 'right', group: 1 }));
    act(() => setActive('right', 'preview'));
    expect(activeOfGroup(dock.get().layout, 'right', 1)).toBe('preview');
    expect(activeOfGroup(dock.get().layout, 'right', 0)).toBe('layers');
  });

  it('arrow keys on a tab stay inside its group', () => {
    act(() => placePanel('preview', { zone: 'right', group: 1 }));
    const tab = host.querySelector<HTMLElement>('#ui-tab-colours')!;
    key(tab, 'ArrowRight');
    expect(activeOfGroup(dock.get().layout, 'right', 1)).toBe('preview');
    expect(activeOfGroup(dock.get().layout, 'right', 0)).toBe('layers');
  });

  it('togglePanel closes a front tab in a lower group and brings a hidden one forward', () => {
    act(() => placePanel('preview', { zone: 'right', group: 1 }));
    act(() => togglePanel('colours'));
    expect(activeOfGroup(dock.get().layout, 'right', 1)).toBe('colours');
    act(() => togglePanel('colours'));
    expect(dock.get().layout.hidden).toContain('colours');
  });

  it('reconcile drops gone panels from every group and any group left empty', () => {
    const l = reconcile(dock.get().layout, [
      { id: 'layers', title: 'L', icon: 'x', component: body(''), zone: 'right', order: 1 },
      { id: 'preview', title: 'P', icon: 'x', component: body(''), zone: 'right', order: 2 },
    ]);
    expect(groupsOf(l.zones.right).map((g) => g.tabs)).toEqual([['layers', 'preview']]);
  });

  describe('the splitter between them', () => {
    it('is a focusable separator with a value, a range and a name', () => {
      const s = split();
      expect(s.tabIndex).toBe(0);
      expect(s.getAttribute('aria-orientation')).toBe('horizontal');
      expect(s.getAttribute('aria-valuenow')).toBe('50');
      expect(s.getAttribute('aria-valuemin')).toBe('12');
      expect(s.getAttribute('aria-valuemax')).toBe('88');
      expect(s.getAttribute('aria-label')).toBe('Resize Layers and Colours');
      expect(s.getAttribute('aria-valuetext')).toContain('50 percent');
    });
    it('arrows move it a little, Shift a lot', () => {
      key(split(), 'ArrowDown');
      expect(shares()[0]).toBeCloseTo(0.52);
      key(split(), 'ArrowUp', { shiftKey: true });
      expect(shares()[0]).toBeCloseTo(0.42);
      expect(split().getAttribute('aria-valuenow')).toBe('42');
    });
    it('Home and End go to the least and most, Enter evens them out', () => {
      key(split(), 'Home');
      expect(shares()[0]).toBeCloseTo(0.12);
      key(split(), 'End');
      expect(shares()[0]).toBeCloseTo(0.88);
      key(split(), 'Enter');
      expect(shares()).toEqual([0.5, 0.5]);
    });
    it('never goes past the limits', () => {
      for (let i = 0; i < 60; i++) key(split(), 'ArrowDown', { shiftKey: true });
      expect(shares()[1]).toBeCloseTo(0.12);
    });
    it('leaves other keys alone', () => {
      const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      act(() => void split().dispatchEvent(e));
      expect(e.defaultPrevented).toBe(false);
    });
    it('goes when the groups join', () => {
      act(() => placePanel('colours', { zone: 'right', group: 0 }));
      expect(host.querySelector('.ui-group-split')).toBeNull();
      expect(host.querySelectorAll('.ui-group')).toHaveLength(1);
    });
  });

  describe('dropping on an edge', () => {
    const layout = (group: HTMLElement, r: { top: number; bottom: number; left?: number; right?: number }) => {
      group.getBoundingClientRect = () => ({ left: r.left ?? 0, right: r.right ?? 300, top: r.top, bottom: r.bottom, width: (r.right ?? 300) - (r.left ?? 0), height: r.bottom - r.top, x: 0, y: r.top, toJSON() {} }) as DOMRect;
      const bar = group.querySelector<HTMLElement>('[data-dock-strip]');
      if (bar) bar.getBoundingClientRect = () => ({ left: 0, right: 300, top: r.top, bottom: r.top + 30, width: 300, height: 30, x: 0, y: r.top, toJSON() {} }) as DOMRect;
    };
    it('the middle joins the group, the bottom edge splits after it, the top edge before it', () => {
      const g = host.querySelectorAll<HTMLElement>('.ui-group')[0];
      layout(g, { top: 0, bottom: 400 });
      const body = g.querySelector<HTMLElement>('.ui-panel')!;
      document.elementsFromPoint = () => [body, g];
      expect(targetAt(100, 200)).toEqual({ zone: 'right' });
      expect(targetAt(100, 390)).toEqual({ zone: 'right', split: 'after' });
      expect(targetAt(100, 45)).toEqual({ zone: 'right', split: 'before' });
      // The tab bar itself still drops between tabs.
      document.elementsFromPoint = () => [g.querySelector('[data-dock-strip]')!, g];
      expect(targetAt(100, 10)).toMatchObject({ zone: 'right', index: expect.any(Number) });
      expect(targetAt(100, 10)).not.toHaveProperty('split');
    });
    it('names the group it is over, and the chip says what would happen', () => {
      const g = host.querySelectorAll<HTMLElement>('.ui-group')[1];
      layout(g, { top: 400, bottom: 800 });
      document.elementsFromPoint = () => [g.querySelector('.ui-panel')!, g];
      expect(targetAt(100, 790)).toEqual({ zone: 'right', group: 1, split: 'after' });
      expect(targetAt(100, 600)).toEqual({ zone: 'right', group: 1 });
    });
    it('lights the half it would take while a tab is carried', () => {
      const g = host.querySelectorAll<HTMLElement>('.ui-group')[0];
      layout(g, { top: 0, bottom: 400 });
      document.elementsFromPoint = () => [g.querySelector('.ui-panel')!, g];
      const tab = host.querySelector<HTMLElement>('#ui-tab-colours')!.parentElement!;
      act(() => void tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 500, button: 0 })));
      act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 392 })));
      expect(host.querySelector('.ui-group.is-split-after')).not.toBeNull();
      expect(document.querySelector('.dock-chip')!.textContent).toContain('new group below');
      act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(host.querySelector('.is-split-after')).toBeNull();
    });
  });

  describe('the panel menu (the keyboard way to stack)', () => {
    const labels = (id: string) => panelMenu(id, { x: 0, y: 0 }).flatMap((i) => ('label' in i ? [i.label] : []));
    it('offers new groups and moving between them', () => {
      const l = labels('preview');
      expect(l).toContain('Move to a new group above');
      expect(l).toContain('Move to a new group below');
      expect(l).toContain('Move into the group below');
      expect(l).not.toContain('Move into the group above');
      expect(labels('colours')).toContain('Move into the group above');
      expect(labels('colours')).toContain('Join this side into one group');
    });
    it('a lone tab cannot be split further', () => {
      const m = panelMenu('colours', { x: 0, y: 0 }).filter((i) => 'label' in i && i.label.startsWith('Move to a new group'));
      expect(m.every((i) => 'disabled' in i && i.disabled)).toBe(true);
    });
    it('moving into the group below works', () => {
      const item = panelMenu('preview', { x: 0, y: 0 }).find((i) => 'label' in i && i.label === 'Move into the group below')!;
      act(() => 'onClick' in item && item.onClick());
      expect(groupsOf(dock.get().layout.zones.right).map((g) => g.tabs)).toEqual([['layers'], ['colours', 'preview']]);
    });
  });
});

describe('stacked groups under the Properties rail', () => {
  it('the first group keeps the rail and the groups under it are ordinary tabbed groups', () => {
    mount('inspector');
    expect(host.querySelector('.rd-top .rd-rail')).not.toBeNull();
    const groups = host.querySelectorAll('.ui-group');
    expect(groups).toHaveLength(2);
    expect(groups[1].querySelector('[role="tab"]')!.getAttribute('aria-label')).toBe('Colours');
    expect(groups[1].querySelector('.rd-rail')).toBeNull();
    expect(split()).not.toBeNull();
  });
});

describe('resizing a window from the keyboard', () => {
  const win = () => dock.get().layout.floats[0];
  const grip = () => host.querySelector<HTMLElement>('.ui-float-grip')!;
  beforeEach(() => {
    mount('tabs');
    act(() => floatPanel('preview', { x: 100, y: 100 }));
  });

  it('Alt and the arrows resize, Shift for bigger steps, and the plain arrows still move', () => {
    const { w, h, x } = win();
    key(grip(), 'ArrowRight', { altKey: true });
    expect(win().w).toBe(w + 16);
    key(grip(), 'ArrowDown', { altKey: true, shiftKey: true });
    expect(win().h).toBe(h + 64);
    key(grip(), 'ArrowLeft', { altKey: true });
    expect(win().w).toBe(w);
    expect(win().x).toBe(x);
    key(grip(), 'ArrowRight');
    expect(win().x).toBe(x + 16);
    expect(win().w).toBe(w);
  });

  it('stops at the least size, and Alt+Enter goes back to the usual one', () => {
    for (let i = 0; i < 20; i++) key(grip(), 'ArrowLeft', { altKey: true, shiftKey: true });
    expect(win().w).toBe(220);
    key(grip(), 'ArrowUp', { altKey: true, shiftKey: true });
    key(grip(), 'Enter', { altKey: true });
    expect(win()).toMatchObject({ w: 380, h: 320 });
  });

  it('says the new size to a screen reader, and the grip says how', () => {
    key(grip(), 'ArrowRight', { altKey: true, shiftKey: true });
    expect(host.querySelector('.ui-float [role="status"]')!.textContent).toBe('444 wide, 320 tall');
    expect(grip().getAttribute('aria-label')).toContain('Alt');
    expect(grip().getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowRight');
  });

  it('is in the window menu too', () => {
    const win0 = win();
    act(() => void grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })));
    const items = dockMenu.get()!.items;
    const bigger = items.find((i) => 'label' in i && i.label === 'Make it bigger')!;
    act(() => 'onClick' in bigger && bigger.onClick());
    expect(win().w).toBe(win0.w + 64);
  });
});
