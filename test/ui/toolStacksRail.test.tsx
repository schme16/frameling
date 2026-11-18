// @vitest-environment jsdom
// The rail with its stacks, as a person meets it: the Brush button with its soft cousins behind it, a click that picks the one used
// last, a press and hold or a right click that opens the pull-out, a key that changes the button, and the pull-out on a layer that
// cannot use some of them.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { setChoice, _resetChoicesForTests } from '../../src/core/choices';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { toasts } from '../../src/ui/toast';
import { resetDock } from '../../src/ui/dock';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { flyRequest, frontTools } from '../../src/ui/toolRail';
import { STACK_CLICK_CHOICE, STACK_SHARE_CHOICE } from '../../src/ui/toolStacks';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

let host: HTMLDivElement;
let root: Root;
const kindsDoc = () => {
  const doc = newDoc({ width: 100, height: 100 });
  const px = newPixelLayer('Pixels', 8);
  doc.layers.push(px);
  return { doc, vector: doc.layers[0].id, pixel: px.id };
};
const mount = () => act(() => root.render(<ToolStrip />));
const on = (id: string) => act(() => store().setUi({ activeLayerId: id }));
const use = (tool: string) => act(() => store().setUi({ tool }));
const q = (sel: string) => host.querySelector<HTMLElement>(sel);
const brushButton = () => q('.ui-tool.is-stack[data-stack="brush"]')!;
const flyItems = () => [...document.querySelectorAll<HTMLElement>('.ui-tool-fly [role=menuitemradio]')];
const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })));

beforeEach(() => {
  resetDock();
  resetPrefs();
  _resetChoicesForTests();
  frontTools.set({});
  flyRequest.set(null);
  toasts.set([]);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll('.ui-tool-fly').forEach((e) => e.remove());
  vi.useRealTimers();
});

describe('the stacks on the rail', () => {
  it('the Brush, the Eraser and the Retouch tools are one button each, with a corner mark for the rest', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    mount();
    for (const id of ['brush', 'eraser', 'retouch']) expect(q(`.ui-tool.is-stack[data-stack="${id}"]`)?.className, id).toContain('has-more');
    // One button, not six: the soft cousins are not buttons of their own.
    expect(q('[data-tool-group="draw"] [data-tool-id="soft-brush"]')).toBeNull();
    expect(brushButton().getAttribute('data-command')).toBe('tools.brush');
    expect(brushButton().getAttribute('aria-haspopup')).toBe('menu');
    expect(brushButton().getAttribute('aria-label')).toContain('Brushes, 6 tools in this button');
  });

  it('a click picks the tool that is showing, and the button shows the tool used last', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    mount();
    mouse(brushButton(), 'click');
    expect(store().get().ui.tool).toBe('brush');
    // A key press (or anything else) that picks a soft tool changes the button to it.
    use('airbrush');
    expect(brushButton().getAttribute('data-command')).toBe('tools.airbrush');
    expect(brushButton().getAttribute('aria-pressed')).toBe('true');
    // Another tool is picked: the button still shows the one used last from the stack, and a click goes back to it.
    use('pencil');
    expect(brushButton().getAttribute('data-command')).toBe('tools.airbrush');
    expect(brushButton().getAttribute('aria-pressed')).toBe('false');
    mouse(brushButton(), 'click');
    expect(store().get().ui.tool).toBe('airbrush');
  });

  it('with the setting "always the first", a click picks the Brush and the button stays on it', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    setChoice(STACK_CLICK_CHOICE, 'first');
    mount();
    use('airbrush');
    expect(brushButton().getAttribute('data-command')).toBe('tools.brush');
    use('pencil');
    mouse(brushButton(), 'click');
    expect(store().get().ui.tool).toBe('brush');
  });

  it('with the setting "a button each", every tool is on the rail on its own', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    setChoice(STACK_SHARE_CHOICE, 'apart');
    mount();
    expect(q('.ui-tool.is-stack[data-stack="brush"]')).toBeNull();
    expect(q('[data-tool-id="soft-brush"]')).toBeTruthy();
    expect(q('[data-tool-id="soft-eraser"]')).toBeTruthy();
  });
});

describe('the pull-out', () => {
  it('opens on a right click, with each tool by name and key, the one in use marked', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    use('airbrush');
    mount();
    mouse(brushButton(), 'contextmenu');
    expect(document.querySelector('.ui-tool-fly')?.getAttribute('aria-label')).toBe('Brushes tools');
    expect(flyItems().map((i) => i.dataset.toolId)).toEqual(['brush', 'soft-brush', 'airbrush', 'highlighter', 'charcoal', 'pixel-brush']);
    expect(flyItems().find((i) => i.dataset.toolId === 'airbrush')!.getAttribute('aria-checked')).toBe('true');
    expect(flyItems().find((i) => i.dataset.toolId === 'soft-brush')!.textContent).toContain('Soft brush');
    expect(flyItems().find((i) => i.dataset.toolId === 'soft-brush')!.textContent).toContain('Shift');
    expect(brushButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens on a press and hold, and the let go that follows does not also pick a tool', () => {
    vi.useFakeTimers();
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    use('pencil');
    mount();
    mouse(brushButton(), 'pointerdown');
    act(() => void vi.advanceTimersByTime(500));
    expect(document.querySelector('.ui-tool-fly')).toBeTruthy();
    mouse(brushButton(), 'pointerup');
    mouse(brushButton(), 'click');
    expect(store().get().ui.tool).toBe('pencil');
  });

  it('opens from the keyboard with the menu key', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    mount();
    const b = brushButton();
    b.focus();
    act(() => void b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })));
    expect(document.querySelector('.ui-tool-fly')).toBeTruthy();
  });

  it('picking a tool from it picks that tool, and the button shows it', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.pixel);
    mount();
    mouse(brushButton(), 'contextmenu');
    mouse(flyItems().find((i) => i.dataset.toolId === 'highlighter')!, 'click');
    expect(store().get().ui.tool).toBe('highlighter');
    expect(document.querySelector('.ui-tool-fly')).toBeNull();
    expect(brushButton().getAttribute('data-command')).toBe('tools.highlighter');
  });

  it('on a vector layer the pixel tools stay in it, greyed with the reason, even with "hide" chosen', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    setPrefs({ toolsOffLayer: 'hide' });
    on(k.vector);
    mount();
    mouse(brushButton(), 'contextmenu');
    expect(flyItems().map((i) => i.dataset.toolId)).toEqual(['brush', 'soft-brush', 'airbrush', 'highlighter', 'charcoal', 'pixel-brush']);
    const soft = flyItems().find((i) => i.dataset.toolId === 'soft-brush')!;
    expect(soft.className).toContain('is-off');
    expect(soft.getAttribute('aria-disabled')).toBe('true');
    expect(soft.textContent).toContain('Needs a pixel layer');
    expect(soft.getAttribute('aria-description')).toContain('Soft brush works on pixel layers');
    expect(flyItems().find((i) => i.dataset.toolId === 'brush')!.className).not.toContain('is-off');
  });

  it('choosing a greyed one is not refused: it is picked, and the next stroke goes on a pixel layer', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.vector);
    mount();
    mouse(brushButton(), 'contextmenu');
    mouse(flyItems().find((i) => i.dataset.toolId === 'soft-brush')!, 'click');
    expect(store().get().ui.tool).toBe('soft-brush');
    expect(toasts.get().some((t) => t.message.includes('Soft brush draws pixels, so your next stroke goes on a pixel layer'))).toBe(true);
  });

  it('the Retouch button stays on a vector layer, all of it greyed', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    setPrefs({ toolsOffLayer: 'hide' });
    on(k.vector);
    mount();
    const r = q('.ui-tool.is-stack[data-stack="retouch"]')!;
    expect(r.className).toContain('is-off');
    mouse(r, 'contextmenu');
    expect(flyItems().map((i) => i.dataset.toolId)).toEqual(['smudge', 'blur-brush', 'sharpen-brush', 'clone-stamp']);
    expect(flyItems().every((i) => i.className.includes('is-off'))).toBe(true);
  });
});
