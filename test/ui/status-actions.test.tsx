// @vitest-environment jsdom
// Every chip in the footer bar opens the thing it is telling you about.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { applyWorkspace, dock } from '../../src/ui/dock';
import { StatusBar } from '../../src/ui/StatusBar';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  applyWorkspace('draw');
  resetStore(newDoc({ width: 320, height: 200 }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<StatusBar />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const chip = (text: string) => [...host.querySelectorAll<HTMLElement>('.ui-status-item')].find((b) => (b.textContent ?? '').includes(text))!;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('the footer bar', () => {
  it('has the size, speed and frame as buttons, not dead text', () => {
    for (const t of ['320 x 200', 'fps', 'Frame 1 of']) expect(chip(t).tagName).toBe('BUTTON');
  });

  it('the size and speed chips open the canvas size and speed dialog, on the field you pressed', async () => {
    const mod = await import('../../src/canvas/DocumentSettings');
    const open = vi.spyOn(mod, 'openDocumentSettings').mockImplementation(() => {});
    click(chip('320 x 200'));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('size'));
    click(chip('fps'));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('fps'));
  });

  it('the frame chip brings the timeline out in front', () => {
    const where = () => dock.get().layout.zones.bottom;
    // Put something else in front of it first.
    act(() => void dock.set({ ...dock.get(), layout: { ...dock.get().layout, zones: { ...dock.get().layout.zones, bottom: { ...where(), active: null } } } }));
    click(chip('Frame 1 of'));
    expect(where().active).toBe('timeline');
  });
});
