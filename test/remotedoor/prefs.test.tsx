// @vitest-environment jsdom
// The switch and the key on the settings screen: off to begin with, the key hidden until Show, never shown in stream-safe mode.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStreamSafe } from '../../src/core/streamSafe';
import { RemoteDoorPrefsRow } from '../../src/remotedoor/PrefsRow';
import { remoteStatus } from '../../src/remotedoor/state';
import { closedRemote } from '../../src/shared/remoteDoor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = 'frd_SecretKeyForTheTest1234567890';
const copied: string[] = [];
const calls: string[] = [];
let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="remote.${id}"]`)!;
const click = async (id: string) => {
  await act(async () => q(id).click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(async () => {
  localStorage.clear();
  copied.length = 0;
  calls.length = 0;
  (window as unknown as { frameling: unknown }).frameling = {
    files: {},
    remote: {
      key: async () => KEY,
      roll: async () => 'frd_new',
      open: async (p: number) => (calls.push(`open ${p}`), { running: true, port: p, address: `http://127.0.0.1:${p}`, moved: false, problem: '' }),
      close: async () => void calls.push('close'),
      status: async () => closedRemote(),
      onAsk: () => () => undefined,
      answer: async () => undefined,
    },
    clipboard: { writeText: async (t: string) => (copied.push(t), true) },
  };
  remoteStatus.set(closedRemote());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<RemoteDoorPrefsRow />));
});
afterEach(async () => {
  setStreamSafe(false);
  await act(async () => root.unmount());
  host.remove();
  remoteStatus.set(closedRemote());
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('the switch', () => {
  it('is off to begin with, and says nothing is listening', () => {
    expect(q('switch').getAttribute('aria-checked')).toBe('false');
    expect(q('status').textContent).toMatch(/Nothing is listening/);
    expect(calls).toEqual([]);
  });
  it('opens the door only when pressed', async () => {
    await click('switch');
    expect(calls).toEqual(['open 47231']);
    expect(q('switch').getAttribute('aria-checked')).toBe('true');
    expect(q('status').textContent).toMatch(/this computer only/);
    await click('switch');
    expect(calls).toEqual(['open 47231', 'close']);
    expect(q('switch').getAttribute('aria-checked')).toBe('false');
  });
  it('the address can be copied only while it is open', async () => {
    expect(q('copyAddress').hasAttribute('disabled')).toBe(true);
    await click('switch');
    await click('copyAddress');
    expect(copied).toEqual(['http://127.0.0.1:47231']);
  });
});

describe('the key', () => {
  it('is hidden to begin with, nowhere in the page', () => {
    expect(host.textContent).not.toContain(KEY);
    expect(q('key').textContent).toMatch(/^•+$/);
  });
  it('shows when Show is pressed, and hides when Hide is', async () => {
    await click('reveal');
    expect(q('key').textContent).toBe(KEY);
    await click('reveal');
    expect(host.textContent).not.toContain(KEY);
  });
  it('cannot be shown in stream-safe mode, but can still be copied without showing it', async () => {
    await act(async () => setStreamSafe(true));
    expect((q('reveal') as HTMLButtonElement).disabled).toBe(true);
    await click('copyKey');
    expect(copied).toEqual([KEY]);
    expect(host.textContent).not.toContain(KEY);
  });
});
