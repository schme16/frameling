// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allPrefRows, mascotRows } from '../../src/ui/prefsIndex';
import { MascotRow } from '../../src/ui/mascot/MascotRow';
import { registerMascot } from '../../src/ui/mascot/mascots';
import { loadQuill, onMascotSwitched, quillSheet, resetQuillLoader } from '../../src/ui/mascot/runtime';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { FAKE_SHEET } from '../fixtures/quill-sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the picker', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    resetPrefs();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetPrefs();
  });

  it('is not shown while there is only one mascot, since a choice of one looks broken', () => {
    act(() => root.render(<MascotRow />));
    expect(host.textContent).toBe('');
  });

  it('shows up, listing everyone, once there is a second', () => {
    const undo = registerMascot({ id: 'other', name: 'Other', blurb: '', sheetUrl: 'o.png', metaUrl: 'o.json' });
    act(() => root.render(<MascotRow />));
    expect(host.textContent).toContain('Your guide');
    expect(host.textContent).toContain('Quill');
    expect(host.textContent).toContain('Other');
    undo();
  });

  it('is in Preferences search only when it is on the page', () => {
    expect(mascotRows()).toEqual([]);
    expect(allPrefRows().some((r) => r.label === 'Your guide')).toBe(false);
    const undo = registerMascot({ id: 'other', name: 'Other', blurb: '', sheetUrl: 'o.png', metaUrl: 'o.json' });
    expect(allPrefRows().some((r) => r.label === 'Your guide')).toBe(true);
    undo();
  });
});

describe('switching the mascot while the app runs', () => {
  const realFetch = globalThis.fetch;
  const RealImage = globalThis.Image;
  const asked: string[] = [];

  beforeEach(() => {
    resetPrefs();
    resetQuillLoader();
    asked.length = 0;
    globalThis.fetch = vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => FAKE_SHEET };
    }) as unknown as typeof fetch;
    // An image that "loads" as soon as it has somewhere to load from.
    globalThis.Image = class {
      naturalWidth = 128;
      naturalHeight = 512;
      onload: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    } as unknown as typeof Image;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.Image = RealImage;
    resetQuillLoader();
    resetPrefs();
  });

  it('loads the sheet of the mascot chosen, and the old one is not asked for again', async () => {
    const undo = registerMascot({ id: 'other', name: 'Other', blurb: '', sheetUrl: 'mascot/other.png', metaUrl: 'mascot/other.json' });
    setPrefs({ mascot: 'other' });
    loadQuill();
    await flush();
    await flush();
    expect(asked).toEqual(['mascot/other.json']);
    expect(quillSheet.get()?.url).toBe('mascot/other.png');
    undo();
  });

  it('tells the pet when a different mascot has replaced the one on screen', async () => {
    const undo = registerMascot({ id: 'other', name: 'Other', blurb: '', sheetUrl: 'mascot/other.png', metaUrl: 'mascot/other.json' });
    const done = vi.fn();
    const off = onMascotSwitched(done);
    loadQuill(); // Quill, the first load: nobody is told.
    await flush();
    await flush();
    expect(quillSheet.get()?.url).toBe('mascot/mascot.png');
    expect(done).not.toHaveBeenCalled();
    setPrefs({ mascot: 'other' });
    await flush();
    await flush();
    expect(quillSheet.get()?.url).toBe('mascot/other.png');
    expect(done).toHaveBeenCalledTimes(1);
    off();
    undo();
  });
});
