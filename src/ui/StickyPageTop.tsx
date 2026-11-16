// The top of a Preferences page that stays put while the page scrolls: a way back and what you are looking at. It has
// a fill of its own (so nothing scrolls under the words), sits flush against the top of the page, and only draws a
// line and a soft shadow once something has actually scrolled beneath it. Pages with a long scroll below a header use
// this rather than a one-off; the scroller is the `.ui-prefs-page` around it.
import { useEffect, useRef, type ReactNode } from 'react';

/** How far the page has to scroll before the header counts as having something under it. */
export const STUCK_AFTER = 1;

export const isStuck = (scrollTop: number): boolean => scrollTop > STUCK_AFTER;

export function StickyPageTop({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const page = el?.closest<HTMLElement>('.ui-prefs-page');
    if (!el || !page) return;
    const update = () => {
      if (isStuck(page.scrollTop)) el.dataset.stuck = '';
      else delete el.dataset.stuck;
    };
    // Other things that stick below it (a side column) need to know how tall it is, and scrolling to a row must land under it.
    // (It overlaps the page's own top padding, so that part isn't counted.)
    const measure = () => page.style.setProperty('--page-top-h', `${el.offsetHeight - (parseFloat(getComputedStyle(page).paddingTop) || 0)}px`);
    update();
    measure();
    page.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      page.removeEventListener('scroll', update);
      ro?.disconnect();
      page.style.removeProperty('--page-top-h');
    };
  }, []);
  return (
    <div ref={ref} className={`ui-page-top${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
