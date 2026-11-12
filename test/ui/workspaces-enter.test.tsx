// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorkspaces } from '../../src/ui/dock';
import { WorkspacesPage } from '../../src/ui/WorkspacesPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const type = (el: HTMLInputElement, text: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('naming a workspace', () => {
  it('Enter in the name field saves it', () => {
    act(() => root.render(<WorkspacesPage />));
    const input = host.querySelector<HTMLInputElement>('.ui-ws-save input')!;
    type(input, 'Cosy corner');
    const before = listWorkspaces().filter((w) => !w.builtin).length;
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    const mine = listWorkspaces().filter((w) => !w.builtin);
    expect(mine.length).toBe(before + 1);
    expect(mine.map((w) => w.name)).toContain('Cosy corner');
    expect(input.value).toBe('');
  });
  it('Enter on an empty name does nothing', () => {
    act(() => root.render(<WorkspacesPage />));
    const input = host.querySelector<HTMLInputElement>('.ui-ws-save input')!;
    const before = listWorkspaces().length;
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(listWorkspaces().length).toBe(before);
  });
});
