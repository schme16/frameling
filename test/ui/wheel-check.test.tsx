// @vitest-environment jsdom
// The Diagnostics mouse wheel readout: it must say what the mouse really reported and what the canvas does with it,
// because the whole point is settling an argument about zoom speed without anybody guessing.
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WheelCheck } from '../../src/tablet/check/WheelCheck';
import { wheelZoomFactor } from '../../src/canvas/view';

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<WheelCheck />));
  return { host, root };
}

const scroll = (host: HTMLElement, deltaY: number, deltaMode = 0) => {
  const box = host.querySelector('[data-testid="wheel-check"]')!;
  act(() => {
    box.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, bubbles: true, cancelable: true }));
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
});
