// @vitest-environment jsdom
// Restart, the page's side: everything that says "restart" goes through one call that tells the desktop side where you
// are, says plainly when it can't happen (and closes nothing), and puts you back at the same frame afterwards.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice } from '../../src/core/choices';
import { saveFile } from '../../src/io/file';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { applyRestoredView, bringBack, currentView, restartFrameling } from '../../src/io/restart';
import '../../src/io/index';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import type { Release, UpdateFacts } from '../../src/update/logic';
import { UpdateOffer } from '../../src/update/UpdateOffer';
import { offer, showOffer } from '../../src/update/state';

// Lets one test pretend the unsaved work is too big to hand over.
const size = vi.hoisted(() => ({ bytes: 0 }));
vi.mock('../../src/io/file', async (orig) => {
  const real = await orig<typeof import('../../src/io/file')>();
  return { ...real, saveFileAsync: async (...a: Parameters<typeof real.saveFileAsync>) => (size.bytes ? new Uint8Array(size.bytes) : real.saveFileAsync(...a)) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toastText = () => toasts.get().map((t) => t.message);
let restart: ReturnType<typeof vi.fn>;
let finish: ReturnType<typeof vi.fn>;
let written: { bytes: Uint8Array; meta: { name: string; filePath: string | null } }[] = [];
let askedToSave = 0;
let autosaved: { bytes: Uint8Array; meta: { name: string; filePath: string | null; docId: string } } | null = null;

function desktopWith(answer: { ok: true; carried?: boolean } | { ok: false; message: string } | 'throws', opts: { writeWorks?: boolean } = {}) {
  restart = vi.fn(async (_v: unknown, carry?: boolean) => {
    if (answer === 'throws') throw new Error('gone');
    return answer.ok ? { ok: true, carried: !!carry } : answer;
  });
  finish = vi.fn(async () => {});
  written = [];
  askedToSave = 0;
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: { read: async () => ({ error: 'No such file.' }) },
    recent: { add: async () => undefined, remove: async () => undefined, list: async () => [] },
    autosave: {
      write: async (bytes: Uint8Array, meta: never) => {
        if (opts.writeWorks === false) return false;
        written.push({ bytes, meta });
        autosaved = { bytes, meta };
        return true;
      },
      read: async () => autosaved,
      clear: async () => undefined,
    },
    app: { restart, getRestore: async () => null, askSaveChanges: async () => void askedToSave++ },
    update: { finish, openPage: async () => {}, onProgress: () => () => {} },
  };
}

beforeEach(() => {
  resetPrefs();
  setPrefs({ onboarded: true });
  clearToasts();
  resetStore(newDoc({ name: 'Ball', length: 12 }));
  offer.set(null);
  size.bytes = 0;
  autosaved = null;
  setChoice('restart.undo', undefined);
});

describe('the one restart', () => {
  it('tells the desktop side where you are, and says nothing when it goes ahead', async () => {
    desktopWith({ ok: true });
    store().setUi({ frame: 5, zoom: 2, panX: 30, panY: 40 });
    expect(await restartFrameling()).toBe(true);
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ frame: 5, zoom: 2, panX: 30, panY: 40 }), false);
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

describe('carrying unsaved work across', () => {
  const dirty = () => {
    store().update('draw', (d) => void (d.name = 'Ball, changed'));
    store().setUi({ dirty: true, frame: 4 });
  };

  it('writes the unsaved work to the autosave first and asks the desktop side to carry it, with no question', async () => {
    desktopWith({ ok: true });
    dirty();
    expect(await restartFrameling()).toBe(true);
    expect(written.length).toBe(1);
    expect(written[0].meta.name).toBe('Ball, changed');
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ frame: 4 }), true);
    expect(askedToSave).toBe(0);
    expect(toastText().join(' ')).not.toMatch(/ask/i);
  });

  it('a drawing with nothing unsaved writes nothing and carries nothing', async () => {
    desktopWith({ ok: true });
    expect(await restartFrameling()).toBe(true);
    expect(written).toEqual([]);
    expect(restart).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('too big to hand over: says so, does not carry, so the desktop side asks the usual question first', async () => {
    desktopWith({ ok: true });
    dirty();
    size.bytes = 500 * 1024 * 1024;
    expect(await restartFrameling()).toBe(true);
    expect(written).toEqual([]);
    expect(restart).toHaveBeenCalledWith(expect.anything(), false);
    expect(toastText()[0]).toMatch(/too big to carry across.*asks about saving first/);
  });

  it('cannot be written: says so, does not carry', async () => {
    desktopWith({ ok: true }, { writeWorks: false });
    dirty();
    await restartFrameling();
    expect(restart).toHaveBeenCalledWith(expect.anything(), false);
    expect(toastText()[0]).toMatch(/Couldn't set your unsaved changes aside.*asks about saving first/);
  });

  it('Undo is said before it goes (once, then remembered), and Not now keeps everything as it is', async () => {
    desktopWith({ ok: true });
    store().update('draw', (d) => void (d.name = 'x'));
    expect(store().canUndo()).toBe(true);
    // No question can be shown in a test, so the usual answer is used; "Not now" is what someone who said no gets.
    expect(await restartFrameling()).toBe(true);
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ hadUndo: true }), expect.any(Boolean));
    setChoice('restart.undo', 'wait');
    restart.mockClear();
    expect(await restartFrameling()).toBe(false);
    expect(restart).not.toHaveBeenCalled();
  });

  it('a drawing with no Undo steps is not asked about Undo', async () => {
    desktopWith({ ok: true });
    setChoice('restart.undo', 'wait');
    expect(await restartFrameling()).toBe(true);
  });
});

describe('coming back with the work', () => {
  const carried = async (frame = 3) => {
    resetStore(newDoc({ name: 'Ball', length: 12 }));
    store().update('draw', (d) => void (d.name = 'Ball, changed'));
    const bytes = saveFile(store().rootDoc(), 'test', new Date(2026, 10, 14));
    resetStore(newDoc({ name: 'Fresh', length: 12 }));
    desktopWith({ ok: true });
    autosaved = { bytes, meta: { name: 'Ball, changed', filePath: '/art/ball.frameling', docId: 'd' } };
    return bringBack({ file: '/art/ball.frameling', view: { frame, zoom: 2, panX: 5, panY: 6, hadUndo: true }, carry: true });
  };

  it('opens the carried copy still marked unsaved, with its changes, at the same frame and view', async () => {
    expect(await carried(7)).toBe(true);
    const { doc, ui } = store().get();
    expect(doc.name).toBe('Ball, changed');
    expect(ui.dirty).toBe(true);
    expect(ui.filePath).toBe('/art/ball.frameling');
    expect(ui.frame).toBe(7);
    expect(ui.zoom).toBe(2);
  });

  it('closing still asks: the desktop side is told it is unsaved', async () => {
    await carried();
    expect(store().get().ui.dirty).toBe(true);
    expect(store().canUndo()).toBe(false);
  });

  it('says Undo started fresh, and nothing else', async () => {
    await carried();
    expect(toastText()).toEqual(['Back where you were, with your unsaved changes. Undo starts fresh.']);
  });

  it('a carried copy that is gone says so and falls back to the saved file, leaving the copy to be offered', async () => {
    resetStore(newDoc({ name: 'Fresh', length: 12 }));
    desktopWith({ ok: true });
    autosaved = null;
    expect(await bringBack({ file: '/art/ball.frameling', view: {}, carry: true })).toBe(false);
    expect(toastText()[0]).toMatch(/Couldn't bring back your unsaved changes/);
  });

  it('with nothing carried, the saved file is what opens', async () => {
    desktopWith({ ok: true });
    expect(await bringBack({ file: null, view: {}, carry: false })).toBe(false);
  });
});
