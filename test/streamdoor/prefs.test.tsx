// @vitest-environment jsdom
// The key on the settings screen: hidden until someone presses Show, hidden again, never shown in stream-safe mode.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStreamSafe } from '../../src/core/streamSafe';
import { _resetFeaturesForTests, registerFeatures } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { StreamDoorPrefsRow, SHOW_FOR_MS } from '../../src/streamdoor/PrefsRow';
import { doorStatus } from '../../src/streamdoor/state';
import { closedStatus } from '../../src/shared/streamDoor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = 'fld_SecretKeyForTheTest1234567890';
const copied: string[] = [];
let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="streamdoor.${id}"]`)!;
const click = async (id: string) => {
  await act(async () => q(id).click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(async () => {
  localStorage.clear();
  copied.length = 0;
  (window as unknown as { frameling: unknown }).frameling = {
    files: {},
    door: { key: async () => KEY, roll: async () => 'fld_new', onAsk: () => () => undefined },
    clipboard: { writeText: async (t: string) => (copied.push(t), true) },
  };
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature]);
  doorStatus.set({ running: true, port: 47213, address: 'http://127.0.0.1:47213', moved: false, problem: '' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<StreamDoorPrefsRow />));
});
afterEach(async () => {
  vi.useRealTimers();
  setStreamSafe(false);
  await act(async () => root.unmount());
  host.remove();
  doorStatus.set(closedStatus());
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('the key on the settings screen', () => {
  it('is hidden to begin with, nowhere in the page', () => {
    expect(host.textContent).not.toContain(KEY);
    expect(q('key').textContent).toMatch(/^•+$/);
  });

  it('shows when Show is pressed, and hides when Hide is', async () => {
    await click('reveal');
    expect(q('key').textContent).toBe(KEY);
    expect(q('reveal').textContent).toContain('Hide');
    await click('reveal');
    expect(host.textContent).not.toContain(KEY);
  });

  it('hides itself again after a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => q('reveal').click());
    await act(async () => void (await Promise.resolve()));
    expect(q('key').textContent).toBe(KEY);
    await act(async () => void vi.advanceTimersByTime(SHOW_FOR_MS + 10));
    expect(host.textContent).not.toContain(KEY);
  });

  it('cannot be shown in stream-safe mode, and goes the moment it is switched on', async () => {
    await click('reveal');
    expect(q('key').textContent).toBe(KEY);
    await act(async () => setStreamSafe(true));
    expect(host.textContent).not.toContain(KEY);
    expect((q('reveal') as HTMLButtonElement).disabled).toBe(true);
    await click('reveal');
    expect(host.textContent).not.toContain(KEY);
  });

  it('can be copied without being shown, even in stream-safe mode', async () => {
    await act(async () => setStreamSafe(true));
    await click('copyKey');
    expect(copied).toEqual([KEY]);
    expect(host.textContent).not.toContain(KEY);
  });

  it('copies the address', async () => {
    await click('copyAddress');
    expect(copied).toEqual(['http://127.0.0.1:47213']);
  });

  it('says plainly when the port was taken and it moved', async () => {
    await act(async () => doorStatus.set({ running: true, port: 47215, address: 'http://127.0.0.1:47215', moved: true, problem: '' }));
    expect(q('status').textContent).toContain('moved to 47215');
    await act(async () => doorStatus.set(closedStatus(47213, 'port-busy')));
    expect(q('status').textContent).toContain('is taken');
  });
});
