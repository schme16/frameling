// @vitest-environment jsdom
// Updates, the page: the quiet check (off means no network), the offer waiting for a calm moment, the three answers
// and what they remember, the Check for updates command, and the card's buttons.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import { wordsTree } from '../helpers/menuTree';
import type { Release, UpdateFacts } from '../../src/update/logic';
import '../../src/renderer/features';
import { UpdateOffer } from '../../src/update/UpdateOffer';
import { UpdatePanel } from '../../src/update/UpdatePanel';
import { answer, checkForUpdates, offer, resetUpdateMemory, startUpdateWatch } from '../../src/update/state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rel = (tag: string, o: Partial<Release> = {}): Release => ({ tag, name: tag, notes: '## New\n- Turning the view', page: `https://github.com/schme16/frameling/releases/tag/${tag}`, draft: false, prerelease: false, assets: [], ...o });
const facts = (o: Partial<UpdateFacts> = {}): UpdateFacts => ({ how: 'appimage', beta: false, why: '', version: '0.1.0', platform: 'linux', arch: 'x64', canCheck: true, ...o });

function bridge(releases: Release[], f: UpdateFacts = facts(), extra: Record<string, unknown> = {}) {
  const b = {
    facts: vi.fn(async () => f),
    releases: vi.fn(async () => ({ ok: true as const, releases })),
    install: vi.fn(async () => ({ ok: true as const, next: 'restart' as const })),
    openPage: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    onProgress: vi.fn(() => () => {}),
    ...extra,
  };
  (window as unknown as { frameling: unknown }).frameling = { update: b };
  return b;
}
const toastText = () => toasts.get().map((t) => t.message);

beforeEach(() => {
  resetPrefs();
  setPrefs({ onboarded: true });
  clearToasts();
  resetUpdateMemory();
});
afterEach(() => {
  delete (window as unknown as { frameling?: unknown }).frameling;
  vi.useRealTimers();
});

describe('the quiet check', () => {
  it('asks nobody when the switch is off', async () => {
    setPrefs({ updateCheck: false });
    const b = bridge([rel('v0.2.0')]);
    await checkForUpdates();
    expect(b.facts).not.toHaveBeenCalled();
    expect(b.releases).not.toHaveBeenCalled();
  });
  it('asks nobody in the web version, where there is no desktop side', async () => {
    await checkForUpdates();
    expect(offer.get()).toBeNull();
  });
  it('does not even start looking when the switch is off', async () => {
    vi.useFakeTimers();
    setPrefs({ updateCheck: false });
    const b = bridge([rel('v0.2.0')]);
    const stop = startUpdateWatch();
    await vi.advanceTimersByTimeAsync(60_000);
    stop();
    expect(b.releases).not.toHaveBeenCalled();
  });
  it('is on by default', () => expect(getPrefs().updateCheck).toBe(true));
});

describe('the offer waits for a calm moment', () => {
  it('stays quiet while someone is drawing, then turns up', async () => {
    vi.useFakeTimers();
    bridge([rel('v0.2.0')]);
    const stop = startUpdateWatch();
    await vi.advanceTimersByTimeAsync(20_500);
    // The check has run; a pointer goes down and stays down.
    window.dispatchEvent(new Event('pointerdown'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(offer.get()).toBeNull();
    window.dispatchEvent(new Event('pointerup'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(offer.get()).toBeNull();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(offer.get()?.release.tag).toBe('v0.2.0');
    stop();
  });
  it('does not turn up while the first-run hello is still to come', async () => {
    vi.useFakeTimers();
    setPrefs({ onboarded: false });
    bridge([rel('v0.2.0')]);
    const stop = startUpdateWatch();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(offer.get()).toBeNull();
    stop();
  });
});

describe('the three answers, as the person meets them', () => {
  it('Skip this one: remembered in the settings, never offered by itself again, a newer one still is', async () => {
    bridge([rel('v0.2.0')]);
    await checkForUpdates({ manual: true });
    expect(offer.get()?.release.tag).toBe('v0.2.0');
    await act(async () => answer('skip'));
    expect(offer.get()).toBeNull();
    expect(getPrefs().updateSkipped).toBe('0.2.0');
    // Next launch: the page starts again with the skip in the settings and nothing else.
    resetUpdateMemory();
    vi.useFakeTimers();
    const stop = startUpdateWatch();
    await vi.advanceTimersByTimeAsync(80_000);
    expect(offer.get()).toBeNull();
    stop();
    bridge([rel('v0.2.0'), rel('v0.3.0')]);
    await checkForUpdates({ manual: true });
    expect(offer.get()?.release.tag).toBe('v0.3.0');
  });
  it('Not right now: goes away, stays away for this run, and comes back on the next launch', async () => {
    vi.useFakeTimers();
    const b = bridge([rel('v0.2.0')]);
    await checkForUpdates();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(offer.get()?.release.tag).toBe('v0.2.0');
    await act(async () => answer('later'));
    expect(offer.get()).toBeNull();
    expect(getPrefs().updateSkipped).toBe('');
    await checkForUpdates();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(offer.get()).toBeNull();
    // A new launch forgets it.
    resetUpdateMemory();
    await checkForUpdates();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(offer.get()?.release.tag).toBe('v0.2.0');
    expect(b.install).not.toHaveBeenCalled();
  });
  it('Update now: nothing is downloaded before it, and it asks the desktop side for exactly that release', async () => {
    const b = bridge([rel('v0.2.0')]);
    await checkForUpdates({ manual: true });
    expect(b.install).not.toHaveBeenCalled();
    await act(async () => answer('now'));
    expect(b.install).toHaveBeenCalledWith('v0.2.0');
    expect(offer.get()?.phase).toEqual({ kind: 'ready', next: 'restart' });
    expect(getPrefs().updateSkipped).toBe('');
  });
  it('Update now that fails says why and keeps the offer to open the page', async () => {
    bridge([rel('v0.2.0')], facts(), { install: vi.fn(async () => ({ ok: false as const, message: 'The download stopped part way.' })) });
    await checkForUpdates({ manual: true });
    await act(async () => answer('now'));
    expect(offer.get()?.phase).toEqual({ kind: 'failed', text: 'The download stopped part way.' });
  });
});

describe('Check for updates', () => {
  it('is a command, in the Help menu', () => {
    expect(getCommand('help.checkUpdates')?.label).toBe('Check for updates');
    const help = wordsTree().find((m) => m.label === 'Help');
    expect(JSON.stringify(help)).toContain('Check for updates');
  });
  it('says plainly when you are on the newest', async () => {
    bridge([rel('v0.1.0')]);
    await checkForUpdates({ manual: true });
    expect(toastText().join(' ')).toMatch(/newest version \(0\.1\.0\)/);
    expect(offer.get()).toBeNull();
  });
  it('works with the switch off, because you asked', async () => {
    setPrefs({ updateCheck: false });
    const b = bridge([rel('v0.2.0')]);
    await checkForUpdates({ manual: true });
    expect(b.releases).toHaveBeenCalled();
    expect(offer.get()?.release.tag).toBe('v0.2.0');
  });
  it('says why when GitHub cannot be reached', async () => {
    bridge([], facts(), { releases: vi.fn(async () => ({ ok: false as const, message: "Couldn't reach GitHub. Is the internet on?" })) });
    await checkForUpdates({ manual: true });
    expect(toastText().join(' ')).toMatch(/Couldn't check.*internet/);
  });
  it('says so in the web version and in a source run', async () => {
    await checkForUpdates({ manual: true });
    expect(toastText().join(' ')).toMatch(/web version/);
    clearToasts();
    bridge([rel('v0.2.0')], facts({ canCheck: false }));
    await checkForUpdates({ manual: true });
    expect(toastText().join(' ')).toMatch(/source folder/);
    expect(offer.get()).toBeNull();
  });
  it('shows a draft or pre-release only to a beta copy', async () => {
    bridge([rel('v0.2.0', { prerelease: true })]);
    await checkForUpdates({ manual: true });
    expect(offer.get()).toBeNull();
    bridge([rel('v0.2.0', { prerelease: true })], facts({ beta: true, how: 'page', why: 'This is the beta copy.' }));
    await checkForUpdates({ manual: true });
    expect(offer.get()?.release.prerelease).toBe(true);
  });
});

describe('the card', () => {
  async function mount() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<UpdateOffer />));
    return { host, done: () => act(async () => root.unmount()) };
  }
  const press = (id: string) => act(async () => void document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click());

  it('shows the release\'s own words and the three answers', async () => {
    const b = bridge([rel('v0.2.0')]);
    const { host, done } = await mount();
    await act(async () => void (await checkForUpdates({ manual: true })));
    expect(host.textContent).toContain('Frameling 0.2.0 is out');
    expect(host.textContent).toContain('Turning the view');
    for (const id of ['update.now', 'update.later', 'update.skip']) expect(host.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
    await press('update.skip');
    expect(host.querySelector('.up-offer')).toBeNull();
    expect(b.install).not.toHaveBeenCalled();
    await done();
  });
  it('a copy that cannot swap itself offers the page, not Update now', async () => {
    const b = bridge([rel('v0.2.0')], facts({ how: 'page', why: 'On a Mac the new app is a download.' }));
    const { host, done } = await mount();
    await act(async () => void (await checkForUpdates({ manual: true })));
    expect(host.querySelector('[data-testid="update.now"]')).toBeNull();
    expect(host.textContent).toContain('On a Mac');
    await press('update.page');
    expect(b.openPage).toHaveBeenCalledWith('https://github.com/schme16/frameling/releases/tag/v0.2.0');
    expect(offer.get()).toBeNull();
    await done();
  });
  it('Escape means Not right now', async () => {
    bridge([rel('v0.2.0')]);
    const { host, done } = await mount();
    await act(async () => void (await checkForUpdates({ manual: true })));
    const notes = host.querySelector<HTMLElement>('.up-notes')!;
    notes.focus();
    await act(async () => void notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(offer.get()).toBeNull();
    expect(getPrefs().updateSkipped).toBe('');
    await done();
  });
});

describe('the switch in Preferences', () => {
  it('turns the check off and says what is sent', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<UpdatePanel />));
    expect(host.textContent).toContain('one request');
    expect(host.textContent).toContain('Nothing of yours goes with it');
    await act(async () => void host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    expect(getPrefs().updateCheck).toBe(false);
    expect(host.textContent).toContain('Nothing is asked of anyone');
    await act(async () => root.unmount());
  });
});
