// @vitest-environment jsdom
// The overlay's block in Preferences: the address hidden until Show, never shown in stream-safe mode, copied whole,
// the plain steps for OBS written out, and gone when the feature is off.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStreamSafe } from '../../src/core/streamSafe';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { doorStatus } from '../../src/streamdoor/state';
import { streamOverlayFeature } from '../../src/streamoverlay';
import { SHOW_FOR_MS, StreamOverlayPrefsRow } from '../../src/streamoverlay/PrefsRow';
import { overlayTest } from '../../src/streamoverlay/sources';
import { closedStatus } from '../../src/shared/streamDoor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const URL_ = 'http://127.0.0.1:47213/overlay/ov_SecretTokenForTheTest1234567890/';
const copied: string[] = [];
let host: HTMLDivElement;
let root: Root;
let rolled = 0;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="streamoverlay.${id}"]`)!;
const click = async (id: string) => {
  await act(async () => q(id).click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(async () => {
  localStorage.clear();
  copied.length = 0;
  rolled = 0;
  (window as unknown as { frameling: unknown }).frameling = {
    files: {},
    door: { key: async () => 'fld_x', roll: async () => 'fld_y', onAsk: () => () => undefined },
    overlay: { url: async () => URL_, roll: async () => void rolled++, setOn: async () => undefined, push: async () => undefined },
    clipboard: { writeText: async (t: string) => (copied.push(t), true) },
  };
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, streamOverlayFeature]);
  doorStatus.set({ running: true, port: 47213, address: 'http://127.0.0.1:47213', moved: false, problem: '' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<StreamOverlayPrefsRow />));
});
afterEach(async () => {
  vi.useRealTimers();
  setStreamSafe(false);
  overlayTest.set(null);
  await act(async () => root.unmount());
  host.remove();
  doorStatus.set(closedStatus());
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('the stream overlay in Preferences', () => {
  it('hides the address to begin with, secret and all', () => {
    expect(host.textContent).not.toContain('ov_Secret');
    expect(q('address').textContent).toMatch(/^http:\/\/127\.0\.0\.1:47213\/overlay\/•+\/$/);
  });
  it('shows it when Show is pressed, hides it again, and hides it by itself after a few seconds', async () => {
    await click('reveal');
    expect(q('address').textContent).toBe(URL_);
    await click('reveal');
    expect(host.textContent).not.toContain('ov_Secret');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => q('reveal').click());
    await act(async () => void (await Promise.resolve()));
    expect(q('address').textContent).toBe(URL_);
    await act(async () => void vi.advanceTimersByTime(SHOW_FOR_MS + 10));
    expect(host.textContent).not.toContain('ov_Secret');
  });
  it('never shows in stream-safe mode, and goes the moment it is switched on, but can still be copied', async () => {
    await click('reveal');
    await act(async () => setStreamSafe(true));
    expect(host.textContent).not.toContain('ov_Secret');
    expect((q('reveal') as HTMLButtonElement).disabled).toBe(true);
    await click('copy');
    expect(copied).toEqual([URL_]);
    expect(host.textContent).not.toContain('ov_Secret');
  });
  it('copies the whole address without drawing it', async () => {
    await click('copy');
    expect(copied).toEqual([URL_]);
    expect(host.textContent).not.toContain('ov_Secret');
  });
  it('writes the steps for OBS in plain words', () => {
    const t = q('steps').textContent!;
    for (const w of ['Sources', 'Browser', 'URL', 'Width', 'Height']) expect(t).toContain(w);
  });
  it('makes a new address only after being sure', async () => {
    await act(async () => q('roll').click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(rolled).toBe(0);
  });
  it('starts a test from the button, and the button waits for the door', async () => {
    await click('test');
    expect(overlayTest.get()).not.toBeNull();
    await act(async () => doorStatus.set(closedStatus()));
    expect((q('test') as HTMLButtonElement).disabled).toBe(true);
    expect((q('copy') as HTMLButtonElement).disabled).toBe(true);
  });
  it('is not drawn when the feature is off', async () => {
    await act(async () => void setFeatureOn('stream-overlay', false));
    expect(host.querySelector('[data-testid="streamoverlay.prefs"]')).toBeNull();
  });
});
