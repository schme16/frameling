// @vitest-environment jsdom
// Edit in Frameling: a .flplay's drawing opens, and Save puts it back into the same package.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { findTemplate } from '../../src/templates';
import { saveFile } from '../../src/io/file';
import { playablePackage } from '../../src/export/playable';
import { getLink, readPlayable, setLink } from '../../src/interactives/link';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';

const exported: { bytes: Uint8Array }[] = [];
vi.mock('../../src/export/run', () => ({
  runExport: async (ctx: { settings: { scale: number; transparent: boolean; includeSource: boolean } }) => {
    exported.push({ bytes: strToU8(JSON.stringify(ctx.settings)) });
    return { kind: 'file', name: 'x.flplay', bytes: strToU8(JSON.stringify(ctx.settings)) };
  },
}));

const { openPath, saveDocument } = await import('../../src/io/document');
await import('../../src/interactives/roundtrip');

const ball = () => findTemplate('bouncing-ball')!.make();

function flplay(withSource: boolean, background: string | null = null): Uint8Array {
  const doc = ball();
  const frames = Array.from({ length: doc.length }, () => ({ width: 4, height: 4, pixels: new Uint8ClampedArray(64).fill(255) }));
  return playablePackage({ doc, frames, range: { start: 0, end: doc.length - 1 }, scale: 2, pixelArt: false, background, maxSide: 4096, source: withSource ? saveFile(doc) : null }).bytes;
}

const files = new Map<string, Uint8Array>();
const writes: string[] = [];

beforeEach(() => {
  localStorage.clear();
  setChoice('interactives.saveTarget', undefined);
  files.clear();
  writes.length = 0;
  exported.length = 0;
  resetStore(newDoc());
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {
      read: async (path: string) => (files.has(path) ? { path, bytes: files.get(path) } : { error: 'No such file.' }),
      write: async (path: string) => (writes.push(path), { ok: true }),
      save: async () => null,
      linkPlayable: async () => undefined,
    },
    recent: { add: async () => undefined, remove: async () => undefined, list: async () => [] },
    autosave: { clear: async () => undefined, removeKept: async () => undefined },
    app: { askSaveChanges: async () => 'discard' },
  };
});

afterEach(() => {
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('reading a .flplay', () => {
  it('finds the editable drawing and the package settings', () => {
    const p = readPlayable(flplay(true, '#ffffff'));
    expect(p.source).not.toBeNull();
    expect(p.manifest).toMatchObject({ scale: 2, background: '#ffffff' });
    expect(readPlayable(flplay(false)).source).toBeNull();
    expect(() => readPlayable(zipSync({ 'manifest.json': strToU8('{"format":"other"}') }))).toThrow(/Interactives file/);
    expect(() => readPlayable(new Uint8Array([1, 2, 3]))).toThrow(/Interactives file/);
  });

  it('remembers links per drawing', () => {
    setLink('a', { path: '/x/a.flplay', update: false, scale: 3, transparent: true });
    expect(getLink('a')).toEqual({ path: '/x/a.flplay', update: false, scale: 3, transparent: true });
    setLink('a', null);
    expect(getLink('a')).toBeNull();
  });
});

describe('the round trip', () => {
  it('opens the drawing inside, and Save updates the same .flplay with its size and see-through', async () => {
    files.set('/art/ball.flplay', flplay(true));
    expect(await openPath('/art/ball.flplay')).toBe(true);
    const { doc, ui } = store().get();
    expect(doc.name).toBe(ball().name);
    expect(ui.filePath).toBeNull();
    expect(getLink(doc.id)).toMatchObject({ path: '/art/ball.flplay', update: true, scale: 2, transparent: true });

    store().update('Change', (d) => void (d.name = 'Changed'));
    expect(await saveDocument()).toBe(true);
    expect(writes).toEqual(['/art/ball.flplay']);
    expect(JSON.parse(new TextDecoder().decode(exported[0].bytes))).toMatchObject({ format: 'interactives', range: 'all', scale: 2, transparent: true, includeSource: true });
    expect(store().get().ui.dirty).toBe(false);
  });

  it('leaves the .flplay alone when updating is off', async () => {
    files.set('/art/ball.flplay', flplay(true));
    await openPath('/art/ball.flplay');
    const id = store().get().doc.id;
    setLink(id, { ...getLink(id)!, update: false });
    await saveDocument();
    expect(writes).toEqual([]);
  });

  it('with "also keep a .frameling", saves that first and then updates the package', async () => {
    files.set('/art/ball.flplay', flplay(true));
    await openPath('/art/ball.flplay');
    setChoice('interactives.saveTarget', 'both');
    const w = window as unknown as { frameling: { files: { save: unknown } } };
    w.frameling.files.save = async () => ({ path: '/art/ball.frameling' });
    expect(await saveDocument()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(store().get().ui.filePath).toBe('/art/ball.frameling');
    expect(writes).toEqual(['/art/ball.flplay']);
  });

  it('says so when the package has no drawing inside', async () => {
    files.set('/art/flat.flplay', flplay(false));
    expect(await openPath('/art/flat.flplay')).toBe(false);
  });
});
