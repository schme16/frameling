// @vitest-environment jsdom
// The Preview follows the boards: frames on boards play in order as one animation with a board strip, sprites on a
// sheet play the open sprite with a picker, and everything else plays as before.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/pixel';
import { resetStore, store } from '../../src/core/store';
import { activeId, artboardsOf } from '../../src/artboards/model';
import { goToArtboard } from '../../src/artboards/ops';
import { PreviewPanel } from '../../src/pixel/PreviewPanel';
import { boardSlots, pickSprite, pinnedBoard, previewKind, previewPin, slotAt, slotsLength } from '../../src/pixel/previewBoards';
import { setPreview } from '../../src/pixel/preview';
import { newSpriteDoc } from '../../src/pixel/way';
import { installFakeCanvas, removeFakeCanvas } from '../perf/fakeCanvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('boards as one animation (pure)', () => {
  it('works out the kind from the way', () => {
    expect(previewKind(newSpriteDoc({ way: 'boards', width: 8, height: 8 }))).toBe('boards');
    expect(previewKind(newSpriteDoc({ way: 'sheet', width: 8, height: 8 }))).toBe('sprites');
    expect(previewKind(newSpriteDoc({ way: 'animation', width: 8, height: 8 }))).toBe('plain');
    expect(previewKind(newSpriteDoc({ way: 'picture', width: 8, height: 8 }))).toBe('plain');
  });
  it('lays the boards end to end using each board length', () => {
    const doc = newSpriteDoc({ way: 'boards', width: 8, height: 8 });
    const list = artboardsOf(doc);
    list[1].content!.length = 3;
    const slots = boardSlots(doc);
    expect(slots.map((s) => s.length)).toEqual(list.map((_, i) => (i === 1 ? 3 : 1)));
    expect(slots[2].start).toBe(4);
    expect(slotsLength(slots)).toBe(list.length + 2);
    expect(slotAt(slots, 0)).toEqual({ index: 0, local: 0 });
    expect(slotAt(slots, 3)).toEqual({ index: 1, local: 2 });
    expect(slotAt(slots, 4)).toEqual({ index: 2, local: 0 });
  });
  it('picking a sprite pins it, picking it again or the open one follows the open board', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 8, height: 8 });
    const [a, b] = artboardsOf(doc);
    pickSprite(doc, a.id, b.id);
    expect(pinnedBoard(doc, previewPin.get())).toBe(b.id);
    pickSprite(doc, a.id, b.id);
    expect(pinnedBoard(doc, previewPin.get())).toBeNull();
    pickSprite(doc, a.id, b.id);
    pickSprite(doc, a.id, a.id);
    expect(pinnedBoard(doc, previewPin.get())).toBeNull();
  });
});

describe('the Preview panel', () => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  let frameCbs: ((t: number) => void)[] = [];
  let clock = 0;
  const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  const tickFrames = async (ms: number) => {
    await act(async () => {
      clock += ms;
      const cbs = frameCbs;
      frameCbs = [];
      cbs.forEach((cb) => cb(clock));
    });
  };
  const mount = async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<PreviewPanel />));
    await flush();
  };
  const chips = () => [...host!.querySelectorAll<HTMLButtonElement>('.px-preview-board')];
  const on = () => chips().filter((c) => c.dataset.on === 'true').map((c) => c.getAttribute('aria-label'));
  const info = () => host!.querySelector('.px-preview-info')!.textContent!;

  beforeEach(() => {
    installFakeCanvas();
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? null : () => {}), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frameCbs = [];
    clock = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frameCbs.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    previewPin.set({ docId: '', id: null });
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    host = root = null;
    vi.restoreAllMocks();
    removeFakeCanvas();
    setPreview({ playing: true });
  });

  it('frames on boards: a strip with every board, playing them in order', async () => {
    setPreview({ playing: true, loop: true });
    resetStore(newSpriteDoc({ way: 'boards', width: 8, height: 8, fps: 10 }));
    await mount();
    const names = artboardsOf(store().rootDoc()).map((b) => b.name);
    expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(names);
    expect(on()).toEqual([names[0]]);
    expect(info()).toContain(`frame 1 of ${names.length}`);
    await tickFrames(250);
    expect(on()).toEqual([names[2]]);
    expect(info()).toContain(`frame 3 of ${names.length}`);
    expect(host!.querySelector('[aria-label="What the preview plays"]')).toBeNull();
  });

  it('clicking a board while playing jumps there; while paused it opens that board', async () => {
    setPreview({ playing: true, loop: true });
    resetStore(newSpriteDoc({ way: 'boards', width: 8, height: 8, fps: 10 }));
    await mount();
    const ids = artboardsOf(store().rootDoc()).map((b) => b.id);
    await act(async () => chips()[3].click());
    await flush();
    expect(on()).toEqual([chips()[3].getAttribute('aria-label')]);
    expect(activeId(store().rootDoc())).toBe(ids[0]);
    await act(async () => setPreview({ playing: false }));
    await flush();
    await act(async () => chips()[2].click());
    await flush();
    expect(activeId(store().rootDoc())).toBe(ids[2]);
    expect(on()).toEqual([chips()[2].getAttribute('aria-label')]);
  });

  it('sprites on a sheet: a picker, the open sprite plays until another is picked', async () => {
    setPreview({ playing: false });
    resetStore(newSpriteDoc({ way: 'sheet', width: 8, height: 8 }));
    await mount();
    const list = artboardsOf(store().rootDoc());
    expect(chips().map((c) => c.textContent)).toEqual(list.map((b) => b.name));
    expect(on()).toEqual([list[0].name]);
    expect(info()).toContain(`${list[0].name}, `);
    await act(async () => chips()[1].click());
    await flush();
    expect(on()).toEqual([list[1].name]);
    expect(info()).toContain(`${list[1].name}, `);
    expect(activeId(store().rootDoc())).toBe(list[0].id);
    // The open sprite stays marked.
    expect(chips()[0].dataset.open).toBe('true');
    await act(async () => chips()[1].click());
    await flush();
    expect(on()).toEqual([list[0].name]);
  });

  it('one board, or an animation: no strip, the range switch stays', async () => {
    resetStore(newSpriteDoc({ way: 'animation', width: 8, height: 8 }));
    await mount();
    expect(chips().length).toBe(0);
    expect(host!.querySelector('[aria-label="What the preview plays"]')).not.toBeNull();
  });

  it('paused, it shows the open board in the long animation', async () => {
    setPreview({ playing: false });
    resetStore(newSpriteDoc({ way: 'boards', width: 8, height: 8 }));
    await mount();
    const id = artboardsOf(store().rootDoc())[2].id;
    await act(async () => goToArtboard(id));
    await flush();
    expect(on()).toEqual([artboardsOf(store().rootDoc())[2].name]);
  });
});
