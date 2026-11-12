// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { particlesFeature } from '../../src/particles';
import { registerPanelInfo } from '../../src/ui/panelInfo';
import { dock, resetDock, setActive } from '../../src/ui/dock';
import { DockZoneView } from '../../src/ui/DockView';
import { folded, panelPicker, rightStyle } from '../../src/ui/rightStyle';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has neither of these.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const body = (text: string) => () => <p>{text}</p>;
beforeAll(() => {
  for (const [id, info] of Object.entries(particlesFeature.sections ?? {})) registerPanelInfo(id, info);
  registerPanel({ id: 'tool-options', title: 'Tool options', icon: 'sliders', component: body('tool body'), zone: 'right', order: 10, help: 'tool-options' });
  registerPanel({ id: 'colors', title: 'Colours', icon: 'palette', component: body('colour body'), zone: 'right', order: 20 });
  registerPanel({ id: 'particles', title: 'Particles', icon: 'particles', component: body('particle body'), zone: 'right', order: 36 });
  registerPanel({ id: 'library', title: 'Library', icon: 'symbol', component: body('library body'), zone: 'right', order: 30 });
  registerPanel({ id: 'help', title: 'Help', icon: 'help', component: body('help body'), zone: 'right', order: 90 });
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  resetDock();
  folded.set([]);
  rightStyle.set('inspector');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<DockZoneView zone="right" />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  panelPicker.set(null);
});

const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) => t.getAttribute('aria-label'));
const tab = (name: string) => host.querySelector<HTMLElement>(`[role="tab"][aria-label="${name}"]`)!;

describe('the right side (Properties and the rail)', () => {
  it('names every place on the rail, Properties first', () => {
    expect(tabs()).toEqual(['Properties', 'Library', 'Help']);
    expect(tab('Properties').getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).toContain('Library');
  });

  it('shows the sections that apply, and the rest under Also here', () => {
    expect(host.textContent).toContain('tool body');
    expect(host.textContent).toContain('colour body');
    expect(host.textContent).not.toContain('particle body');
    const also = host.querySelector('.rd-idle')!;
    expect(also.textContent).toContain('Particles');
    expect(also.textContent).toContain('Select particles on the canvas');
    act(() => also.querySelector<HTMLElement>('button')!.click());
    expect(host.textContent).toContain('particle body');
  });

  it('folds a section from its heading button, and says so', () => {
    const head = host.querySelector<HTMLElement>('#rd-sec-h-colors')!;
    expect(head.closest('h3')).toBeTruthy();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    act(() => head.click());
    expect(host.querySelector('#rd-sec-h-colors')!.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('colour body');
    expect(folded.get()).toContain('colors');
  });

  it('opens a rail panel, and pressing it again folds the side away', () => {
    act(() => tab('Library').click());
    expect(host.textContent).toContain('library body');
    expect(host.querySelector('#rd-body')!.getAttribute('aria-labelledby')).toBe('rd-tab-library');
    act(() => tab('Library').click());
    expect(dock.get().layout.zones.right.collapsed).toBe(true);
    act(() => tab('Properties').click());
    expect(dock.get().layout.zones.right.collapsed).toBe(false);
    expect(host.textContent).toContain('tool body');
  });

  it('moves along the rail with the arrow keys, one tab stop', () => {
    expect([...host.querySelectorAll('[role="tab"][tabindex="0"]')].length).toBe(1);
    act(() => tab('Properties').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(dock.get().layout.zones.right.active).toBe('library');
    act(() => tab('Library').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(dock.get().layout.zones.right.active).toBe('help');
  });

  it('asking for a section from elsewhere opens Properties at it', () => {
    act(() => setActive('right', 'library'));
    act(() => setActive('right', 'colors'));
    expect(tab('Properties').getAttribute('aria-selected')).toBe('true');
  });

  it('lists every panel with a sentence, and finds them by search', () => {
    act(() => host.querySelector<HTMLElement>('[data-panels-button]')!.click());
    const list = document.querySelector('.rd-picker')!;
    expect(list.getAttribute('role')).toBe('dialog');
    expect(list.textContent).toContain('Your symbols');
    expect(list.querySelectorAll('[role="option"]').length).toBe(5);
  });

  it('the plain rail and the tabs are there for comparisons', () => {
    act(() => rightStyle.set('rail'));
    expect(tabs()).toEqual(['Tool options', 'Colours', 'Particles', 'Library', 'Help']);
    act(() => rightStyle.set('tabs'));
    expect(host.querySelector('.ui-tabbar')).toBeTruthy();
    expect(host.querySelector('[data-panels-button]')).toBeTruthy();
  });
});
