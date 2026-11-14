// @vitest-environment jsdom
// Restart, the page's side: everything that says "restart" goes through one call that tells the desktop side where you
// are, says plainly when it can't happen (and closes nothing), and puts you back at the same frame afterwards.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { applyRestoredView, currentView, restartFrameling } from '../../src/io/restart';
import '../../src/io/index';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import type { Release, UpdateFacts } from '../../src/update/logic';
import { UpdateOffer } from '../../src/update/UpdateOffer';
import { offer, showOffer } from '../../src/update/state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toastText = () => toasts.get().map((t) => t.message);
let restart: ReturnType<typeof vi.fn>;
let finish: ReturnType<typeof vi.fn>;

function desktopWith(answer: { ok: true } | { ok: false; message: string } | 'throws') {
  restart = vi.fn(async () => {
    if (answer === 'throws') throw new Error('gone');
    return answer;
  });
  finish = vi.fn(async () => {});
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {},
    app: { restart, getRestore: async () => null },
    update: { finish, openPage: async () => {}, onProgress: () => () => {} },
  };
}

beforeEach(() => {
  resetPrefs();
  setPrefs({ onboarded: true });
  clearToasts();
  resetStore(newDoc({ name: 'Ball', length: 12 }));
  offer.set(null);
});

describe('the one restart', () => {
  it('tells the desktop side where you are, and says nothing when it goes ahead', async () => {
    desktopWith({ ok: true });
    store().setUi({ frame: 5, zoom: 2, panX: 30, panY: 40 });
    expect(await restartFrameling()).toBe(true);
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ frame: 5, zoom: 2, panX: 30, panY: 40 }));
    expect(toastText()).toEqual([]);
  });

  it('where it cannot happen, says so plainly and that nothing was closed', async () => {
    desktopWith({ ok: false, message: "Frameling can't find its own file to open it again, so it can't restart itself. Close it and start it again yourself." });
    expect(await restartFrameling()).toBe(false);
    expect(toastText()[0]).toMatch(/start it again yourself/);
    expect(toastText()[0]).toMatch(/Nothing was closed/);
  });

  it('a desktop side that breaks says the same, never silence', async () => {
    desktopWith('throws');
    expect(await restartFrameling()).toBe(false);
    expect(toastText()[0]).toMatch(/start it again yourself/);
  });

  it('in the web version it says restarting is for the desktop app', async () => {
    delete (window as unknown as { frameling?: unknown }).frameling;
    expect(await restartFrameling()).toBe(false);
    expect(toastText()[0]).toMatch(/desktop app/);
  });

  it('is a command in the palette', async () => {
    desktopWith({ ok: true });
    const c = getCommand('app.restart')!;
    expect(c.label).toBe('Restart Frameling');
    await c.run();
    expect(restart).toHaveBeenCalledOnce();
  });
});

describe('update: Restart now', () => {
  const release: Release = { tag: 'v0.2.0', name: 'v0.2.0', notes: '', page: 'https://github.com/schme16/frameling/releases/tag/v0.2.0', draft: false, prerelease: false, assets: [] };
  const facts: UpdateFacts = { how: 'appimage', beta: false, why: '', version: '0.1.0', platform: 'linux', arch: 'x64', canCheck: true };
  async function press(next: 'restart' | 'installer') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<UpdateOffer />));
    showOffer(release, facts);
    await act(async () => offer.set((o) => (o ? { ...o, phase: { kind: 'ready', next } } : o)));
    await act(async () => void host.querySelector<HTMLButtonElement>('[data-testid="update.finish"]')!.click());
    await act(async () => root.unmount());
  }

  it('is the same restart: it asks about unsaved work and comes back, not a plain close', async () => {
    desktopWith({ ok: true });
    await press('restart');
    expect(restart).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
  });

  it('with an installer it only closes, so the installer can work', async () => {
    desktopWith({ ok: true });
    await press('installer');
    expect(finish).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
  });
});

describe('coming back', () => {
  it('puts you at the same frame, layer and view, within what the drawing has', () => {
    const layer = store().get().doc.layers[0].id;
    applyRestoredView({ frame: 7, layerId: layer, zoom: 3, panX: 11, panY: 12 });
    expect(currentView()).toEqual({ frame: 7, layerId: layer, zoom: 3, panX: 11, panY: 12 });
    applyRestoredView({ frame: 400, layerId: 'gone' });
    expect(store().get().ui.frame).toBe(11);
    expect(store().get().ui.activeLayerId).toBe(layer);
  });
});
