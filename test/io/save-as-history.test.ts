// @vitest-environment jsdom
// Save as makes a separate copy with its own version history; the original keeps its id and its versions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { saveDocument, saveDocumentAs } from '../../src/io/document';
import { listVersions, markVersionBaseline, takeVersion } from '../../src/io/versions';
import { loadFile } from '../../src/io/file';

const written = new Map<string, Uint8Array>();
let pick = '/art/copy.frameling';

beforeEach(async () => {
  for (const k of ['versions', 'versions-index'] as const) for (const e of await memoryLibrary.list(k)) await memoryLibrary.remove(k, e.id);
  setLibraryForTests(memoryLibrary);
  written.clear();
  pick = '/art/copy.frameling';
  resetStore(newDoc({ name: 'Ball', length: 4 }));
  store().markSaved('/art/ball.frameling');
  markVersionBaseline();
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {
      save: async (o: { bytes: Uint8Array; path: string | null }) => {
        const p = o.path ?? pick;
        written.set(p, o.bytes);
        return { path: p };
      },
    },
    autosave: { clear: async () => undefined, removeKept: async () => undefined },
  };
});

afterEach(() => {
  setLibraryForTests(null);
  delete (window as unknown as { frameling?: unknown }).frameling;
});

const idIn = (p: string) => loadFile(written.get(p)!).doc.id;

describe('Save as and version history', () => {
  it('gives the copy a new id, so its versions are its own', async () => {
    const original = store().get().doc.id;
    await takeVersion({ name: 'Before the copy' });
    expect(await saveDocumentAs()).toBe(true);
    const copy = store().get().doc.id;
    expect(copy).not.toBe(original);
    expect(idIn('/art/copy.frameling')).toBe(copy);
    expect(store().get().ui).toMatchObject({ filePath: '/art/copy.frameling', dirty: false });
    // The copy starts with an empty history; the original's is untouched.
    expect(await listVersions(copy)).toHaveLength(0);
    store().update('Rename', (d) => void (d.name = 'Copy'));
    await takeVersion({ name: 'In the copy' });
    expect((await listVersions(copy)).map((v) => v.name)).toEqual(['In the copy']);
    expect((await listVersions(original)).map((v) => v.name)).toEqual(['Before the copy']);
    // A plain save afterwards keeps the copy's id.
    await saveDocument();
    expect(store().get().doc.id).toBe(copy);
  });

  it('keeps the id when Save as picks the same file, or the drawing had no file yet', async () => {
    const id = store().get().doc.id;
    pick = '/art/ball.frameling';
    await saveDocumentAs();
    expect(store().get().doc.id).toBe(id);
    expect(idIn('/art/ball.frameling')).toBe(id);
    resetStore(newDoc({ name: 'New' }));
    const fresh = store().get().doc.id;
    pick = '/art/new.frameling';
    await saveDocumentAs();
    expect(store().get().doc.id).toBe(fresh);
  });
});
