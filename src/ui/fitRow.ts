// A row of buttons keeps every label on one line. When the row is too narrow for that, it stacks one button per line on
// purpose (data-stacked), instead of breaking the words or letting the row run out of its box. One rule, used by every
// pick-one row (the tool options, Preferences, the dialogs); the no-wrap check (scripts/e2e/no-wrap.cjs) holds it to that.
import { useLayoutEffect, type RefObject } from 'react';

/** True when a row's contents are wider than the row: the words do not all fit side by side. */
export function overflows(m: { scrollWidth: number; clientWidth: number }): boolean {
  return m.scrollWidth > m.clientWidth + 1;
}

/**
 * Stacks the row (data-stacked="true") while its buttons do not fit side by side, and sets it back the moment they do.
 * It measures as a row each time, before the browser paints, so nothing flickers and nothing jumps while a panel is
 * dragged wider and narrower: the row simply flips once, at the width where the words stop fitting.
 */
export function useStackWhenTight(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = []): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.removeAttribute('data-stacked');
      if (overflows(el)) el.setAttribute('data-stacked', 'true');
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      // Only a change of width matters: stacking changes the height, which must not start it all again.
      const now = el.getBoundingClientRect().width;
      if (Math.abs(now - width) < 0.5) return;
      width = now;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
