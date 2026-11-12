// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'frameling.view';

/** The view settings module as a new session would load it, over whatever is in localStorage. */
async function session() {
  vi.resetModules();
  return import('../../src/canvas/viewSettings');
}

beforeEach(() => {
  localStorage.clear();
});

describe('looking through the camera is remembered per artboard between sessions', () => {
  it('survives a restart', async () => {
    const a = await session();
    a.setViewSettings({ throughBy: { 'doc1/ab1': true, 'doc1/ab2': false } });
    const b = await session();
    expect(b.getViewSettings().throughBy).toEqual({ 'doc1/ab1': true, 'doc1/ab2': false });
  });

  it('an older save without it opens with nothing chosen', async () => {
    localStorage.setItem(KEY, JSON.stringify({ pixelGrid: false, throughCamera: true }));
    const v = (await session()).getViewSettings();
    expect(v.throughBy).toEqual({});
    expect(v.throughCamera).toBe(true);
    expect(v.pixelGrid).toBe(false);
  });

  it('a damaged save keeps only true and false choices', async () => {
    localStorage.setItem(KEY, JSON.stringify({ throughBy: { a: true, b: 'yes', c: 3, d: false } }));
    expect((await session()).getViewSettings().throughBy).toEqual({ a: true, d: false });
    localStorage.setItem(KEY, JSON.stringify({ throughBy: [true] }));
    expect((await session()).getViewSettings().throughBy).toEqual({});
  });

  it('keeps only the newest few hundred', async () => {
    const by: Record<string, boolean> = {};
    for (let i = 0; i < 350; i++) by[`d/${i}`] = i % 2 === 0;
    const a = await session();
    a.setViewSettings({ throughBy: by });
    const kept = Object.keys((await session()).getViewSettings().throughBy);
    expect(kept).toHaveLength(300);
    expect(kept[0]).toBe('d/50');
    expect(kept[299]).toBe('d/349');
  });
});
