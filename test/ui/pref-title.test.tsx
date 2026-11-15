// @vitest-environment jsdom
// The title row of a Preferences page or group with its own on/off switch (PrefTitle): heading and switch together, the switch
// named for screen readers, and a line that says what the current state means.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrefTitle } from '../../src/ui/PrefTitle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = (node: React.ReactNode) => act(async () => root.render(node));

describe('PrefTitle', () => {
  it('puts the heading and the switch in one row, with the switch named on its own', async () => {
    await render(<PrefTitle title="Streaming" label="Streaming tools on or off" on={false} onChange={() => {}} switchTestId="sw" />);
    const head = host.querySelector('.ui-pref-title-head')!;
    expect(head.querySelector('h3')?.textContent).toBe('Streaming');
    const sw = head.querySelector('[role="switch"]')!;
    expect(sw.getAttribute('aria-label')).toBe('Streaming tools on or off');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.getAttribute('data-testid')).toBe('sw');
  });

  it('is an h3 for a page and an h4 for a group', async () => {
    await render(<PrefTitle title="Audience features" level="group" label="Audience features on or off" on onChange={() => {}} />);
    expect(host.querySelector('h4')?.textContent).toBe('Audience features');
    expect(host.querySelector('h3')).toBeNull();
  });

  it('hands the next value to onChange, and shows the state in words as well as in the switch', async () => {
    const seen = vi.fn();
    await render(<PrefTitle title="Snapping" label="Snapping on or off" on={false} onChange={seen} />);
    expect(host.querySelector('.ui-pref-title-state')?.textContent).toBe('Off');
    await act(async () => void host.querySelector<HTMLElement>('[role="switch"]')!.click());
    expect(seen).toHaveBeenCalledWith(true);
    await render(<PrefTitle title="Snapping" label="Snapping on or off" on onChange={seen} />);
    expect(host.querySelector('.ui-pref-title-state')?.textContent).toBe('On');
    expect(host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('says what the state means, and ties that line to the switch', async () => {
    await render(<PrefTitle title="Snapping" label="Snapping on or off" on={false} onChange={() => {}} status="Snapping is off, so nothing jumps." about={<p className="ui-pref-intro">What it is.</p>} statusTestId="st" />);
    const status = host.querySelector('[data-testid="st"]')!;
    expect(status.textContent).toBe('Snapping is off, so nothing jumps.');
    expect(host.querySelector('[role="switch"]')!.getAttribute('aria-describedby')).toBe(status.id);
    expect(host.querySelector('.ui-pref-intro')?.textContent).toBe('What it is.');
  });
});
