// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCommand, getPanel, allHelp } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { ROW_H } from '../../src/timeline/Layers';
import { SIDE_W } from '../../src/timeline/Grid';
import { setTl } from '../../src/timeline/state';
import { addCel, docWith, shape } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const CW = 20;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});

beforeEach(() => {
  setTl({ cw: CW, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

function mount(cels: [number, number][] = [[0, 2], [3, 1]], layers = 1) {
  const doc = docWith(cels, 24);
  for (let i = 1; i < layers; i++) {
    doc.layers.push({ ...doc.layers[0], id: `extra${i}`, name: `Extra ${i}`, cels: [] });
  }
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return s;
}

function pointer(el: Element, type: string, x: number, y = 0, extra: PointerEventInit = {}) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, ...extra }));
  });
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;

describe('timeline panel', () => {
  it('registers itself as the bottom panel, with help and commands for every shortcut', () => {
    const p = getPanel('timeline')!;
    expect(p).toMatchObject({ zone: 'bottom', icon: 'timeline', help: 'timeline' });
    for (const id of ['timeline.play', 'timeline.nextFrame', 'timeline.prevKey', 'timeline.newKey', 'timeline.duplicateKey', 'timeline.insertFrame', 'timeline.removeFrame', 'timeline.hold1', 'timeline.hold4', 'timeline.toggleOnion', 'layers.addVector', 'layers.addPixel', 'layers.delete', 'layers.up', 'layers.down', 'layers.toggleVisible', 'layers.toggleLocked']) {
      const c = getCommand(id)!;
      expect(c, id).toBeDefined();
      expect(c.description, id).toBeTruthy();
      expect(c.help, id).toBeTruthy();
    }
    const topics = allHelp().map((t) => t.id);
    for (const t of ['timeline', 'timeline-frames', 'timeline-onion', 'timeline-layers', 'timeline-playing', 'timeline-clips', 'timeline-markers']) expect(topics).toContain(t);
    for (const c of ['timeline.play', 'layers.delete']) expect(topics).toContain(getCommand(c)!.help);
  });

  it('draws the layers (top first), cels and counter', () => {
    mount([[0, 2], [3, 1]], 2);
    const names = [...host.querySelectorAll('.tl-layer-name')].map((n) => n.textContent);
    expect(names).toEqual(['Extra 1', 'Layer 1']);
    expect(host.querySelectorAll('.tl-cel')).toHaveLength(2);
    expect(q('.tl-counter-frame').textContent).toContain('1 / 24');
  });

  it('clicking a cell picks the frame and the layer', () => {
    const s = mount([[0, 2]], 2);
    const rows = q('.tl-rows');
    // top row is the extra layer, frame 5
    pointer(rows, 'pointerdown', CW * 5 + 3, 4);
    pointer(rows, 'pointerup', CW * 5 + 3, 4);
    expect(s.get().ui.frame).toBe(5);
    expect(s.get().ui.activeLayerId).toBe('extra1');
  });

  it('dragging a cel moves it, and the move is one undo step', () => {
    const s = mount([[0, 2]]);
    const cel = q('.tl-cel');
    const y = ROW_H / 2;
    pointer(cel, 'pointerdown', 5, y);
    pointer(cel, 'pointermove', 5 + CW * 4, y);
    expect(host.querySelector('.tl-ghost-cel')).toBeTruthy();
    pointer(cel, 'pointerup', 5 + CW * 4, y);
    expect(shape(s.get().doc.layers[0])).toEqual([[4, 2]]);
    s.undo();
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 2]]);
  });

  it('dragging the right edge changes the hold, and Alt covers what is in the way', () => {
    const s = mount([[0, 2], [3, 2]]);
    const handle = q('.tl-cel-handle');
    pointer(handle, 'pointerdown', CW * 2 - 3, 10);
    pointer(handle, 'pointermove', CW * 4 + 3, 10);
    pointer(handle, 'pointerup', CW * 4 + 3, 10);
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 5], [5, 2]]);
    s.undo();
    const h2 = q('.tl-cel-handle');
    pointer(h2, 'pointerdown', CW * 2 - 3, 10);
    pointer(h2, 'pointermove', CW * 4 + 3, 10, { altKey: true });
    pointer(h2, 'pointerup', CW * 4 + 3, 10, { altKey: true });
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 5]]);
  });

  it('a plain click on a cel does not move it', () => {
    const s = mount([[0, 2]]);
    const cel = q('.tl-cel');
    pointer(cel, 'pointerdown', 25, 10);
    pointer(cel, 'pointerup', 25, 10);
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 2]]);
    expect(s.get().ui.frame).toBe(1);
  });

  it('scrubs along the ruler and stops playback', () => {
    const s = mount();
    s.setUi({ playing: true });
    const ruler = q('.tl-ruler');
    pointer(ruler, 'pointerdown', CW * 3 + 2);
    expect(s.get().ui.frame).toBe(3);
    expect(s.get().ui.playing).toBe(false);
    pointer(ruler, 'pointermove', CW * 9 + 2);
    pointer(ruler, 'pointerup', CW * 9 + 2);
    expect(s.get().ui.frame).toBe(9);
  });

  it('drags the end of the ruler to change the length', () => {
    const s = mount();
    const h = q('.tl-length');
    pointer(h, 'pointerdown', CW * 24);
    pointer(h, 'pointermove', CW * 40);
    pointer(h, 'pointerup', CW * 40);
    expect(s.get().doc.length).toBe(40);
  });

  it('double-click adds a marker and Enter names it', () => {
    const s = mount();
    const marks = q('.tl-marks');
    act(() => {
      marks.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: CW * 6 + 2, clientY: 0 }));
    });
    expect(s.get().doc.markers).toHaveLength(1);
    expect(s.get().doc.markers[0].frame).toBe(6);
    const input = q<HTMLInputElement>('.tl-marker input');
    expect(input).toBeTruthy();
    act(() => {
      input.value = 'Footstep';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(s.get().doc.markers[0].name).toBe('Footstep');
    expect(host.querySelector('.tl-marker input')).toBeNull();
  });

  it('dragging in the clips row makes a clip and asks for a name; clicking it picks it as the play range', () => {
    const s = mount();
    const clips = q('.tl-clips');
    pointer(clips, 'pointerdown', CW * 2 + 2);
    pointer(clips, 'pointermove', CW * 6 + 2);
    pointer(clips, 'pointerup', CW * 6 + 2);
    expect(s.get().doc.clips[0]).toMatchObject({ start: 2, end: 6 });
    const input = q<HTMLInputElement>('.tl-clip input');
    act(() => {
      input.value = 'Walk';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(s.get().doc.clips[0].name).toBe('Walk');
    const clip = q('.tl-clip');
    pointer(clip, 'pointerdown', CW * 3);
    pointer(clip, 'pointerup', CW * 3);
    expect(q('.tl-range').textContent).toContain('Walk');
    expect(s.get().ui.frame).toBe(2);
    pointer(clip, 'pointerdown', CW * 3);
    pointer(clip, 'pointerup', CW * 3);
    expect(host.querySelector('.tl-range')).toBeNull();
  });

  it('the clip menu sets which way it plays and how often, and the clip shows a sign for it', () => {
    const s = mount();
    act(() => s.update('Clip', (d) => void d.clips.push({ id: 'k1', name: 'Bounce', start: 2, end: 6, loop: true })));
    const open = () => act(() => void q('.tl-clip').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: CW * 3, clientY: 5 })));
    const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.tl-menu-item')].find((b) => b.textContent!.includes(label))!;
    open();
    const words = [...document.querySelectorAll('.tl-menu-heading, .tl-menu-item')].map((e) => e.textContent!.replace('✓', '').trim());
    expect(words).toEqual(expect.arrayContaining(['Plays', 'Forward', 'Backward (reverse)', 'Back and forth', 'Back and forth, backward first', 'Repeat', 'Forever (loops)', 'Once (then holds the last frame)']));
    expect(item('Forward').textContent).toContain('✓');
    act(() => item('Back and forth').click());
    expect(s.get().doc.clips[0].direction).toBe('pingpong');
    expect(host.querySelector('.tl-clip svg')).toBeTruthy();
    open();
    expect([...document.querySelectorAll('.tl-menu-heading')].map((e) => e.textContent)).toContain('Repeat 3 = there, back, there');
    act(() => item('There only').click());
    expect(s.get().doc.clips[0]).toMatchObject({ loop: false });
    open();
    const box = document.querySelector<HTMLInputElement>('.tl-menu-times input')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(box, '3');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(s.get().doc.clips[0]).toMatchObject({ loop: false, repeat: 3, direction: 'pingpong' });
    expect(q('.tl-clip-times').textContent).toBe('x3');
  });

  it('the palette commands change the picked clip', () => {
    const s = mount();
    s.update('Clip', (d) => void d.clips.push({ id: 'k1', name: 'Bounce', start: 2, end: 6, loop: true }));
    const cmd = (id: string) => getCommand(id)!;
    expect(cmd('timeline.clipBackAndForth').enabled?.(s.get())).toBe(false);
    setTl({ clipId: 'k1' });
    expect(cmd('timeline.clipBackAndForth').enabled?.(s.get())).toBe(true);
    expect(cmd('timeline.clipForward').checked?.(s.get())).toBe(true);
    act(() => void cmd('timeline.clipBackward').run());
    expect(s.get().doc.clips[0].direction).toBe('reverse');
    expect(cmd('timeline.clipBackward').checked?.(s.get())).toBe(true);
    act(() => void cmd('timeline.clipOnce').run());
    expect(s.get().doc.clips[0].loop).toBe(false);
    act(() => void cmd('timeline.clipForever').run());
    expect(s.get().doc.clips[0].loop).toBe(true);
    act(() => void cmd('timeline.clipForward').run());
    expect(s.get().doc.clips[0].direction).toBeUndefined();
  });

  it('layer buttons: eye, lock, add vector and pixel, duplicate, delete', () => {
    const s = mount();
    const click = (el: Element) => act(() => (el as HTMLElement).click());
    click(q('[aria-label="Hide layer"]'));
    expect(s.get().doc.layers[0].visible).toBe(false);
    click(q('[aria-label="Lock layer"]'));
    expect(s.get().doc.layers[0].locked).toBe(true);
    click(q('[aria-label="Add vector layer"]'));
    click(q('[aria-label="Add pixel layer"]'));
    expect(s.get().doc.layers.map((l) => l.kind)).toEqual(['vector', 'vector', 'pixel']);
    expect(host.querySelectorAll('.tl-layer')).toHaveLength(3);
    click(q('[aria-label="Duplicate layer"]'));
    expect(s.get().doc.layers).toHaveLength(4);
    click(q('[aria-label="Delete layer"]'));
    expect(s.get().doc.layers).toHaveLength(3);
  });

  it('double-click renames a layer', () => {
    const s = mount();
    act(() => {
      q('.tl-layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const input = q<HTMLInputElement>('.tl-layer input');
    act(() => {
      input.value = 'Body';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(s.get().doc.layers[0].name).toBe('Body');
  });

  it('the right-click menu has the plain-word ops and they work', () => {
    const s = mount([[0, 3]]);
    const rows = q('.tl-rows');
    act(() => {
      rows.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: CW * 1 + 2, clientY: 5 }));
    });
    const item = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.tl-menu-item')].find((b) => b.textContent!.includes(label))!;
    expect(item('New blank drawing here')).toBeTruthy();
    expect(item('Hold for 2 frames (on twos)')).toBeTruthy();
    act(() => item('Hold for 2 frames (on twos)').click());
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 2]]);
    expect(document.querySelector('.tl-menu')).toBeNull();
  });

  it('header buttons drive playback, hold and onion', () => {
    const s = mount([[0, 1]]);
    const click = (sel: string) => act(() => q(sel).click());
    click('[aria-label="Forward one frame"]');
    expect(s.get().ui.frame).toBe(1);
    click('[aria-label="Go to the last frame"]');
    expect(s.get().ui.frame).toBe(23);
    click('[aria-label="Go to the first frame"]');
    click('[aria-label="Hold this drawing for 3 frames (on threes)"]');
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 3]]);
    click('[aria-label="See the frames around this one (onion skin)"]');
    expect(s.get().ui.onion.enabled).toBe(true);
    expect(host.querySelector('.tl-onion-shade')).toBeTruthy();
    click('[aria-label="Play"]');
    expect(s.get().ui.playing).toBe(true);
    click('[aria-label="Pause"]');
    expect(s.get().ui.playing).toBe(false);
  });

  it('fps field sets the speed', () => {
    const s = mount();
    const input = q<HTMLInputElement>('.tl-fps input');
    act(() => input.focus());
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, '24');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.blur());
    expect(s.get().doc.fps).toBe(24);
  });

  it('keeps a 600 frame, 20 layer animation cheap: only what is on screen is drawn', () => {
    const doc = docWith([], 600);
    for (let i = 0; i < 19; i++) doc.layers.push({ ...doc.layers[0], id: `x${i}`, name: `L${i}`, cels: [] });
    for (const l of doc.layers) for (let f = 0; f < 600; f += 2) addCel(doc, l, f, 2);
    resetStore(doc);
    const t0 = performance.now();
    act(() => root.render(<TimelinePanel />));
    const drawn = host.querySelectorAll('.tl-cel').length;
    expect(drawn).toBeLessThan(20 * 60);
    expect(drawn).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(2000);
    void SIDE_W;
  });
});
