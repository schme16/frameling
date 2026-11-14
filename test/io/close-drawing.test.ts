// @vitest-environment jsdom
// Close drawing asks about unsaved work like the window button does, then leaves the app as a new window would have it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store, Store } from '../../src/core/store';
import { closeDrawing } from '../../src/io/close';
import '../../src/io/commands';
import { saveChangesQuestion } from '../../src/main/saveQuestion';
import { MENUS } from '../../src/ui/menus';
import { overlays } from '../../src/ui/overlays';
import { DEFAULT_CW, resetTl, setTl, tl } from '../../src/timeline/state';

const asked: { name: string; neverSaved: boolean | undefined }[] = [];
const recent: string[] = [];
let answer: 'save' | 'discard' | 'cancel' = 'discard';
let cleared = 0;
let saves = 0;

beforeEach(() => {
  asked.length = 0;
  recent.length = 0;
  cleared = 0;
  saves = 0;
  answer = 'discard';
  overlays.set((o) => ({ ...o, sheet: null }));
  resetTl();
  resetStore(newDoc({ name: 'Ball', length: 8 }));
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {
      save: async (o: { path: string | null }) => {
        saves++;
        return { path: o.path ?? '/art/new.frameling' };
      },
    },
    recent: { add: async (p: string) => void recent.push(p), remove: async () => undefined, list: async () => [] },
    autosave: {
      clear: async () => void cleared++,
      write: async () => undefined,
      keep: async () => undefined,
      removeKept: async () => undefined,
    },
    app: {
      askSaveChanges: async (name: string, neverSaved?: boolean) => {
        asked.push({ name, neverSaved });
        return answer;
      },
    },
  };
});

afterEach(() => {
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('Close drawing', () => {
  it('is a command with Ctrl+W, and sits in File between Import sound and Quit', () => {
    expect(getCommand('file.close')).toMatchObject({ label: 'Close drawing', keys: ['Mod+W'], help: 'saving-and-opening' });
    const file = MENUS.find((m) => m.label === 'File')!;
    const i = file.items.indexOf('file.close');
    expect(file.items.slice(i - 2, i + 3)).toEqual(['audio.import', '-', 'file.close', '-', 'file.quit']);
  });

  it('asks when there is unsaved work, and a cancel keeps everything as it was', async () => {
    store().markSaved('/art/ball.frameling');
    store().update('Add a layer', (d) => void d.layers.push({ ...d.layers[0], id: 'extra', name: 'Extra' }));
    answer = 'cancel';
    const id = store().get().doc.id;
    expect(await closeDrawing()).toBe(false);
    expect(asked).toEqual([{ name: 'ball', neverSaved: false }]);
    expect(store().get().doc.id).toBe(id);
    expect(store().get().ui.dirty).toBe(true);
    expect(overlays.get().sheet).toBeNull();
    expect(recent).toEqual([]);
  });

  it('says so when the drawing has never been saved', async () => {
    store().update('Add a layer', (d) => void d.layers.push({ ...d.layers[0], id: 'extra', name: 'Extra' }));
    expect(await closeDrawing()).toBe(true);
    expect(asked).toEqual([{ name: 'Ball', neverSaved: true }]);
    const q = saveChangesQuestion('Ball', true);
    expect(q.detail).toContain(`hasn't been saved yet`);
    expect(q.buttons).toEqual(['Save', `Don't save`, 'Cancel']);
    // The same words as the window button for a drawing that has a file.
    expect(saveChangesQuestion('Ball', false).message).toBe(q.message);
    expect(saveChangesQuestion('Ball', false).detail).toBe(`If you don't save, your latest changes will be lost.`);
  });

  it('saves first when they say Save', async () => {
    store().markSaved('/art/ball.frameling');
    store().update('Add a layer', (d) => void d.layers.push({ ...d.layers[0], id: 'extra', name: 'Extra' }));
    answer = 'save';
    expect(await closeDrawing()).toBe(true);
    expect(saves).toBe(1);
    expect(recent).toEqual(['/art/ball.frameling']);
  });

  it('does not ask about a drawing that is saved', async () => {
    store().markSaved('/art/ball.frameling');
    expect(await closeDrawing()).toBe(true);
    expect(asked).toEqual([]);
    // It goes to the top of Open recent on the way out.
    expect(recent).toEqual(['/art/ball.frameling']);
  });

  it('brings back the welcome sheet, even with Show welcome off', async () => {
    const { setPrefs } = await import('../../src/ui/prefs');
    setPrefs({ showWelcome: false });
    try {
      await closeDrawing();
      expect(overlays.get().sheet).toBe('welcome');
    } finally {
      setPrefs({ showWelcome: true });
    }
  });

  it('leaves everything as a new window has it', async () => {
    const s = store();
    s.markSaved('/art/ball.frameling');
    s.update('Add a layer', (d) => void d.layers.push({ ...d.layers[0], id: 'extra', name: 'Extra' }));
    s.setUi({ frame: 5, selection: ['a', 'b'], activeLayerId: 'extra', playing: true, zoom: 3, panX: 40, panY: -20, onion: { ...s.get().ui.onion, enabled: true } });
    setTl({ cw: 50, clipId: 'clip1', editing: { kind: 'clip', id: 'clip1' }, open: new Set(['extra']), keys: new Set(['k1']) });
    await closeDrawing();

    const now = store();
    const fresh = new Store(newDoc());
    // Everything a new window has: the same ui (frame, selection, zoom, onion skin, file, dirty flag...) and the same drawing, apart from ids.
    expect(now.get().ui).toEqual({ ...fresh.get().ui, activeLayerId: now.get().doc.layers[0].id });
    const ids = (d: object) => JSON.parse(JSON.stringify(d).replace(/"id":"[^"]*"/g, '"id":"x"'));
    expect(ids(now.get().doc)).toEqual(ids(fresh.get().doc));
    expect(now.canUndo()).toBe(false);
    expect(now.canRedo()).toBe(false);
    expect(now.nestedTag()).toBeNull();
    // The timeline's own state, and the autosave copy.
    expect(tl()).toEqual({ cw: DEFAULT_CW, clipId: null, editing: null, open: new Set(), keys: new Set() });
    expect(cleared).toBeGreaterThan(0);
  });
});
