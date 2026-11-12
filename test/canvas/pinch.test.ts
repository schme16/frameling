import { describe, expect, it, vi } from 'vitest';
import { attachPinch, hasGestureEvents, pinchStep } from '../../src/canvas/pinch';
import { zoomAbout } from '../../src/canvas/view';

/** A bare element: it only needs to take listeners and say where it is. */
function fakeEl() {
  const on = new Map<string, (e: Event) => void>();
  const el = {
    added: [] as string[],
    addEventListener: (t: string, fn: (e: Event) => void, o?: unknown) => (on.set(t, fn), el.added.push(`${t}:${JSON.stringify(o)}`)),
    removeEventListener: (t: string) => void on.delete(t),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
    fire: (t: string, e: Record<string, unknown>) => {
      const ev = { preventDefault: vi.fn(), ...e } as unknown as Event;
      on.get(t)?.(ev);
      return ev;
    },
    count: () => on.size,
  };
  return el;
}

describe('pinch scale to zoom', () => {
  it('turns the scale since the start into the step since the last event', () => {
    expect(pinchStep(1, 1.25)).toBeCloseTo(1.25);
    expect(pinchStep(1.25, 1.5)).toBeCloseTo(1.2);
    expect(pinchStep(1.5, 0.75)).toBeCloseTo(0.5);
  });
  it('ignores scales that make no sense', () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(pinchStep(1, bad)).toBe(1);
    expect(pinchStep(0, 2)).toBe(1);
    expect(pinchStep(NaN, 2)).toBe(1);
  });
  it('steps multiply back up to the final scale, so a whole pinch zooms by exactly that scale', () => {
    let last = 1;
    let zoom = 2;
    for (const s of [1.1, 1.4, 1.9, 2.5, 3]) {
      zoom *= pinchStep(last, s);
      last = s;
    }
    expect(zoom).toBeCloseTo(6);
  });
  it('keeps the point under the fingers still, like the wheel does', () => {
    const v = { zoom: 1, panX: 50, panY: 30 };
    const z = zoomAbout(v, v.zoom * pinchStep(1, 2), 300, 200);
    expect(z.zoom).toBe(2);
    expect((300 - z.panX) / z.zoom).toBeCloseTo((300 - v.panX) / v.zoom);
    expect((200 - z.panY) / z.zoom).toBeCloseTo((200 - v.panY) / v.zoom);
  });
});

describe('pinch handlers', () => {
  it('only attach where GestureEvent exists (Safari)', () => {
    expect(hasGestureEvents({})).toBe(false);
    expect(hasGestureEvents({ GestureEvent: class {} })).toBe(true);
    const el = fakeEl();
    expect(attachPinch(el as unknown as HTMLElement, () => {}, {})).toBeNull();
    expect(el.count()).toBe(0);
    const off = attachPinch(el as unknown as HTMLElement, () => {}, { GestureEvent: class {} });
    expect(off).toBeTypeOf('function');
    expect(el.count()).toBe(3);
    off!();
    expect(el.count()).toBe(0);
  });
  it('listens non-passively and cancels all three events so the page does not zoom', () => {
    const el = fakeEl();
    attachPinch(el as unknown as HTMLElement, () => {}, { GestureEvent: class {} });
    expect(el.added.every((a) => a.endsWith('{"passive":false}'))).toBe(true);
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      const ev = el.fire(t, { scale: 1.2, clientX: 5, clientY: 5 });
      expect(ev.preventDefault).toHaveBeenCalled();
    }
  });
  it('reports each change as a factor at the pointer, starting again at each pinch', () => {
    const el = fakeEl();
    const seen: number[][] = [];
    attachPinch(el as unknown as HTMLElement, (f, x, y) => seen.push([f, x, y]), { GestureEvent: class {} });
    el.fire('gesturestart', { scale: 1 });
    el.fire('gesturechange', { scale: 1.5, clientX: 100, clientY: 80 });
    el.fire('gesturechange', { scale: 3, clientX: 110, clientY: 82 });
    el.fire('gestureend', { scale: 3 });
    el.fire('gesturestart', { scale: 1 });
    el.fire('gesturechange', { scale: 0.5, clientX: 1, clientY: 2 });
    expect(seen).toEqual([[1.5, 100, 80], [2, 110, 82], [0.5, 1, 2]]);
  });
  it('falls back to the middle of the element when the event has no position', () => {
    const el = fakeEl();
    const seen: number[][] = [];
    attachPinch(el as unknown as HTMLElement, (f, x, y) => seen.push([f, x, y]), { GestureEvent: class {} });
    el.fire('gesturestart', { scale: 1 });
    el.fire('gesturechange', { scale: 2 });
    expect(seen).toEqual([[2, 110, 70]]);
  });
  it('does nothing for a change that does not change anything', () => {
    const el = fakeEl();
    const onZoom = vi.fn();
    attachPinch(el as unknown as HTMLElement, onZoom, { GestureEvent: class {} });
    el.fire('gesturestart', { scale: 1 });
    el.fire('gesturechange', { scale: 1, clientX: 1, clientY: 1 });
    expect(onZoom).not.toHaveBeenCalled();
  });
});
