// Saved snapping ticks: only what someone chose is kept, and the old whole-set saves are cleaned up once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPicks, migrateSavedPicks, sanitizeChosen, withChosen } from '../../src/canvas/snapModel';

const KEY = 'frameling.view';

/** Loads view settings fresh with `saved` in storage; returns the module and what ends up stored. */
async function load(saved: unknown) {
  const mem = new Map<string, string>();
  if (saved !== undefined) mem.set(KEY, JSON.stringify(saved));
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  vi.resetModules();
  const m = await import('../../src/canvas/viewSettings');
  return { ...m, stored: () => JSON.parse(mem.get(KEY) ?? 'null') };
}

afterEach(() => vi.unstubAllGlobals());

// What the first versions wrote: every tick, whenever any view setting changed.
const OLD_FULL = {
  vector: { page: true, centre: true, guides: true, grid: true, shapes: false, perspective: true, angles: true },
  pixel: { page: false, centre: false, guides: false, grid: false, cells: true, perspective: true, angles: true },
  artboard: { artboards: false },
};

describe('migrating the old whole-set save', () => {
  it('drops every tick still at its old default', () => {
    expect(migrateSavedPicks(OLD_FULL)).toEqual({});
  });
  it('keeps the ticks that were really changed', () => {
    const saved = { ...OLD_FULL, vector: { ...OLD_FULL.vector, guides: false, shapes: true }, artboard: { artboards: true } };
    expect(migrateSavedPicks(saved)).toEqual({ vector: { guides: false, shapes: true }, artboard: { artboards: true } });
  });
  it('ignores junk', () => {
    expect(migrateSavedPicks(undefined)).toEqual({});
    expect(migrateSavedPicks({ vector: { bogus: false, page: 'no' }, pixel: 3 })).toEqual({});
  });
});

describe('the chosen ticks', () => {
  it('are sparse, and setting one adds only that one', () => {
    const c = withChosen({}, 'vector', 'shapes', false);
    expect(c).toEqual({ vector: { shapes: false } });
    expect(withChosen(c, 'artboard', 'artboards', false)).toEqual({ vector: { shapes: false }, artboard: { artboards: false } });
    expect(withChosen(c, 'vector', 'cells', true)).toBe(c);
  });
  it('sanitize to known booleans', () => {
    expect(sanitizeChosen({ vector: { shapes: false, nope: true, page: 1 } })).toEqual({ vector: { shapes: false } });
  });
});

describe('loading and saving the view settings', () => {
  it('gives the new defaults to someone with the old whole set saved', async () => {
    const v = await load({ snap: true, snapPicks: OLD_FULL });
    expect(v.getViewSettings().snapPicks.vector.shapes).toBe(true);
    expect(v.getViewSettings().snapPicks.artboard.artboards).toBe(true);
    expect(v.getViewSettings().snapChosen).toEqual({});
  });
  it('keeps a changed tick from the old save', async () => {
    const v = await load({ snapPicks: { ...OLD_FULL, vector: { ...OLD_FULL.vector, page: false } } });
    expect(v.getViewSettings().snapPicks.vector.page).toBe(false);
    expect(v.getViewSettings().snapPicks.vector.shapes).toBe(true);
  });
  it('saves only the chosen ticks, never the whole set', async () => {
    const v = await load({ snapPicks: OLD_FULL });
    v.setViewSettings({ rulers: true });
    expect(v.stored().snapPicks).toBeUndefined();
    expect(v.stored().snapChosen).toEqual({});
    v.setViewSettings({ snapChosen: withChosen(v.getViewSettings().snapChosen, 'vector', 'shapes', false) });
    expect(v.stored().snapChosen).toEqual({ vector: { shapes: false } });
    expect(v.getViewSettings().snapPicks.vector.shapes).toBe(false);
  });
  it('reads back what it saved, and a choice made on purpose survives the migration', async () => {
    const v = await load({ snapChosen: { vector: { shapes: false } } });
    expect(v.getViewSettings().snapPicks.vector.shapes).toBe(false);
    expect(v.getViewSettings().snapPicks).toEqual({ ...defaultPicks(), vector: { ...defaultPicks().vector, shapes: false } });
  });
  it('starts from the defaults with nothing saved', async () => {
    const v = await load(undefined);
    expect(v.getViewSettings().snapPicks).toEqual(defaultPicks());
  });
});
