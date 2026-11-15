// @vitest-environment jsdom
// The Streaming menu leaves the bar the moment the streaming tools are tucked away (no menu open, nothing else
// touched), and comes back when they are brought back.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';
import { setStreaming } from '../../src/features/streamFamily';
import { MenuBar } from '../../src/ui/MenuBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  resetStore(newDoc({ width: 8, height: 8 }));
  setStreaming(true, { remember: false });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MenuBar />));
});
afterEach(() => {
  setStreaming(true, { remember: false });
  act(() => root.unmount());
  host.remove();
});
const bar = () => [...host.querySelectorAll<HTMLElement>('[data-top]')].map((t) => t.textContent);

it('takes Streaming off the bar when the tools are tucked away, and puts it back', () => {
  expect(bar()).toContain('Streaming');
  act(() => void setStreaming(false, { remember: false }));
  expect(bar()).not.toContain('Streaming');
  expect(bar()).toContain('View');
  act(() => void setStreaming(true, { remember: false }));
  expect(bar()).toContain('Streaming');
});
