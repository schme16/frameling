// @vitest-environment jsdom
// Quests point at tools by [data-command="tools.x"]. In the Stacked tool rail a tool that isn't the front one of its group
// has no button of its own, so the ring has to find the group's button (and the tool has to be reachable from it).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { resetStore, store } from '../../src/core/store';
import { SEL } from '../../src/quests/library';
import { forgetFlyoutAsk, resolveTarget } from '../../src/quests/target';
import { resetDock } from '../../src/ui/dock';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { flyRequest, frontTools } from '../../src/ui/toolRail';
import { newDoc } from '../../src/core/doc';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

let host: HTMLDivElement;
let root: Root;
const always = () => true;
/** What the quest bar does: look for the target (outside React), then React catches up. */
function find(sel: string) {
  let el: Element | null = null;
  act(() => void (el = resolveTarget(sel, always)));
  return el as Element | null;
}

function mount(rail: 'two' | 'stacked') {
  setPrefs({ toolRail: rail });
  act(() => root.render(<ToolStrip />));
}

beforeEach(() => {
  resetDock();
  resetPrefs();
  resetStore(newDoc({ width: 100, height: 100 }));
  frontTools.set({});
  flyRequest.set(null);
  forgetFlyoutAsk();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.querySelectorAll('.ui-tool-fly').forEach((e) => e.remove());
});

describe('quests pointing at a tool in the tool rail', () => {
  it('find the tool in the two wide rail', () => {
    mount('two');
    const el = find(SEL.brush);
    expect(el?.getAttribute('data-tool-id')).toBe('brush');
  });

  it('find the group button when the tool is not the front one, and bring it to the front', () => {
    store().setUi({ tool: 'select' });
    mount('stacked');
    // Pencil is the front tool of the Draw group, so the brush has no button of its own.
    expect(host.querySelector('[data-command="tools.brush"]')).toBeNull();
    const el = find(SEL.brush);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-tool-group')).toBe('draw');
    // The group's button now shows the brush, so the same selector finds it directly.
    expect(host.querySelector('[data-command="tools.brush"]')?.getAttribute('data-tool-group')).toBe('draw');
    expect(store().get().ui.tool).toBe('select');
  });

  it('opens the group flyout, once, when another tool of the group is in use', () => {
    store().setUi({ tool: 'pencil' });
    mount('stacked');
    const el = find(SEL.brush);
    expect(el?.getAttribute('data-tool-group')).toBe('draw');
    const item = document.querySelector('.ui-tool-fly [data-command="tools.brush"]');
    expect(item).not.toBeNull();
    // The ring now goes round the flyout item.
    expect(find(SEL.brush)).toBe(item);
    // Picking it works as usual.
    act(() => (item as HTMLElement).click());
    expect(store().get().ui.tool).toBe('brush');
  });

  it('does not reopen a flyout the person closed', () => {
    store().setUi({ tool: 'pencil' });
    mount('stacked');
    find(SEL.brush);
    expect(document.querySelector('.ui-tool-fly')).not.toBeNull();
    // The person clicks away: the flyout closes and the quest does not open it again.
    act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(document.querySelector('.ui-tool-fly')).toBeNull();
    expect(find(SEL.brush)?.getAttribute('data-tool-group')).toBe('draw');
    expect(document.querySelector('.ui-tool-fly')).toBeNull();
  });

  it('give up quietly when the tool is not in the rail at all', () => {
    mount('stacked');
    expect(resolveTarget('[data-command="tools.nothing-here"]', always)).toBeNull();
  });
});
