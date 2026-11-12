// @vitest-environment jsdom
// Floating windows and dragging, in the page: a window shows its panels as tabs, docks back, closes, takes a tab
// dragged onto it, and a tab dragged out over the canvas becomes a window.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { dock, floatPanel, placePanel, renamePanel, resetDock, zoneOf } from '../../src/ui/dock';
import { DockOverlays } from '../../src/ui/DockOverlays';
import { dragState } from '../../src/ui/dockDrag';
import { dockMenu } from '../../src/ui/dockMenus';
import { FloatLayer, floatChrome, setFloatChrome } from '../../src/ui/DockFloats';
import { DockZoneView } from '../../src/ui/DockView';
import { rightStyle } from '../../src/ui/rightStyle';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

// jsdom has no layout: give every box a size so the tab bar thinks there is room for all its tabs.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const r = realRect.call(this);
  return r.width ? r : ({ left: 0, right: 60, top: 0, bottom: 30, width: 60, height: 30, x: 0, y: 0, toJSON() {} } as DOMRect);
};

const body = (text: string) => () => <p>{text}</p>;
beforeAll(() => {
  registerPanel({ id: 'timeline', title: 'Timeline', icon: 'timeline', component: body('timeline body'), zone: 'bottom', order: 10 });
  registerPanel({ id: 'layers', title: 'Layers', icon: 'layers', component: body('layers body'), zone: 'bottom', order: 20 });
  registerPanel({ id: 'preview', title: 'Preview', icon: 'play', component: body('preview body'), zone: 'right', order: 30 });
  registerPanel({ id: 'help', title: 'Help', icon: 'help', component: body('help body'), zone: 'right', order: 90 });
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  resetDock();
  rightStyle.set('tabs');
  setFloatChrome('titled');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <>
        <DockZoneView zone="bottom" />
        <FloatLayer />
        <DockOverlays />
      </>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  dockMenu.set(null);
  document.elementsFromPoint = undefined as never;
});

const win = () => host.querySelector<HTMLElement>('.ui-float');
const fire = (target: Element | Window, type: string, x: number, y: number, init: MouseEventInit = {}) =>
  act(() => void target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init })));
const press = (el: Element, x = 10, y = 10) => fire(el, 'pointerdown', x, y);
const move = (x: number, y: number) => fire(window, 'pointermove', x, y);
const release = (x: number, y: number) => fire(window, 'pointerup', x, y);
const tabEl = (id: string) => host.querySelector<HTMLElement>(`[data-dock-tab="${id}"]`)!;

describe('a floating window', () => {
  it('shows the panel with a title bar, and is named after it', () => {
    act(() => floatPanel('preview'));
    expect(win()).not.toBeNull();
    expect(win()!.textContent).toContain('preview body');
    expect(win()!.querySelector('.ui-float-name')!.textContent).toBe('Preview');
    expect(win()!.getAttribute('aria-label')).toBe('Preview (floating window)');
  });
  it('holds several panels as tabs, and shows the first one asked for', () => {
    act(() => floatPanel('preview'));
    act(() => placePanel('help', { float: dock.get().layout.floats[0].id }));
    expect(win()!.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(win()!.querySelector('.ui-float-name')!.textContent).toBe('Help and 1 more');
    expect(win()!.textContent).toContain('help body');
    expect(win()!.textContent).not.toContain('preview body');
    act(() => (win()!.querySelector('[aria-label="Preview"]') as HTMLElement).click());
    expect(win()!.textContent).toContain('preview body');
  });
  it('a window name and a panel name show', () => {
    act(() => floatPanel('preview'));
    act(() => renamePanel('preview', 'Watch'));
    expect(win()!.querySelector('.ui-float-name')!.textContent).toBe('Watch');
  });
  it('Dock back sends it home; Close shuts the window and its panels', () => {
    act(() => floatPanel('preview'));
    act(() => (win()!.querySelector('[aria-label="Dock Preview back"]') as HTMLElement).click());
    expect(win()).toBeNull();
    expect(zoneOf('preview')).toBe('right');
    act(() => floatPanel('preview'));
    act(() => (win()!.querySelector('[aria-label="Close Preview"]') as HTMLElement).click());
    expect(win()).toBeNull();
    expect(dock.get().layout.hidden).toContain('preview');
  });
  it('the compact style puts the tabs in the bar', () => {
    act(() => floatPanel('preview'));
    expect(win()!.querySelectorAll('[role="tab"]')).toHaveLength(0);
    act(() => setFloatChrome('compact'));
    expect(floatChrome.get()).toBe('compact');
    expect(win()!.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(win()!.className).toContain('ui-float-compact');
  });
  it('is drawn on screen even when it was saved off to the side', () => {
    act(() => floatPanel('preview', { x: 9000, y: 9000 }));
    const left = parseInt(win()!.style.left, 10);
    expect(left).toBeLessThan(window.innerWidth);
  });
});

describe('dragging a tab', () => {
  it('out over the canvas makes a window where it lets go', () => {
    press(tabEl('layers').querySelector('button')!, 100, 100);
    move(102, 100);
    expect(dragState.get()).toBeNull();
    move(300, 250);
    expect(dragState.get()).toMatchObject({ kind: 'panel', panels: ['layers'], target: { newFloat: { x: 240, y: 236 } } });
    expect(host.querySelector('.dock-chip')!.textContent).toContain('new window');
    release(300, 250);
    expect(dragState.get()).toBeNull();
    const f = dock.get().layout.floats;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ tabs: ['layers'], x: 240, y: 236 });
    expect(zoneOf('layers')).toBeNull();
  });
  it('a small wobble is a click, not a drag', () => {
    press(tabEl('layers').querySelector('button')!, 100, 100);
    move(102, 101);
    release(102, 101);
    expect(dock.get().layout.floats).toEqual([]);
  });
  it('onto a tab bar drops between its tabs', () => {
    act(() => floatPanel('preview'));
    const strip = host.querySelector<HTMLElement>('[data-dock-strip][data-dock-zone="bottom"]')!;
    const tabs = [...strip.querySelectorAll<HTMLElement>('[data-dock-tab]')];
    // jsdom has no layout: say where each tab is.
    tabs.forEach((t, i) => (t.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 30, width: 100, height: 30, x: i * 100, y: 0, toJSON() {} })));
    document.elementsFromPoint = () => [strip];
    const bar = win()!.querySelector('.ui-float-bar')!;
    press(bar, 400, 200);
    // The title bar moves the window; docking the whole group needs the pointer over a tab bar.
    move(420, 210);
    move(30, 10);
    expect(dragState.get()!.target).toEqual({ zone: 'bottom', index: 0 });
    release(30, 10);
    expect(win()).toBeNull();
    expect(dock.get().layout.zones.bottom.tabs[0]).toBe('preview');
  });
  it('Escape puts it back', () => {
    press(tabEl('layers').querySelector('button')!, 100, 100);
    move(300, 250);
    expect(dragState.get()).not.toBeNull();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(dragState.get()).toBeNull();
    expect(dock.get().layout.floats).toEqual([]);
    expect(zoneOf('layers')).toBe('bottom');
  });
  it('shows a band to dock on along each edge while it goes', () => {
    const canvas = document.createElement('main');
    canvas.className = 'ui-canvas';
    canvas.getBoundingClientRect = () => ({ left: 50, right: 850, top: 50, bottom: 450, width: 800, height: 400, x: 50, y: 50, toJSON() {} });
    document.body.appendChild(canvas);
    press(tabEl('layers').querySelector('button')!, 100, 100);
    move(300, 250);
    expect([...document.querySelectorAll('[data-dock-edge]')].map((e) => (e as HTMLElement).dataset.dockEdge).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    release(300, 250);
    expect(document.querySelectorAll('[data-dock-edge]')).toHaveLength(0);
    canvas.remove();
  });
  it('onto an edge band docks on that side', () => {
    const band = document.createElement('div');
    band.dataset.dockEdge = 'top';
    document.elementsFromPoint = () => [band];
    press(tabEl('layers').querySelector('button')!, 100, 100);
    move(300, 60);
    expect(dragState.get()!.target).toEqual({ zone: 'top' });
    release(300, 60);
    expect(zoneOf('layers')).toBe('top');
  });
});

describe('the tab menu', () => {
  it('opens on right-click with the moves, naming and closing', () => {
    fire(tabEl('layers'), 'contextmenu', 50, 50);
    const items = dockMenu.get()!.items;
    const labels = items.flatMap((i) => ('label' in i ? [i.label] : []));
    expect(labels).toEqual(expect.arrayContaining(['Move to the left side', 'Move to the top', 'Move to its own window', 'Rename...', 'Close Layers']));
    const own = items.find((i) => 'label' in i && i.label === 'Move to its own window') as { onClick: () => void };
    act(() => own.onClick());
    expect(dock.get().layout.floats[0].tabs).toEqual(['layers']);
  });
  it('offers the windows there are to group with', () => {
    act(() => floatPanel('preview'));
    fire(tabEl('layers'), 'contextmenu', 50, 50);
    const group = dockMenu.get()!.items.find((i) => 'label' in i && i.label === 'Preview') as { onClick: () => void };
    expect(group).toBeTruthy();
    act(() => group.onClick());
    expect(dock.get().layout.floats[0].tabs).toEqual(['preview', 'layers']);
  });
});
