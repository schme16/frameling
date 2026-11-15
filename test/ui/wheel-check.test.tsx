// @vitest-environment jsdom
// The Diagnostics mouse wheel readout: it must say what the mouse really reported and what the canvas does with it,
// because the whole point is settling an argument about zoom speed without anybody guessing.
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WheelCheck } from '../../src/tablet/check/WheelCheck';
import { wheelZoomFactor } from '../../src/canvas/view';
import { resetSharedNotch } from '../../src/canvas/wheelNotch';
import { setChoice } from '../../src/core/choices';

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<WheelCheck />));
  return { host, root };
}

beforeEach(() => {
  resetSharedNotch();
  for (const id of ['canvas.wheel', 'canvas.wheelCtrl', 'canvas.zoomSpeed']) setChoice(id, undefined);
});

const scroll = (host: HTMLElement, deltaY: number, deltaMode = 0, ctrlKey = false) => {
  const box = host.querySelector('[data-testid="wheel-check"]')!;
  act(() => {
    box.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, ctrlKey, bubbles: true, cancelable: true }));
  });
};
const read = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

describe('the mouse wheel readout', () => {
  it('asks you to scroll before it has seen anything', () => {
    const { host, root } = mount();
    expect(host.textContent).toContain('Scroll here');
    act(() => root.unmount());
  });

  it('says what the mouse reported, in its own units', () => {
    const { host, root } = mount();
    // The real signed reading, not a tidied one: a diagnostic that rounds off the truth is no use.
    scroll(host, -100, 0);
    expect(read(host, 'wheel-delta')).toBe('-100.0 pixels');
    scroll(host, 3, 1);
    expect(read(host, 'wheel-delta')).toBe('3.0 lines');
    scroll(host, 1, 2);
    expect(read(host, 'wheel-delta')).toBe('1.0 pages');
    act(() => root.unmount());
  });

  it('works the zoom out with the canvas own maths, so the two can never drift apart', () => {
    const { host, root } = mount();
    scroll(host, -100, 0);
    const expected = Math.round((wheelZoomFactor(-100, 0, 'normal') - 1) * 100);
    expect(read(host, 'wheel-zoom')).toContain(`+${expected}%`);
    // An ordinary wheel should be a modest step; this is the number the complaint was about.
    expect(expected).toBeLessThan(40);
    act(() => root.unmount());
  });

  it('counts a burst, which is how a high-resolution wheel gives itself away', () => {
    const { host, root } = mount();
    scroll(host, -12, 0);
    expect(read(host, 'wheel-burst')).toBe('1');
    scroll(host, -12, 0);
    scroll(host, -12, 0);
    expect(read(host, 'wheel-burst')).toBe('3');
    act(() => root.unmount());
  });

  it('shows the screen scaling, since that is what can multiply the reading', () => {
    const { host, root } = mount();
    scroll(host, -100, 0);
    expect(read(host, 'wheel-dpr')).toBe(String(window.devicePixelRatio));
    act(() => root.unmount());
  });

  it('keeps the last few events, newest first, and counts a pinch as one', () => {
    const { host, root } = mount();
    const box = host.querySelector('[data-testid="wheel-check"]')!;
    for (let i = 0; i < 8; i++) scroll(host, -100 - i, 0);
    const rows = host.querySelectorAll('[data-testid="wheel-history"] tbody tr');
    expect(rows.length).toBe(6);
    expect(rows[0].textContent).toContain('-107.0 pixels');
    act(() => {
      box.dispatchEvent(new WheelEvent('wheel', { deltaY: -2.37, deltaMode: 0, ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(read(host, 'wheel-kind')).toBe('a trackpad pinch');
    act(() => root.unmount());
  });

  it('says so when your notch is not the usual 100, because that explains everything after it', () => {
    const { host, root } = mount();
    scroll(host, -100, 0);
    expect(host.querySelector('[data-testid="wheel-unusual"]')).toBeNull();
    expect(read(host, 'wheel-notch')).toBe('100 pixels');
    act(() => root.unmount());
    resetSharedNotch();
    const again = mount();
    for (let i = 0; i < 4; i++) scroll(again.host, -45, 0);
    expect(read(again.host, 'wheel-notch')).toBe('45 pixels (the usual is 100)');
    expect(read(again.host, 'wheel-unusual')).toContain('yours says 45');
    // A notch is a quarter, whatever the wheel calls a notch.
    expect(read(again.host, 'wheel-zoom')).toBe('+25% a notch (+25% with Ctrl held)');
    act(() => again.root.unmount());
  });

  it('shows what Ctrl did to the event as well as to the zoom: the mouse says the same, the step can differ', () => {
    setChoice('canvas.wheelCtrl', 'bigger');
    const { host, root } = mount();
    for (let i = 0; i < 4; i++) scroll(host, -45, 0);
    expect(read(host, 'wheel-ctrl')).toBe('No');
    scroll(host, -45, 0, true);
    // Same 45 pixels, a bigger step.
    expect(read(host, 'wheel-delta')).toBe('-45.0 pixels');
    expect(read(host, 'wheel-ctrl')).toContain('bigger step');
    const rows = host.querySelectorAll('[data-testid="wheel-history"] tbody tr');
    expect(rows[0].textContent).toContain('coarse');
    expect(rows[0].textContent).toContain('+62%');
    expect(rows[1].textContent).toContain('normal');
    expect(rows[1].textContent).toContain('+25%');
    act(() => root.unmount());
  });

  it('with Ctrl set to zoom the same, the Ctrl event is the same zoom and says so', () => {
    setChoice('canvas.wheelCtrl', 'same');
    const { host, root } = mount();
    for (let i = 0; i < 4; i++) scroll(host, -45, 0);
    scroll(host, -45, 0, true);
    expect(read(host, 'wheel-ctrl')).toContain('zooms the same');
    const rows = host.querySelectorAll('[data-testid="wheel-history"] tbody tr');
    expect(rows[0].textContent).toContain('+25%');
    act(() => root.unmount());
  });

  it('says the wheel slides the page, not zooms, when the wheel is set to scroll', () => {
    setChoice('canvas.wheel', 'scroll');
    const { host, root } = mount();
    scroll(host, -100, 0);
    expect(read(host, 'wheel-zoom')).toContain('slides the page');
    act(() => root.unmount());
  });
});
