// @vitest-environment jsdom
// Clip chips never overlap their neighbours, stay reachable by keyboard, and picking one never hides Preview.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { CHIP_FULL_W, CHIP_ICON_W, chipBox, chipMode } from '../../src/timeline/clipLayout';
import { ClipsRow, pickClip } from '../../src/timeline/Grid';
import { setTl, tl } from '../../src/timeline/state';
import { dock, resetDock, setActive, showPanelGently } from '../../src/ui/dock';
import { coveredBy, emptyLayout, type Layout } from '../../src/ui/dockModel';
import { toasts } from '../../src/ui/toast';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('chip boxes', () => {
  it('pick a look by the room the frames give', () => {
    expect(chipMode(CHIP_FULL_W)).toBe('full');
    expect(chipMode(CHIP_FULL_W - 1)).toBe('icon');
    expect(chipMode(CHIP_ICON_W)).toBe('icon');
    expect(chipMode(CHIP_ICON_W - 1)).toBe('bar');
  });

  it('never run into a neighbour at any zoom, however short the clips', () => {
    const clips = [
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 6 },
      { start: 7, end: 7 },
      { start: 8, end: 20 },
    ];
    for (const cw of [5, 8, 12, 22, 40, 64]) {
      const boxes = clips.map((c) => chipBox(c, cw));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1].left + boxes[i - 1].width).toBeLessThanOrEqual(boxes[i].left);
      for (const b of boxes) expect(b.width).toBeGreaterThan(0);
    }
  });

  it('keep resize edges only where a chip has room for them', () => {
    expect(chipBox({ start: 0, end: 9 }, 22).edge).toBeGreaterThan(0);
    expect(chipBox({ start: 0, end: 0 }, 10).edge).toBe(0);
  });
});

describe('the clips lane', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    setTl({ clipId: null, cw: 22 });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const setup = () => {
    const s = resetStore(docWith([[0, 6]], 12));
    act(() =>
      s.update('Clips', (d) => {
        d.clips.push({ id: 'a', name: 'Idle', start: 0, end: 0, loop: true }, { id: 'b', name: 'Blink', start: 1, end: 1, loop: false }, { id: 'c', name: 'Run', start: 2, end: 6, loop: true });
      }),
    );
    act(() => root.render(<ClipsRow cw={22} from={0} to={12} h={22} />));
  };
  const chip = (id: string) => host.querySelector<HTMLElement>(`[data-clip="${id}"]`)!;

  it('lays short chips edge to edge, icon only or bare, with the name in the tooltip and label', () => {
    setup();
    const a = chip('a');
    const b = chip('b');
    expect(parseFloat(a.style.left) + parseFloat(a.style.width)).toBeLessThanOrEqual(parseFloat(b.style.left));
    expect(a.dataset.mode).toBe('bar');
    expect(a.querySelector('.tl-clip-name')).toBeNull();
    expect(a.title).toContain('Idle');
    expect(a.getAttribute('aria-label')).toContain('Idle');
    expect(chip('c').dataset.mode).toBe('full');
    expect(chip('c').querySelector('.tl-clip-name')?.textContent).toBe('Run');
  });

  it('can be reached with Tab and picked with Enter or Space, and renamed with F2', () => {
    setup();
    expect(chip('a').tabIndex).toBe(0);
    act(() => void chip('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(tl().clipId).toBe('a');
    act(() => void chip('a').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(tl().clipId).toBeNull();
    act(() => void chip('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })));
    expect(tl().editing).toEqual({ kind: 'clip', id: 'b' });
  });
});

describe('picking a clip and Preview', () => {
  beforeAll(() => {
    const Nothing = () => null;
    registerPanel({ id: 'preview', title: 'Preview', icon: 'play', component: Nothing, zone: 'right', order: 5 });
    registerPanel({ id: 'tool-options', title: 'Tool options', icon: 'settings', component: Nothing, zone: 'right', order: 6 });
    registerPanel({ id: 'clip-play', title: 'Clip', icon: 'timeline', component: Nothing, zone: 'right', order: 7 });
  });
  beforeEach(() => {
    resetDock();
    toasts.set([]);
    setTl({ clipId: null });
  });
  const sect = (id: string) => id === 'clip-play' || id === 'tool-options';
  const groupOf = (l: Layout) => l.zones.right;

  it('coveredBy names what fronting would hide, and nothing when only sections are in front', () => {
    const l = emptyLayout();
    l.zones.right.tabs = ['preview', 'tool-options', 'clip-play'];
    l.zones.right.active = 'preview';
    expect(coveredBy(l, 'clip-play', sect)).toBe('preview');
    l.zones.right.active = 'tool-options';
    expect(coveredBy(l, 'clip-play', sect)).toBeNull();
    l.zones.right.active = 'clip-play';
    expect(coveredBy(l, 'clip-play', sect)).toBeNull();
    expect(coveredBy(l, 'missing', sect)).toBeNull();
  });

  it('brings the Clip section forward over another section', () => {
    const tabs = groupOf(dock.get().layout).tabs;
    setActive('right', 'tool-options');
    expect(tabs).toContain('clip-play');
    expect(showPanelGently('clip-play', sect)).toBeNull();
    expect(dock.get().layout.zones.right.active).toBe('clip-play');
  });

  it('leaves Preview in front, says so once with a way to the Clip settings, and still picks the clip', () => {
    const s = resetStore(docWith([[0, 6]], 12));
    act(() => s.update('Clip', (d) => void d.clips.push({ id: 'a', name: 'Idle', start: 2, end: 4, loop: true })));
    setActive('right', 'preview');
    pickClip('a');
    expect(tl().clipId).toBe('a');
    expect(dock.get().layout.zones.right.active).toBe('preview');
    expect(s.get().ui.frame).toBe(2);
    const t = toasts.get();
    expect(t).toHaveLength(1);
    expect(t[0].message).toBe('Preview stays in front.');
    t[0].action!.run();
    expect(dock.get().layout.zones.right.active).toBe('clip-play');
    // Once only.
    toasts.set([]);
    setActive('right', 'preview');
    pickClip('a');
    pickClip('a');
    pickClip('a');
    expect(dock.get().layout.zones.right.active).toBe('preview');
    expect(toasts.get()).toHaveLength(0);
  });

  it('does not unfold a folded side', () => {
    setActive('right', 'tool-options');
    dock.set({ ...dock.get(), layout: { ...dock.get().layout, zones: { ...dock.get().layout.zones, right: { ...dock.get().layout.zones.right, collapsed: true } } } });
    expect(showPanelGently('clip-play', sect)).toBeNull();
    expect(dock.get().layout.zones.right.collapsed).toBe(true);
  });
});
